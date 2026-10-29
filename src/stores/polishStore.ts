import { create } from 'zustand';
import type { PolishProposal } from '../domain/models/ai';
import { aiFailureMessage } from '../lib/aiErrors';

/**
 * 润色会话 store:让生成中的请求与已完成的结果跨详情页进出存活。
 * 组件局部 state 在离开任务详情时会丢失,导致"看不到进度、拿不回结果、
 * 重试被单飞拦截"。会话放在这里,面板只是它的视图。
 */
export type PolishStatus = 'generating' | 'done' | 'error';

export interface PolishSession {
  taskId: string;
  status: PolishStatus;
  /** 前端生成并传给后端的请求标识:进度过滤 + 取消 + 重进面板接续。 */
  requestId: string;
  modelSnapshot: string | null;
  /** 预览文本(含用户编辑,跨进出保留)。 */
  text: string;
  /** 发起生成时任务描述的纯文本,用于检测"生成后描述又变了"。 */
  baseDescriptionText: string;
  /** 用户补充的润色方向(可选),重新生成时作为输入框初值保留。 */
  userNote: string;
  /** 发起时间戳(ms):生成中计算已等待秒数,重进面板不重置。 */
  startedAt: number;
  error: string | null;
}

interface PolishStore {
  sessions: Record<string, PolishSession>;
  /** 视图挂载时按需同步一次进度尾巴(仅展示用,不参与状态机)。 */
  start(taskId: string, baseDescriptionText: string, requestId: string, userNote: string): void;
  finish(taskId: string, proposal: PolishProposal): void;
  fail(taskId: string, message: string): void;
  setText(taskId: string, text: string): void;
  setUserNote(taskId: string, note: string): void;
  /** 采纳完成或用户明确放弃后清除会话。 */
  clear(taskId: string): void;
}

function genRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `polish-${crypto.randomUUID()}`;
  }
  return `polish-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const usePolishStore = create<PolishStore>((set) => ({
  sessions: {},
  start: (taskId, baseDescriptionText, requestId, userNote) =>
    set((s) => ({
      sessions: {
        ...s.sessions,
        [taskId]: {
          taskId,
          status: 'generating',
          requestId,
          modelSnapshot: null,
          text: '',
          baseDescriptionText,
          userNote,
          startedAt: Date.now(),
          error: null,
        },
      },
    })),
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
                modelSnapshot: proposal.model_snapshot,
                text: proposal.text,
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
  setText: (taskId, text) =>
    set((s) =>
      s.sessions[taskId]
        ? { sessions: { ...s.sessions, [taskId]: { ...s.sessions[taskId], text } } }
        : s,
    ),
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

/**
 * 发起并托管一次润色生成:flushSave 由调用方注入(任务详情的保存等待);
 * 之后的网络请求与收尾都在 store 侧完成,不依赖面板存活。
 * note 为用户补充的润色方向(可选),随会话保留供重新生成复用。
 */
export async function runPolish(
  taskId: string,
  baseDescriptionText: string,
  beforeGenerate: () => Promise<void>,
  note = '',
): Promise<void> {
  // 重入防护:同任务已有生成在跑时忽略再次发起(双击/重开面板竞态),
  // 否则第二路会被后端单飞拒绝并把会话覆盖成报错。
  if (usePolishStore.getState().sessions[taskId]?.status === 'generating') return;
  const requestId = genRequestId();
  const store = usePolishStore.getState();
  store.start(taskId, baseDescriptionText, requestId, note);
  try {
    await beforeGenerate();
  } catch (e) {
    // 仅透传带 save_timeout 标记的超时;其余保存失败用通用文案
    const err = e as { code?: string; message?: string };
    usePolishStore
      .getState()
      .fail(
        taskId,
        err?.code === 'save_timeout'
          ? err.message ?? '任务保存超时,请稍后重试'
          : '任务保存失败,请先处理未保存的修改后再润色',
      );
    return;
  }
  try {
    const { getRepositories } = await import('../domain/repositories/current');
    const proposal = await getRepositories().ai.polishDescription(taskId, requestId, note || undefined);
    usePolishStore.getState().finish(taskId, proposal);
  } catch (e) {
    usePolishStore.getState().fail(taskId, aiFailureMessage(e));
  }
}
