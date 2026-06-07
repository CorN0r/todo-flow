import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskCard } from '../../components/tasks/TaskCard';
import { renderWithProviders } from '../test-utils';

const mockStoreState = {
  selectedTaskId: null as string | null,
  setSelectedTaskId: vi.fn(),
  selectionMode: false,
  selectedTaskIds: new Set<string>(),
  enterSelectionMode: vi.fn(),
  toggleTaskSelection: vi.fn(),
};

vi.mock('../../stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: any) => {
    if (typeof selector === 'function') return selector(mockStoreState);
    return mockStoreState;
  }),
}));

vi.mock('../../hooks/useTasks', () => ({
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useCreateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: null, isLoading: false }),
}));

const baseTask = {
  id: 'task-1',
  title: 'Test Task',
  description: 'A test description',
  is_completed: false,
  is_archived: false,
  is_suspended: false,
  is_abandoned: false,
  is_pinned: false,
  priority: 0,
  due_date: null,
  tag_id: null,
  parent_task_id: null,
  sort_order: 0,
  recurrence: null,
  reminder: null,
  created_at: '2026-05-25',
  updated_at: '2026-05-25',
  children_count: 0,
  my_day_date: null,
};

describe('TaskCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.selectionMode = false;
    mockStoreState.selectedTaskIds = new Set();
  });

  it('renders the task title', () => {
    renderWithProviders(<TaskCard task={baseTask} />);
    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });

  it('renders the description when present', () => {
    renderWithProviders(<TaskCard task={baseTask} />);
    expect(screen.getByText('A test description')).toBeInTheDocument();
  });

  it('applies line-through when completed', () => {
    const completedTask = { ...baseTask, is_completed: true };
    renderWithProviders(<TaskCard task={completedTask} />);
    const title = screen.getByText('Test Task');
    expect(title.className).toContain('line-through');
  });

  it('renders priority indicator for priority > 0', () => {
    const highPriority = { ...baseTask, priority: 4 };
    renderWithProviders(<TaskCard task={highPriority} />);
    expect(screen.getByTitle('紧急')).toBeInTheDocument();
  });

  it('renders due date badge when set', () => {
    const dated = { ...baseTask, due_date: '2026-06-15' };
    renderWithProviders(<TaskCard task={dated} />);
    expect(screen.getByText(/Jun/)).toBeInTheDocument();
  });

  it('renders overdue styling for past dates', () => {
    const overdue = { ...baseTask, due_date: '2020-01-01' };
    renderWithProviders(<TaskCard task={overdue} />);
    const dateEl = screen.getByText(/Jan/);
    expect(dateEl.className).toContain('red');
  });

  it('shows child count badge when has children', () => {
    const withChildren = {
      ...baseTask,
      children: [
        { id: 'c1', title: 'Child 1', is_completed: false, parent_task_id: 'task-1' },
        { id: 'c2', title: 'Child 2', is_completed: true, parent_task_id: 'task-1' },
        { id: 'c3', title: 'Child 3', is_completed: false, parent_task_id: 'task-1' },
      ],
    } as any;
    renderWithProviders(<TaskCard task={withChildren} />);
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('shows selection checkbox in selection mode instead of completion circle', () => {
    mockStoreState.selectionMode = true;
    renderWithProviders(<TaskCard task={baseTask} />);
    expect(screen.getByLabelText(`选择 "Test Task"`)).toBeInTheDocument();
    expect(screen.queryByLabelText(`Mark "Test Task" complete`)).not.toBeInTheDocument();
  });

  it('does not show priority when priority is 0', () => {
    renderWithProviders(<TaskCard task={baseTask} />);
    const flagIcons = screen.queryAllByTitle('低').length +
      screen.queryAllByTitle('中').length +
      screen.queryAllByTitle('高').length +
      screen.queryAllByTitle('紧急').length;
    expect(flagIcons).toBe(0);
  });

  it('renders priority colors for low priority', () => {
    const low = { ...baseTask, priority: 1 };
    renderWithProviders(<TaskCard task={low} />);
    expect(screen.getByTitle('低')).toBeInTheDocument();
  });
});
