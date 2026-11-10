import { create } from 'zustand';

import type { ReviewProposal, ReviewSections } from '../types/progress';

/**
 * 日/周回顾 AI 会话,按范围(scopeKey)隔离。
 * - 离开页面再返回可接续;换范围后旧结果不写入新范围。
 * - 取消/失败/换页不清空已保存稿或用户编辑;未保存会话仅内存,重启即弃。
 */
export type ReviewSessionStatus = 'generating' | 'done' | 'error';

export interface ReviewSession {
  scopeKey: string;
  status: ReviewSessionStatus;
  requestId: string;
  modelSnapshot: string | null;
  sections: ReviewSections;
  error: string | null;
  startedAt: number;
  // 快照元数据:保存时原样回传后端,形成"按此快照保存"
  event_cutoff_at: string;
  prepared_at: string;
  prepared_at_local_date: string;
  timezone_offset: string;
  coverage_note: string;
  source_refs: unknown;
  context_fingerprint: string;
}

interface ReviewStore {
  sessions: Record<string, ReviewSession>;
  start: (scopeKey: string, requestId: string) => void;
  finish: (scopeKey: string, proposal: ReviewProposal) => void;
  fail: (scopeKey: string, message: string) => void;
  setItemText: (scopeKey: string, group: keyof ReviewSections, index: number, text: string) => void;
  removeItem: (scopeKey: string, group: keyof ReviewSections, index: number) => void;
  clear: (scopeKey: string) => void;
}

function newRequestId(): string {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `review-${uuid}`;
}

export const useReviewStore = create<ReviewStore>((set) => ({
  sessions: {},
  start: (scopeKey, requestId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [scopeKey]: {
          scopeKey,
          status: 'generating',
          requestId,
          modelSnapshot: null,
          sections: { summary: [], observations: [], suggestions: [], questions: [] },
          error: null,
          startedAt: Date.now(),
          event_cutoff_at: '',
          prepared_at: '',
          prepared_at_local_date: '',
          timezone_offset: '',
          coverage_note: '',
          source_refs: null,
          context_fingerprint: '',
        },
      },
    })),
  finish: (scopeKey, proposal) =>
    set((state) => {
      const existing = state.sessions[scopeKey];
      if (!existing || existing.requestId !== proposal.request_id) return state;
      return {
        sessions: {
          ...state.sessions,
          [scopeKey]: {
            ...existing,
            status: 'done',
            modelSnapshot: proposal.model_snapshot,
            sections: proposal.sections,
            event_cutoff_at: proposal.event_cutoff_at,
            prepared_at: proposal.prepared_at,
            prepared_at_local_date: proposal.prepared_at_local_date,
            timezone_offset: proposal.timezone_offset,
            coverage_note: proposal.coverage_note,
            source_refs: proposal.source_refs,
            context_fingerprint: proposal.context_fingerprint,
          },
        },
      };
    }),
  fail: (scopeKey, message) =>
    set((state) => {
      const existing = state.sessions[scopeKey];
      if (!existing) return state;
      return {
        sessions: {
          ...state.sessions,
          [scopeKey]: { ...existing, status: 'error', error: message },
        },
      };
    }),
  setItemText: (scopeKey, group, index, text) =>
    set((state) => {
      const existing = state.sessions[scopeKey];
      if (!existing) return state;
      const items = [...existing.sections[group]];
      if (!items[index]) return state;
      items[index] = { ...items[index], text };
      return {
        sessions: {
          ...state.sessions,
          [scopeKey]: { ...existing, sections: { ...existing.sections, [group]: items } },
        },
      };
    }),
  removeItem: (scopeKey, group, index) =>
    set((state) => {
      const existing = state.sessions[scopeKey];
      if (!existing) return state;
      const items = existing.sections[group].filter((_, i) => i !== index);
      return {
        sessions: {
          ...state.sessions,
          [scopeKey]: { ...existing, sections: { ...existing.sections, [group]: items } },
        },
      };
    }),
  clear: (scopeKey) =>
    set((state) => {
      const next = { ...state.sessions };
      delete next[scopeKey];
      return { sessions: next };
    }),
}));

export function genReviewRequestId(): string {
  return newRequestId();
}

/** 发起生成(在准备快照之后调用);失败信息统一走 aiFailureMessage */
export async function runReviewGenerate(scopeKey: string, requestId: string, input: {
  period_kind: 'day' | 'week';
  start_date: string;
  tag_ids: string[];
}): Promise<void> {
  const store = useReviewStore.getState();
  if (store.sessions[scopeKey]?.status === 'generating') return;
  store.start(scopeKey, requestId);
  try {
    const db = await import('../lib/db');
    const proposal = await db.aiGenerateReview(input.period_kind, input.start_date, input.tag_ids, requestId);
    useReviewStore.getState().finish(scopeKey, proposal);
  } catch (error) {
    const { aiFailureMessage } = await import('../lib/aiErrors');
    useReviewStore.getState().fail(scopeKey, aiFailureMessage(error));
  }
}
