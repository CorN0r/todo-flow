import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { TaskDetailPanel } from '../../components/layout/TaskDetailPanel';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { resetRepositories, setRepositoriesForTesting } from '../../domain/repositories/current';
import { useUIStore } from '../../stores/uiStore';
import { buildTask, renderWithProviders } from '../test-utils';

// 真实的 TaskDetail + 真实的 useTask(数据异步到达),只把保存动作换成 spy、把与本题无关的重块替掉
const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
  Toaster: () => null,
}));

vi.mock('../../hooks/useTasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useTasks')>()),
  useUpdateTask: () => ({ mutate: mocks.update }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useCreateTask: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
  useToggleMyDay: () => vi.fn(),
  useTaskReminders: () => ({ data: [] }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: null, isLoading: false }),
}));

vi.mock('../../hooks/useTaskNotes', () => ({
  useTaskNotes: () => ({ data: [] }),
  useToggleTaskNote: () => vi.fn(),
}));

vi.mock('../../hooks/useProgress', () => ({
  useProgressRecords: () => ({ data: { items: [], total: 0, page: 1, page_size: 20 }, isLoading: false }),
  useProgressEvents: () => ({ data: { items: [], total: 0, page: 1, page_size: 20 }, isLoading: false }),
  useProgressOverview: () => ({ data: { self_count: 0, with_children_count: 0, last_record_at: null } }),
  useCreateProgressRecord: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProgressRecord: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProgressRecord: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../components/shared/RichTextEditor', () => ({
  RichTextEditor: () => <div data-testid="rich-editor" />,
}));

const TITLE_INPUT = '任务标题';

/** 详情面板里自动保存的防抖是 800 毫秒,等得比它久一点再看有没有写入 */
function waitLongerThanAutosave() {
  return act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
}

describe('详情面板切换任务时不串数据', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { repositories } = createMemoryRepositories({
      tasks: [
        buildTask({ id: 'a', title: '写周报', description: '' }),
        buildTask({ id: 'b', title: '修 Bug', description: '' }),
      ],
    });
    setRepositoriesForTesting(repositories);
    useUIStore.setState({ selectedTaskId: 'a', taskViewMode: 'list', theme: 'light' });
  });

  afterEach(() => {
    resetRepositories();
    useUIStore.setState({ selectedTaskId: null });
  });

  it('面板不关就直接换任务:新任务显示并保留它自己的标题', async () => {
    renderWithProviders(<TaskDetailPanel />);
    await waitFor(() => expect(screen.getByPlaceholderText(TITLE_INPUT)).toHaveValue('写周报'));

    // 面板开着时选中另一个任务(搜索结果里选一个、或关闭动画还没结束就点了另一条),面板不会卸载
    act(() => { useUIStore.getState().setSelectedTaskId('b'); });
    await waitLongerThanAutosave();

    expect(screen.getByPlaceholderText(TITLE_INPUT)).toHaveValue('修 Bug');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('上一个任务还没来得及保存的修改,保存到它自己身上,不写到新任务上', async () => {
    renderWithProviders(<TaskDetailPanel />);
    await waitFor(() => expect(screen.getByPlaceholderText(TITLE_INPUT)).toHaveValue('写周报'));

    fireEvent.change(screen.getByPlaceholderText(TITLE_INPUT), { target: { value: '写周报(已修改)' } });
    // 800 毫秒的防抖还没到就换了任务
    act(() => { useUIStore.getState().setSelectedTaskId('b'); });
    await waitLongerThanAutosave();

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', title: '写周报(已修改)' }),
      expect.anything(),
    );
    expect(mocks.update).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), expect.anything());
    expect(screen.getByPlaceholderText(TITLE_INPUT)).toHaveValue('修 Bug');
  });
});
