import { create } from 'zustand';
import type { BreakdownItem, BreakdownProposal } from '../domain/models/ai';
import { aiFailureMessage } from '../lib/aiErrors';

/**
 * 拆解会话 store:与 polishStore 同一模式——生成请求与候选结果跨详情页存活,
 * 面板只是视图;重进详情能看到进行中请求或上次候选(含编辑与勾选)。
 */
export type BreakdownStatus = 'generating' | 'done' | 'error';

export interface DraftItem extends BreakdownItem {
  selected: boolean;
}

export interface BreakdownSession {
  taskId: string;
  status: BreakdownStatus;
  requestId: string;
  proposalId: string | null;
  modelSnapshot: string | null;
  assumptions: string[];
  items: DraftItem[];
  /** 采纳幂等键:同一候选生命周期内稳定,超时重试安全。 */
  operationId: string;
  userNote: string;
  /** 生成时的子任务标题快照,用于同名默认不勾。 */
  baseChildTitles: string[];
  error: string | null;
}

interface BreakdownStore {
  sessions: Record<string, BreakdownSession>;
  start(taskId: string, requestId: string, userNote: string, baseChildTitles: string[]): void;
  finish(taskId: string, proposal: BreakdownProposal): void;
  fail(taskId: string, message: string): void;
  toggleItem(taskId: string, index: number): void;
  setItem(taskId: string, index: number, patch: Partial<DraftItem>): void;
  setUserNote(taskId: string, note: string): void;
  clear(taskId: string): void;
}

function genId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useBreakdownStore = create<BreakdownStore>((set) => ({
  sessions: {},
  start: (taskId, requestId, userNote, baseChildTitles) =>
    set((s) => {
      // 重新生成时保留旧候选:新请求失败/取消仍能回看上一个结果(spec:失败保留预览)
      const prev = s.sessions[taskId];
      return {
        sessions: {
          ...s.sessions,
          [taskId]: {
            taskId,
            status: 'generating',
            requestId,
            proposalId: prev?.proposalId ?? null,
            modelSnapshot: prev?.modelSnapshot ?? null,
            assumptions: prev?.assumptions ?? [],
            items: prev?.items ?? [],
            operationId: genId('op'),
            userNote,
            baseChildTitles,
            error: null,
          },
        },
      };
    }),
  finish: (taskId, proposal) =>
    set((s) =>
      s.sessions[taskId]
        ? {
            sessions: {
              ...s.sessions,
              [taskId]: {
                ...s.sessions[taskId],
                status: 'done',
                requestId: proposal.request_id,
                proposalId: proposal.proposal_id,
                modelSnapshot: proposal.model_snapshot,
                assumptions: proposal.assumptions,
                // 与已有子任务/同批同名的候选默认不勾选
                items: markDuplicates(proposal.items, s.sessions[taskId].baseChildTitles),
                error: null,
              },
            },
          }
        : s,
    ),
  fail: (taskId, message) =>
    set((s) =>
      s.sessions[taskId]
        ? {
            sessions: {
              ...s.sessions,
              [taskId]: { ...s.sessions[taskId], status: 'error', error: message },
            },
          }
        : s,
    ),
  toggleItem: (taskId, index) =>
    set((s) => {
      const session = s.sessions[taskId];
      if (!session?.items[index]) return s;
      const items = session.items.map((it, i) =>
        i === index ? { ...it, selected: !it.selected } : it,
      );
      return { sessions: { ...s.sessions, [taskId]: { ...session, items } } };
    }),
  setItem: (taskId, index, patch) =>
    set((s) => {
      const session = s.sessions[taskId];
      if (!session?.items[index]) return s;
      const items = session.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
      return { sessions: { ...s.sessions, [taskId]: { ...session, items } } };
    }),
  setUserNote: (taskId, note) =>
    set((s) =>
      s.sessions[taskId]
        ? { sessions: { ...s.sessions, [taskId]: { ...s.sessions[taskId], userNote: note } } }
        : s,
    ),
  clear: (taskId) =>
    set((s) => {
      if (!s.sessions[taskId]) return s;
      const next = { ...s.sessions };
      delete next[taskId];
      return { sessions: next };
    }),
}));

function markDuplicates(items: BreakdownItem[], existingTitles: string[]): DraftItem[] {
  const existingLower = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  const seen = new Set<string>();
  return items.map((item) => {
    const key = item.title.trim().toLowerCase();
    const duplicate = existingLower.has(key) || seen.has(key);
    seen.add(key);
    return { ...item, selected: !duplicate };
  });
}

/**
 * 发起并托管一次拆解生成:flushSave 由调用方注入;网络请求与收尾在 store 侧完成,
 * 不依赖面板存活。已有候选时重新生成会覆盖(新 operationId)。
 */
export async function runBreakdown(
  taskId: string,
  userNote: string,
  existingChildTitles: string[],
  beforeGenerate: () => Promise<void>,
): Promise<void> {
  // 重入防护:同任务已有拆解在跑时忽略再次发起(双击/重开面板竞态)。
  if (useBreakdownStore.getState().sessions[taskId]?.status === 'generating') return;
  const requestId = genId('breakdown');
  useBreakdownStore.getState().start(taskId, requestId, userNote, existingChildTitles);
  try {
    await beforeGenerate();
  } catch (e) {
    // 仅透传带 save_timeout 标记的超时;其余保存失败用通用文案
    const err = e as { code?: string; message?: string };
    useBreakdownStore
      .getState()
      .fail(
        taskId,
        err?.code === 'save_timeout'
          ? err.message ?? '任务保存超时,请稍后重试'
          : '任务保存失败,请先处理未保存的修改后再拆解',
      );
    return;
  }
  try {
    const { getRepositories } = await import('../domain/repositories/current');
    const proposal = await getRepositories().ai.generateBreakdown(taskId, userNote || undefined, requestId);
    useBreakdownStore.getState().finish(taskId, proposal);
  } catch (e) {
    useBreakdownStore.getState().fail(taskId, aiFailureMessage(e));
  }
}
