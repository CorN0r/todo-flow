import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { DateFilterPage } from '../../pages/DateFilterPage';
import { renderWithProviders } from '../test-utils';
import { useUIStore } from '../../stores/uiStore';

const mockTasks = { data: null as any, isLoading: false, isError: false };

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => mockTasks,
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ filter: 'all' }),
    useNavigate: () => vi.fn(),
  };
});

describe('DateFilterPage', () => {
  beforeEach(() => {
    mockTasks.data = null;
    mockTasks.isLoading = false;
    mockTasks.isError = false;
    useUIStore.setState({ taskStatusFilter: 'all', selectedTaskId: null, selectedTaskIds: new Set() });
  });

  it('shows loading skeleton', () => {
    mockTasks.isLoading = true;
    mockTasks.data = undefined;
    renderWithProviders(<DateFilterPage />);
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders All Tasks for all filter', () => {
    mockTasks.data = [];
    renderWithProviders(<DateFilterPage />);
    expect(screen.getByText('\u5168\u90e8\u4efb\u52a1')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    mockTasks.data = [];
    renderWithProviders(<DateFilterPage />);
    expect(screen.getByText('\u6b64\u65f6\u95f4\u6bb5\u6682\u65e0\u4efb\u52a1')).toBeInTheDocument();
  });

  it('shows task count', () => {
    mockTasks.data = [{
      id: 't1', title: 'T1', is_completed: false, is_archived: false,
      is_suspended: false, is_abandoned: false, is_pinned: false,
      priority: 0, due_date: null, reminder: null, tag_ids: [],
      parent_task_id: null, sort_order: 0, recurrence: null,
      my_day_date: null, children_count: 0, created_at: '', updated_at: '',
    }];
    renderWithProviders(<DateFilterPage />);
    expect(screen.getByRole('button', { name: '\u5168\u90e8 1' })).toBeInTheDocument();
  });
});
