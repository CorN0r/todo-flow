import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodayPage } from '../../pages/TodayPage';
import { buildTask, renderWithProviders } from '../test-utils';
import { useUIStore } from '../../stores/uiStore';

const mockState = { data: null as any, isLoading: false, isError: false };

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => mockState,
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

describe('TodayPage', () => {
  beforeEach(() => {
    mockState.data = null;
    mockState.isLoading = false;
    mockState.isError = false;
    useUIStore.setState({ taskStatusFilter: 'all', taskViewMode: 'list', selectedTaskId: null, selectedTaskIds: new Set() });
  });

  it('shows loading skeleton when isLoading', () => {
    mockState.isLoading = true;
    mockState.data = undefined;
    renderWithProviders(<TodayPage />);
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders header with Today text', () => {
    mockState.data = [];
    renderWithProviders(<TodayPage />);
    expect(screen.getByText('\u4eca\u5929')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    mockState.data = [];
    renderWithProviders(<TodayPage />);
    expect(screen.getByText('\u4eca\u5929\u6ca1\u6709\u5230\u671f\u4efb\u52a1')).toBeInTheDocument();
  });

  it('shows task count when tasks exist', () => {
    mockState.data = [
      buildTask({ id: 't1', title: 'Task 1', due_date: '2026-05-25' }),
    ];
    renderWithProviders(<TodayPage />);
    expect(screen.getByRole('button', { name: '\u5168\u90e8 1' })).toBeInTheDocument();
  });

  it('shows plural task count', () => {
    mockState.data = [
      buildTask({ id: 't1', title: 'T1', due_date: '2026-05-25' }),
      buildTask({ id: 't2', title: 'T2', due_date: '2026-05-25' }),
    ];
    renderWithProviders(<TodayPage />);
    expect(screen.getByRole('button', { name: '\u5168\u90e8 2' })).toBeInTheDocument();
  });

  it('filters completed and suspended tasks with exclusive counts', async () => {
    const user = userEvent.setup();
    mockState.data = [
      buildTask({ id: 'active', title: 'Active task' }),
      buildTask({ id: 'done', title: 'Done task', is_completed: true }),
      buildTask({ id: 'paused', title: 'Paused task', is_suspended: true }),
      buildTask({ id: 'abandoned', title: 'Abandoned task', is_abandoned: true }),
    ];
    renderWithProviders(<TodayPage />);

    await user.click(screen.getByRole('button', { name: '\u5df2\u5b8c\u6210 1' }));
    expect(screen.getByText('Done task')).toBeInTheDocument();
    expect(screen.queryByText('Active task')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '\u66f4\u591a\u72b6\u6001' }));
    await user.click(screen.getByRole('menuitemradio', { name: /\u6302\u8d77/ }));
    expect(screen.getByText('Paused task')).toBeInTheDocument();
    expect(screen.queryByText('Done task')).not.toBeInTheDocument();
  });

  it('shows a recoverable empty state for a status with no matches', async () => {
    const user = userEvent.setup();
    mockState.data = [buildTask({ id: 'active', title: 'Active task' })];
    renderWithProviders(<TodayPage />);

    await user.click(screen.getByRole('button', { name: '\u66f4\u591a\u72b6\u6001' }));
    await user.click(screen.getByRole('menuitemradio', { name: /\u6302\u8d77/ }));
    expect(screen.getByText('\u6ca1\u6709\u6302\u8d77\u4efb\u52a1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '\u663e\u793a\u5168\u90e8' }));
    expect(screen.getByText('Active task')).toBeInTheDocument();
  });
});
