import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ReviewPage } from '../../pages/ReviewPage';
import { renderWithProviders } from '../test-utils';
import type { ReviewFacts, SavedReview } from '../../types/progress';

// ─── mock 数据层 ───
const mocks = vi.hoisted(() => ({
  facts: null as ReviewFacts | null,
  saved: null as SavedReview | null,
  material: { items: [], total: 0, page: 1, page_size: 20 },
  contextStatus: { prepared: false, sources_changed: false, context_fingerprint: null },
  saveReview: vi.fn(),
  deleteReview: vi.fn(),
  prepare: vi.fn(),
  tags: [] as Array<{ id: string; name: string; color: string }>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
  Toaster: () => null,
}));

vi.mock('../../lib/db', () => ({
  getReviewFacts: vi.fn(async () => mocks.facts),
  getSavedReview: vi.fn(async () => mocks.saved),
  reviewListMaterial: vi.fn(async () => mocks.material),
  aiGetReviewContextStatus: vi.fn(async () => mocks.contextStatus),
  saveReview: vi.fn(async (...args: unknown[]) => mocks.saveReview(...args)),
  deleteReview: vi.fn(async (...args: unknown[]) => mocks.deleteReview(...args)),
  aiPrepareReviewContext: vi.fn(async (...args: unknown[]) => mocks.prepare(...args)),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: mocks.tags, isLoading: false }),
}));

function sampleFacts(): ReviewFacts {
  return {
    period_kind: 'day',
    period_start: '2026-10-31',
    period_end: '2026-10-31',
    tag_ids: [],
    event_cutoff_at: '2026-10-31 21:00:00',
    prepared_at: '2026-10-31 21:00:00',
    timezone_offset: '+08:00',
    completed_root: [
      { task_id: 't1', title: '整理会议纪要', is_root: true, occurred_at: '2026-10-31 10:00:00', task_deleted: false },
    ],
    completed_subtask: [
      { task_id: 'c1', title: '回归测试', is_root: false, occurred_at: '2026-10-31 11:00:00', task_deleted: false },
    ],
    completed_then_reopened: [
      { task_id: 't2', title: '修复登录缺陷', is_root: true, occurred_at: '2026-10-31 15:00:00', task_deleted: true },
    ],
    suspended_count: 1,
    resumed_count: 0,
    abandoned_count: 1,
    restored_count: 0,
    record_count: 2,
    coverage: { baseline_start: '2026-10-30', gaps: [] },
    coverage_status: 'complete',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.facts = sampleFacts();
  mocks.saved = null;
  mocks.material = { items: [], total: 0, page: 1, page_size: 20 };
  mocks.contextStatus = { prepared: false, sources_changed: false, context_fingerprint: null };
  mocks.tags = [];
});

describe('ReviewPage', () => {
  it('日回顾展示事实:根/子任务分列、重开单列、统计截止与覆盖说明', async () => {
    renderWithProviders(<ReviewPage />);
    expect(await screen.findByText('整理会议纪要')).toBeInTheDocument();
    expect(screen.getByText('回归测试')).toBeInTheDocument();
    expect(screen.getByText(/修复登录缺陷/)).toBeInTheDocument();
    // 根任务完成 1 与子任务完成 1 分列展示
    expect(screen.getByText('根任务完成')).toBeInTheDocument();
    expect(screen.getByText('子任务完成')).toBeInTheDocument();
    // 统计截止与覆盖说明可见
    expect(screen.getByText(/统计截止/)).toBeInTheDocument();
    expect(screen.getByText(/本机资料覆盖完整/)).toBeInTheDocument();
  });

  it('周回顾按自然周显示范围;覆盖缺失时不呈现为零活动', async () => {
    mocks.facts = {
      ...sampleFacts(),
      period_kind: 'week',
      period_start: '2026-10-26',
      period_end: '2026-11-01',
      coverage_status: 'missing',
      completed_root: [],
      completed_subtask: [],
      completed_then_reopened: [],
    };
    renderWithProviders(<ReviewPage />);
    await userEvent.setup().click(screen.getByRole('button', { name: '周回顾' }));
    expect(await screen.findByText(/历史资料缺失/)).toBeInTheDocument();
    expect(screen.getByText(/不代表当时没有活动/)).toBeInTheDocument();
  });

  it('手写回顾可保存;保存回传期望版本与范围', async () => {
    const user = userEvent.setup();
    mocks.saveReview.mockResolvedValue({ review: { id: 'rv1', revision: 1 }, already_saved: false });
    renderWithProviders(<ReviewPage />);
    await user.click(await screen.findByRole('tab', { name: /回顾文稿/ }));
    const textarea = screen.getByPlaceholderText(/直接写下这一天的总结或复盘/);
    await user.type(textarea, '今天推进顺利');
    expect(textarea).toHaveValue('今天推进顺利');
    await user.click(screen.getByRole('button', { name: /保存文稿/ }));
    await screen.findByText(/保存文稿/);
    expect(mocks.saveReview).toHaveBeenCalled();
    const input = mocks.saveReview.mock.calls[0][0] as Record<string, unknown>;
    expect(input.manual_text).toBe('今天推进顺利');
    expect(input.expected_revision).toBe(0);
    expect(input.ai).toBeNull();
  });

  it('无模型/未准备时 AI 区只提示流程,手写不受阻;准备后可见来源预览边界', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReviewPage />);
    await user.click(await screen.findByRole('tab', { name: /回顾文稿/ }));
    // AI 区说明:生成前不发起请求,不配置模型也能手写
    expect(screen.getByText(/不配置模型也能手写与保存回顾/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /生成回顾/ })).not.toBeInTheDocument();

    // 准备资料:返回带截断与遗漏的快照
    mocks.prepare.mockResolvedValue({
      scope_key: 'day:2026-10-31',
      period_kind: 'day',
      period_start: '2026-10-31',
      period_end: '2026-10-31',
      tag_ids: [],
      timezone_offset: '+08:00',
      event_cutoff_at: '2026-10-31 21:00:00',
      prepared_at: '2026-10-31 21:00:00',
      prepared_at_local_date: '2026-10-31',
      coverage_note: '本机资料覆盖完整',
      completed_root_count: 1,
      completed_subtask_count: 1,
      reopened_count: 1,
      suspended_count: 1,
      resumed_count: 0,
      abandoned_count: 1,
      coverage_status: 'complete',
      groups: [{ ref_id: 'T1', task_id: 't1', title: '整理会议纪要', is_root: true, root_facts: [], subtask_facts: [] }],
      records: [{ ref_id: 'R1', record_id: 'r1', task_id: 't1', task_title: '整理会议纪要', record_date: '2026-10-31', excerpt: '写完了纪要', full_chars: 5, truncated: true }],
      user_note: '',
      totals: {
        total_root_groups: 45, included_root_groups: 40,
        total_subtask_facts: 6, included_subtask_facts: 6,
        total_records: 61, included_records: 60, truncated_records: 3,
      },
      sources: [
        { ref_id: 'T1', kind: 'task', entity_id: 't1', title: '整理会议纪要' },
        { ref_id: 'R1', kind: 'record', entity_id: 'r1', title: '整理会议纪要' },
      ],
      context_fingerprint: 'fp-1',
    });
    await user.click(screen.getByRole('button', { name: /准备资料/ }));
    expect(await screen.findByText(/存在遗漏/)).toBeInTheDocument();
    expect(screen.getByText(/单条截断 3 条/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /生成回顾/ })).toBeInTheDocument();
  });

  it('已保存稿恢复显示,含来源不可用标记', async () => {
    mocks.saved = {
      id: 'rv1',
      scope_key: 'day:2026-10-31',
      period_kind: 'day',
      period_start: '2026-10-31',
      period_end: '2026-10-31',
      tag_ids: [],
      manual_text: '上周的手写稿',
      ai_sections: {
        summary: [{ text: '推进了纪要', refs: ['T1'] }],
        observations: [], suggestions: [], questions: [],
      },
      ai_model_snapshot: '智谱 (glm)',
      event_cutoff_at: '2026-10-31 21:00:00',
      prepared_at: '2026-10-31 21:00:00',
      prepared_at_local_date: '2026-10-31',
      timezone_offset: '+08:00',
      coverage_note: '完整',
      revision: 2,
      created_at: '2026-10-31 21:05:00',
      updated_at: '2026-10-31 21:05:00',
      source_status: [
        { kind: 'record', ref_id: 'R1', entity_id: 'r-gone', title: '已删记录', available: false },
      ],
    } as SavedReview;
    const user = userEvent.setup();
    renderWithProviders(<ReviewPage />);
    await user.click(await screen.findByRole('tab', { name: /回顾文稿/ }));
    expect(await screen.findByDisplayValue('上周的手写稿')).toBeInTheDocument();
    expect(screen.getByText(/已保存的 AI 回顾/)).toBeInTheDocument();
    expect(screen.getByText(/1 个来源已不可用/)).toBeInTheDocument();
    expect(screen.getByText(/版本 2/)).toBeInTheDocument();
  });
});
