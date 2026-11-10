import { create } from 'zustand';

/**
 * 进展输入的会话内草稿,按任务保留。
 * - 只存在于当前应用会话:切换页签/任务/暂时关闭详情不丢失,进程退出不承诺恢复。
 * - operation_id 在保存成功前保持不变:保存响应丢失后重试同一操作不会新增重复记录。
 */
export interface ProgressDraft {
  content: string;
  recordDate: string;
  operationId: string;
}

interface ProgressDraftStore {
  drafts: Record<string, ProgressDraft>;
  getDraft: (taskId: string) => ProgressDraft | undefined;
  setDraft: (taskId: string, patch: Partial<Omit<ProgressDraft, 'operationId'>>) => void;
  /** 仅当草稿不存在时初始化(首次进入默认今天) */
  ensureDraft: (taskId: string, today: string) => ProgressDraft;
  /** 保存成功后清空并换新操作标识 */
  clearDraft: (taskId: string) => void;
  /** 保存失败后重置操作标识之外的内容保留,允许下次重试生成新幂等键 */
  renewOperationId: (taskId: string) => void;
}

function newOperationId(): string {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `progress-${uuid}`;
}

export const useProgressDraftStore = create<ProgressDraftStore>((set, get) => ({
  drafts: {},
  getDraft: (taskId) => get().drafts[taskId],
  setDraft: (taskId, patch) =>
    set((state) => {
      const existing = state.drafts[taskId];
      if (!existing) return state;
      return { drafts: { ...state.drafts, [taskId]: { ...existing, ...patch } } };
    }),
  ensureDraft: (taskId, today) => {
    const existing = get().drafts[taskId];
    if (existing) return existing;
    const draft: ProgressDraft = { content: '', recordDate: today, operationId: newOperationId() };
    set((state) => ({ drafts: { ...state.drafts, [taskId]: draft } }));
    return draft;
  },
  clearDraft: (taskId) =>
    set((state) => {
      const next = { ...state.drafts };
      delete next[taskId];
      return { drafts: next };
    }),
  renewOperationId: (taskId) =>
    set((state) => {
      const existing = state.drafts[taskId];
      if (!existing) return state;
      return { drafts: { ...state.drafts, [taskId]: { ...existing, operationId: newOperationId() } } };
    }),
}));
