import { create } from 'zustand';
import type {
  MyDayContextPreview,
  MyDayNotSelected,
  MyDayPlanProposal,
  MyDaySubtaskPickInput,
} from '../domain/models/ai';
import { aiFailureMessage } from '../lib/aiErrors';
import { todayISO } from '../lib/date';

/**
 * 今日行动建议会话 store:与 breakdownStore 同一模式——按本地日期键控,
 * 生成请求与草稿跨页面存活,面板只是视图;切走再回能看到进行中请求或上次结果。
 * 跨日本话自然过期(新日期是新键),未采纳预览不落库,重启即弃。
 */
export type MyDayPlanStatus = 'idle' | 'preparing' | 'ready' | 'generating' | 'done' | 'error';

export interface DraftMyDayAction {
  root_task_id: string;
  root_title: string;
  target_subtask_id: string | null;
  subtask_title: string | null;
  already_in_my_day: boolean;
  reason: string;
  next_step: string;
  stop_at: string;
  selected: boolean;
  /** 生成时该项属于必做约束:采纳摘要需明确显示用户最终取消的必做项 */
  was_mandatory: boolean;
}

export interface MyDayPlanSession {
  date: string;
  status: MyDayPlanStatus;
  contextId: string | null;
  preview: MyDayContextPreview | null;
  /** 本次候选对应的标签范围(排序后记录);面板据此判断切换回来时是否需要重新准备 */
  preparedTagIds: string[];
  /** 手动补入的任务(属于当前范围,因数量上限遗漏或用户指定);范围变化时重置 */
  manualTaskIds: string[];
  /** 用户替换纳入的子任务选择;范围变化时重置 */
  subtaskPicks: MyDaySubtaskPickInput[];
  focusNote: string;
  targetCount: number;
  mandatory: string[];
  excluded: string[];
  drafts: DraftMyDayAction[];
  assumptions: string[];
  notSelected: MyDayNotSelected[];
  requestId: string | null;
  proposalId: string | null;
  modelSnapshot: string | null;
  /** 采纳幂等键:同一候选生命周期内稳定,超时重试安全 */
  operationId: string;
  /** 准备候选时拿到的计划版本基准,采纳时作为期望版本 */
  baseRevision: number;
  /** 发起时间戳(ms):生成中计算已等待秒数,重进页面不重置 */
  startedAt: number;
  error: string | null;
}

interface MyDayPlanStore {
  sessions: Record<string, MyDayPlanSession>;
  prepare(date: string, input: { tagIds?: string[]; manualTaskIds?: string[] }): Promise<void>;
  generate(date: string): Promise<void>;
  setFocusNote(date: string, note: string): void;
  setTargetCount(date: string, count: number): void;
  toggleMandatory(date: string, taskId: string): void;
  toggleExcluded(date: string, taskId: string): void;
  /** 手动补入范围内未带入的任务(重新准备后进入候选并排在最前) */
  addManualTask(date: string, taskId: string): Promise<void>;
  /** 撤销手动补入 */
  removeManualTask(date: string, taskId: string): Promise<void>;
  /** 替换该根任务纳入的子任务(纳入/移出后重新准备) */
  toggleSubtaskPick(date: string, taskId: string, subtaskId: string): Promise<void>;
  editDraft(date: string, index: number, patch: Partial<DraftMyDayAction>): void;
  toggleDraftSelected(date: string, index: number): void;
  moveDraft(date: string, index: number, direction: -1 | 1): void;
  /** 换一件:排除该根任务并解除必做,随后自动重新生成 */
  swapOut(date: string, index: number): Promise<void>;
  clear(date: string): void;
}

function genId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function baseSession(date: string): MyDayPlanSession {
  return {
    date,
    status: 'idle',
    contextId: null,
    preview: null,
    preparedTagIds: [],
    manualTaskIds: [],
    subtaskPicks: [],
    focusNote: '',
    targetCount: 3,
    mandatory: [],
    excluded: [],
    drafts: [],
    assumptions: [],
    notSelected: [],
    requestId: null,
    proposalId: null,
    modelSnapshot: null,
    operationId: genId('mydayop'),
    baseRevision: 0,
    startedAt: 0,
    error: null,
  };
}

export const useMyDayPlanStore = create<MyDayPlanStore>((set, get) => ({
  sessions: {},

  prepare: async (date, input) => {
    const prev = get().sessions[date];
    // 范围变化时手动补入与子任务选择随旧范围一起失效,恢复默认
    const scopeChanged =
      !prev?.preview ||
      [...prev.preparedTagIds].sort().join(',') !== [...(input.tagIds ?? [])].sort().join(',');
    const manualTaskIds = scopeChanged ? [] : (prev?.manualTaskIds ?? []);
    const subtaskPicks = scopeChanged ? [] : (prev?.subtaskPicks ?? []);
    set((s) => ({
      sessions: {
        ...s.sessions,
        [date]: {
          ...(prev ?? baseSession(date)),
          date,
          status: 'preparing',
          manualTaskIds,
          subtaskPicks,
          error: null,
        },
      },
    }));
    try {
      const { getRepositories } = await import('../domain/repositories/current');
      const preview = await getRepositories().ai.prepareMyDayContext({
        tagIds: input.tagIds,
        manualTaskIds,
        subtaskPicks,
      });
      set((s) => {
        const session = s.sessions[date];
        if (!session) return s;
        return {
          sessions: {
            ...s.sessions,
            [date]: {
              ...session,
              status: 'ready',
              // 重新准备作废旧建议(后端同样按日期作废);用户输入保留,生成时后端再校验
              contextId: preview.context_id,
              preview,
              preparedTagIds: [...(input.tagIds ?? [])].sort(),
              drafts: [],
              assumptions: [],
              notSelected: [],
              proposalId: null,
              modelSnapshot: null,
              requestId: null,
              operationId: genId('mydayop'),
              baseRevision: preview.current_revision,
              error: null,
            },
          },
        };
      });
    } catch (e) {
      set((s) => {
        const session = s.sessions[date];
        if (!session) return s;
        return { sessions: { ...s.sessions, [date]: { ...session, status: 'error', error: aiFailureMessage(e) } } };
      });
    }
  },

  generate: async (date) => {
    const session = get().sessions[date];
    if (!session || session.status === 'generating') return;
    const requestId = genId('myday');
    set((s) => ({
      sessions: {
        ...s.sessions,
        [date]: {
          ...s.sessions[date],
          // 重新生成保留旧草稿:失败/取消仍能回看上一个结果
          status: 'generating',
          requestId,
          startedAt: Date.now(),
          error: null,
        },
      },
    }));
    try {
      const { getRepositories } = await import('../domain/repositories/current');
      const current = get().sessions[date];
      if (!current?.contextId) throw { code: 'validation', message: '请先准备候选' };
      const proposal = await getRepositories().ai.generateMyDayPlan({
        contextId: current.contextId,
        focusNote: current.focusNote || undefined,
        mandatoryTaskIds: current.mandatory,
        excludedTaskIds: current.excluded,
        targetCount: current.targetCount,
        requestId,
      });
      finishProposal(date, proposal);
    } catch (e) {
      set((s) => {
        const sess = s.sessions[date];
        if (!sess) return s;
        return { sessions: { ...s.sessions, [date]: { ...sess, status: 'error', error: aiFailureMessage(e) } } };
      });
    }
  },

  setFocusNote: (date, note) =>
    set((s) => {
      const sess = s.sessions[date];
      if (!sess) return s;
      return { sessions: { ...s.sessions, [date]: { ...sess, focusNote: note } } };
    }),

  setTargetCount: (date, count) =>
    set((s) => {
      const sess = s.sessions[date];
      if (!sess) return s;
      return { sessions: { ...s.sessions, [date]: { ...sess, targetCount: count } } };
    }),

  toggleMandatory: (date, taskId) =>
    set((s) => {
      const sess = s.sessions[date];
      if (!sess) return s;
      const has = sess.mandatory.includes(taskId);
      const mandatory = has ? sess.mandatory.filter((id) => id !== taskId) : [...sess.mandatory, taskId];
      // 必做与排除互斥
      const excluded = has ? sess.excluded : sess.excluded.filter((id) => id !== taskId);
      return { sessions: { ...s.sessions, [date]: { ...sess, mandatory, excluded } } };
    }),

  toggleExcluded: (date, taskId) =>
    set((s) => {
      const sess = s.sessions[date];
      if (!sess) return s;
      const has = sess.excluded.includes(taskId);
      const excluded = has ? sess.excluded.filter((id) => id !== taskId) : [...sess.excluded, taskId];
      const mandatory = has ? sess.mandatory : sess.mandatory.filter((id) => id !== taskId);
      return { sessions: { ...s.sessions, [date]: { ...sess, excluded, mandatory } } };
    }),

  addManualTask: async (date, taskId) => {
    const sess = get().sessions[date];
    if (!sess?.preview || sess.manualTaskIds.includes(taskId)) return;
    set((s) => ({
      sessions: { ...s.sessions, [date]: { ...s.sessions[date], manualTaskIds: [...sess.manualTaskIds, taskId] } },
    }));
    await get().prepare(date, { tagIds: sess.preparedTagIds });
  },

  removeManualTask: async (date, taskId) => {
    const sess = get().sessions[date];
    if (!sess?.preview || !sess.manualTaskIds.includes(taskId)) return;
    set((s) => ({
      sessions: {
        ...s.sessions,
        [date]: { ...s.sessions[date], manualTaskIds: sess.manualTaskIds.filter((id) => id !== taskId) },
      },
    }));
    await get().prepare(date, { tagIds: sess.preparedTagIds });
  },

  toggleSubtaskPick: async (date, taskId, subtaskId) => {
    const sess = get().sessions[date];
    const cand = sess?.preview?.candidates.find((c) => c.task_id === taskId);
    if (!sess?.preview || !cand) return;
    // 当前有效纳入集:无显式选择时为默认前 5 项
    const existing = sess.subtaskPicks.find((p) => p.task_id === taskId);
    const current = existing ? existing.subtask_ids : cand.subtasks.map((s) => s.subtask_id);
    // 已满 5 项时换入:移出当前最后一项给新项让位,避免静默丢弃用户刚点的选择
    const next = current.includes(subtaskId)
      ? current.filter((id) => id !== subtaskId)
      : current.length >= 5
        ? [...current.slice(0, 4), subtaskId]
        : [...current, subtaskId];
    const subtaskPicks = existing
      ? sess.subtaskPicks.map((p) => (p.task_id === taskId ? { ...p, subtask_ids: next } : p))
      : [...sess.subtaskPicks, { task_id: taskId, subtask_ids: next }];
    set((s) => ({ sessions: { ...s.sessions, [date]: { ...s.sessions[date], subtaskPicks } } }));
    await get().prepare(date, { tagIds: sess.preparedTagIds });
  },

  editDraft: (date, index, patch) =>
    set((s) => {
      const sess = s.sessions[date];
      if (!sess?.drafts[index]) return s;
      const drafts = sess.drafts.map((d, i) => (i === index ? { ...d, ...patch } : d));
      return { sessions: { ...s.sessions, [date]: { ...sess, drafts } } };
    }),

  toggleDraftSelected: (date, index) =>
    set((s) => {
      const sess = s.sessions[date];
      if (!sess?.drafts[index]) return s;
      const drafts = sess.drafts.map((d, i) => (i === index ? { ...d, selected: !d.selected } : d));
      return { sessions: { ...s.sessions, [date]: { ...sess, drafts } } };
    }),

  moveDraft: (date, index, direction) =>
    set((s) => {
      const sess = s.sessions[date];
      if (!sess) return s;
      const target = index + direction;
      if (index < 0 || target < 0 || target >= sess.drafts.length) return s;
      const drafts = [...sess.drafts];
      [drafts[index], drafts[target]] = [drafts[target], drafts[index]];
      return { sessions: { ...s.sessions, [date]: { ...sess, drafts } } };
    }),

  swapOut: async (date, index) => {
    const sess = get().sessions[date];
    const draft = sess?.drafts[index];
    if (!draft) return;
    // 排除该根任务并解除必做,保留其他锁定,再重新生成
    set((s) => {
      const cur = s.sessions[date];
      if (!cur) return s;
      const excluded = cur.excluded.includes(draft.root_task_id)
        ? cur.excluded
        : [...cur.excluded, draft.root_task_id];
      const mandatory = cur.mandatory.filter((id) => id !== draft.root_task_id);
      return { sessions: { ...s.sessions, [date]: { ...cur, excluded, mandatory } } };
    });
    await get().generate(date);
  },

  clear: (date) =>
    set((s) => {
      if (!s.sessions[date]) return s;
      const next = { ...s.sessions };
      delete next[date];
      return { sessions: next };
    }),
}));

function finishProposal(date: string, proposal: MyDayPlanProposal) {
  useMyDayPlanStore.setState((s) => {
    const sess = s.sessions[date];
    if (!sess) return s;
    const mandatorySet = new Set(sess.mandatory);
    return {
      sessions: {
        ...s.sessions,
        [date]: {
          ...sess,
          status: 'done',
          requestId: proposal.request_id,
          proposalId: proposal.proposal_id,
          modelSnapshot: proposal.model_snapshot,
          assumptions: proposal.assumptions,
          notSelected: proposal.not_selected,
          drafts: proposal.actions.map((a) => ({
            root_task_id: a.root_task_id,
            root_title: a.root_title,
            target_subtask_id: a.target_subtask_id,
            subtask_title: a.subtask_title,
            already_in_my_day: a.already_in_my_day,
            reason: a.reason,
            next_step: a.next_step,
            stop_at: a.stop_at,
            selected: true,
            was_mandatory: mandatorySet.has(a.root_task_id),
          })),
          error: null,
        },
      },
    };
  });
}

/** 取某日期的会话;日期为空或键不存在时返回 undefined */
export function myDaySession(date: string | null) {
  if (!date) return undefined;
  return useMyDayPlanStore.getState().sessions[date];
}

/** 当天会话的便捷读取(页面按 todayISO() 键控) */
export function todaySession() {
  return myDaySession(todayISO());
}
