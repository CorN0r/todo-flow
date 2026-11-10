import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TaskDetail } from '../../components/tasks/TaskDetail';
import { useProgressDraftStore } from '../../stores/progressDraftStore';
import { renderWithProviders, buildTask } from '../test-utils';

// ─── mock(镜像 SubtaskDescription.test 的 TaskDetail 线路) ───
const mocks = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  createMutate: vi.fn(),
  createMutateAsync: vi.fn(() => Promise.resolve({ id: 'rebuilt' })),
  reorderMutate: vi.fn(),
  detail: null as { task: any; children: any[]; completed_at?: string | null } | null,
  recordsPage: { items: [], total: 0, page: 1, page_size: 20 },
  overview: { self_count: 0, with_children_count: 0, last_record_at: null },
  createRecord: vi.fn(),
  store: {
    selectedTaskId: null as string | null,
    setSelectedTaskId: vi.fn(),
    selectionMode: false,
    selectedTaskIds: new Set<string>(),
    enterSelectionMode: vi.fn(),
    toggleTaskSelection: vi.fn(),
    theme: 'light' as const,
    globalSubtasksExpanded: false,
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
  Toaster: () => null,
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: Object.assign(
    vi.fn((selector?: any) => (typeof selector === 'function' ? selector(mocks.store) : mocks.store)),
    { getState: () => mocks.store, subscribe: () => () => {} },
  ),
}));

vi.mock('../../hooks/useTasks', () => ({
  useUpdateTask: () => ({ mutate: mocks.updateMutate }),
  useDeleteTask: () => ({ mutate: mocks.deleteMutate }),
  useCreateTask: () => ({ mutate: mocks.createMutate, mutateAsync: mocks.createMutateAsync }),
  useReorderTasks: () => ({ mutate: mocks.reorderMutate }),
  useToggleMyDay: () => vi.fn(),
  useTaskReminders: () => ({ data: [] }),
  useTask: () => ({ data: mocks.detail, isLoading: false }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: null, isLoading: false }),
}));

vi.mock('../../hooks/useTaskNotes', () => ({
  useTaskNotes: () => ({ data: [] }),
  useToggleTaskNote: () => vi.fn(),
}));

vi.mock('../../hooks/useProgress', () => ({
  useProgressRecords: () => ({ data: mocks.recordsPage, isLoading: false }),
  useProgressEvents: () => ({ data: { items: [], total: 0, page: 1, page_size: 20 }, isLoading: false }),
  useProgressOverview: () => ({ data: mocks.overview }),
  useCreateProgressRecord: () => ({ mutate: mocks.createRecord, isPending: false }),
  useUpdateProgressRecord: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProgressRecord: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../components/shared/RichTextEditor', () => ({
  RichTextEditor: () => <div data-testid="rich-editor" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useProgressDraftStore.setState({ drafts: {} });
  mocks.store.selectedTaskId = 't1';
  mocks.detail = {
    task: buildTask({ id: 't1', title: '写周报', description: '', is_completed: false }),
    children: [],
    completed_at: null,
  };
  mocks.recordsPage = { items: [], total: 0, page: 1, page_size: 20 };
  mocks.overview = { self_count: 0, with_children_count: 0, last_record_at: null };
});

describe('TaskDetail 双页签', () => {
  it('默认内容页:描述/子任务可见,进展输入不出现', async () => {
    renderWithProviders(<TaskDetail />);
    expect(screen.getByText('任务内容')).toBeInTheDocument();
    // 描述编辑器是 lazy 加载,等 Suspense 落定再断言
    expect(await screen.findByTestId('rich-editor')).toBeInTheDocument();
    expect(screen.getByText('子任务')).toBeInTheDocument();
    // 进展输入区保持挂载但不可见(不展开空面板,不抢焦点)
    expect(screen.getByPlaceholderText(/随手记一句进展/)).not.toBeVisible();
  });

  it('切到进展页签可见输入区;切回内容页编辑器仍在(不重复挂载)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskDetail />);
    await screen.findByTestId('rich-editor');
    await user.click(screen.getByRole('tab', { name: /进展记录/ }));
    expect(screen.getByPlaceholderText(/随手记一句进展/)).toBeVisible();

    await user.click(screen.getByRole('tab', { name: /任务内容/ }));
    expect(screen.getByTestId('rich-editor')).toBeVisible();
    expect(screen.getByPlaceholderText(/随手记一句进展/)).not.toBeVisible();
  });

  it('草稿在页签切换间保留,不自动提交', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskDetail />);
    await user.click(screen.getByRole('tab', { name: /进展记录/ }));
    const textarea = screen.getByPlaceholderText(/随手记一句进展/);
    await user.type(textarea, '初稿完成');
    expect(textarea).toHaveValue('初稿完成');

    await user.click(screen.getByRole('tab', { name: /任务内容/ }));
    await user.click(screen.getByRole('tab', { name: /进展记录/ }));
    expect(screen.getByPlaceholderText(/随手记一句进展/)).toHaveValue('初稿完成');
    expect(mocks.createRecord).not.toHaveBeenCalled();
  });

  it('空内容不可保存;Ctrl+Enter 触发保存并带幂等操作标识', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskDetail />);
    await screen.findByTestId('rich-editor');
    await user.click(screen.getByRole('tab', { name: /进展记录/ }));
    const textarea = screen.getByPlaceholderText(/随手记一句进展/);

    // 空白:按钮禁用
    const saveBtn = screen.getByRole('button', { name: /保存进展/ });
    expect(saveBtn).toBeDisabled();

    await user.type(textarea, '完成一半');
    expect(saveBtn).toBeEnabled();
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(mocks.createRecord).toHaveBeenCalledTimes(1);
    const call = mocks.createRecord.mock.calls[0][0];
    expect(call.content).toBe('完成一半');
    expect(call.operationId).toMatch(/^progress-/);
  });

  it('时间线显示手写记录与来源;完成后无事件时显示完成时间未记录', async () => {
    const user = userEvent.setup();
    mocks.overview = { self_count: 1, with_children_count: 1, last_record_at: '2026-10-31 09:00:00' };
    mocks.recordsPage = {
      items: [{
        id: 'r1', task_id: 't1', root_task_id: 't1', root_tag_ids: [], record_date: '2026-10-30',
        content: '昨天做到了调研部分', version: 1, created_at: '2026-10-31 09:00:00',
        updated_at: '2026-10-31 09:00:00', task_title: '写周报', task_deleted: false, is_subtask: false,
      }],
      total: 1, page: 1, page_size: 20,
    };
    renderWithProviders(<TaskDetail />);
    await user.click(screen.getByRole('tab', { name: /进展记录/ }));
    expect(screen.getByText('昨天做到了调研部分')).toBeInTheDocument();
    expect(screen.getByText('补记')).toBeInTheDocument();

    // 页签徽标计数可见(轻量入口)
    expect(screen.getByText('1')).toBeInTheDocument();

    // 已完成但无事件:显示"完成时间未记录"而不是更新时间
    mocks.detail = {
      task: buildTask({ id: 't1', title: '写周报', is_completed: true, updated_at: '2026-10-31 12:00:00' }),
      children: [],
      completed_at: null,
    };
    renderWithProviders(<TaskDetail />);
    expect(screen.getByText('完成时间未记录')).toBeInTheDocument();
  });

  it('子任务记录聚合时标识来源', async () => {
    const user = userEvent.setup();
    mocks.detail = {
      task: buildTask({ id: 't1', title: '根任务', description: '' }),
      children: [buildTask({ id: 'c1', title: '子任务甲', parent_task_id: 't1' })],
      completed_at: null,
    };
    mocks.recordsPage = {
      items: [{
        id: 'r1', task_id: 'c1', root_task_id: 't1', root_tag_ids: [], record_date: '2026-10-31',
        content: '子任务的进展', version: 1, created_at: '2026-10-31 10:00:00',
        updated_at: '2026-10-31 10:00:00', task_title: '子任务甲', task_deleted: false, is_subtask: true,
      }],
      total: 1, page: 1, page_size: 20,
    };
    renderWithProviders(<TaskDetail />);
    await user.click(screen.getByRole('tab', { name: /进展记录/ }));
    expect(screen.getByText('子任务 · 子任务甲')).toBeInTheDocument();
  });
});
