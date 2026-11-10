import { beforeEach, describe, expect, it } from 'vitest';

import { useProgressDraftStore } from '../../stores/progressDraftStore';
import { useReviewStore } from '../../stores/reviewStore';
import type { ReviewProposal } from '../../types/progress';

describe('progressDraftStore', () => {
  beforeEach(() => {
    useProgressDraftStore.setState({ drafts: {} });
  });

  it('草稿按任务保留,ensureDraft 幂等', () => {
    const first = useProgressDraftStore.getState().ensureDraft('task-1', '2026-10-31');
    expect(first.recordDate).toBe('2026-10-31');
    expect(first.content).toBe('');
    expect(first.operationId).toMatch(/^progress-/);

    // 已存在时返回同一份,不重置
    useProgressDraftStore.getState().setDraft('task-1', { content: '写了一半' });
    const again = useProgressDraftStore.getState().ensureDraft('task-1', '2026-11-01');
    expect(again.content).toBe('写了一半');
    expect(again.recordDate).toBe('2026-10-31');

    // 另一任务互不影响
    const other = useProgressDraftStore.getState().ensureDraft('task-2', '2026-10-31');
    expect(other.content).toBe('');
  });

  it('保存成功清空草稿;失败换新幂等键', () => {
    const draft = useProgressDraftStore.getState().ensureDraft('task-1', '2026-10-31');
    const opId = draft.operationId;

    useProgressDraftStore.getState().renewOperationId('task-1');
    const renewed = useProgressDraftStore.getState().getDraft('task-1');
    expect(renewed?.operationId).not.toBe(opId);
    expect(renewed?.content).toBe('');

    useProgressDraftStore.getState().clearDraft('task-1');
    expect(useProgressDraftStore.getState().getDraft('task-1')).toBeUndefined();
  });
});

describe('reviewStore', () => {
  beforeEach(() => {
    useReviewStore.setState({ sessions: {} });
  });

  const proposal: ReviewProposal = {
    request_id: 'review-1',
    model_snapshot: 'conn (m)',
    sections: {
      summary: [{ text: '推进了初稿', refs: ['T1'] }],
      observations: [],
      suggestions: [{ text: '先补数据', refs: ['R1'] }],
      questions: [],
    },
    event_cutoff_at: '2026-10-31 23:59:59',
    prepared_at: '2026-10-31 20:00:00',
    prepared_at_local_date: '2026-10-31',
    timezone_offset: '+08:00',
    coverage_note: '完整',
    source_refs: [],
    context_fingerprint: 'fp-1',
  };

  it('按范围隔离会话,结果可编辑', () => {
    useReviewStore.getState().start('day:2026-10-31', 'review-1');
    useReviewStore.getState().finish('day:2026-10-31', proposal);

    const session = useReviewStore.getState().sessions['day:2026-10-31'];
    expect(session?.status).toBe('done');
    expect(session?.sections.summary[0].text).toBe('推进了初稿');
    expect(session?.context_fingerprint).toBe('fp-1');

    // 编辑条目
    useReviewStore.getState().setItemText('day:2026-10-31', 'summary', 0, '编辑后');
    expect(
      useReviewStore.getState().sessions['day:2026-10-31']?.sections.summary[0].text,
    ).toBe('编辑后');

    // 移除条目
    useReviewStore.getState().removeItem('day:2026-10-31', 'summary', 0);
    expect(
      useReviewStore.getState().sessions['day:2026-10-31']?.sections.summary.length,
    ).toBe(0);

    // 其它范围不受影响
    expect(useReviewStore.getState().sessions['week:2026-10-26']).toBeUndefined();
  });

  it('失败保留会话与错误信息', () => {
    useReviewStore.getState().start('day:2026-10-31', 'review-1');
    useReviewStore.getState().fail('day:2026-10-31', '已取消');
    const session = useReviewStore.getState().sessions['day:2026-10-31'];
    expect(session?.status).toBe('error');
    expect(session?.error).toBe('已取消');
  });

  it('晚到的旧请求结果不会写入会话', () => {
    useReviewStore.getState().start('day:2026-10-31', 'review-old');
    useReviewStore.getState().start('day:2026-10-31', 'review-new');
    // 旧请求返回:finish 内部校验 requestId 不匹配则忽略
    useReviewStore.getState().finish('day:2026-10-31', { ...proposal, request_id: 'review-old' });
    const session = useReviewStore.getState().sessions['day:2026-10-31'];
    expect(session?.requestId).toBe('review-new');
    expect(session?.status).toBe('generating');
  });
});

// runReviewGenerate 的失败路径等价于 store.fail(上面已直接覆盖);
// 网关调用本身在 Rust 侧有取消/超时/晚响应单测。
