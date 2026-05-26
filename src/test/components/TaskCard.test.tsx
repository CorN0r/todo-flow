import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
}));

vi.mock('../../hooks/useLists', () => ({
  useLists: () => ({ data: null, isLoading: false }),
}));

const baseTask = {
  id: 'task-1',
  title: 'Test Task',
  description: 'A test description',
  is_completed: false,
  is_archived: false,
  priority: 0,
  due_date: null,
  list_id: null,
  parent_task_id: null,
  sort_order: 0,
  recurrence: null,
  reminder: null,
  created_at: '2026-05-25',
  updated_at: '2026-05-25',
  children_count: 0,
  tags: [],
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
    expect(screen.getByTitle('Urgent')).toBeInTheDocument();
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
    const withChildren = { ...baseTask, children_count: 3 };
    renderWithProviders(<TaskCard task={withChildren} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opens context menu on right click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskCard task={baseTask} />);
    const card = screen.getByRole('button', { name: /Test Task/i });
    await user.pointer({ target: card, keys: '[MouseRight]' });
    expect(screen.getByText('Mark complete')).toBeInTheDocument();
  });

  it('renders tag badges when task has tags', () => {
    const withTags = {
      ...baseTask,
      tags: [{ id: 'tag-1', name: 'important', color: '#ef4444', task_count: 1 }],
    };
    renderWithProviders(<TaskCard task={withTags} />);
    expect(screen.getByText('important')).toBeInTheDocument();
  });

  it('renders overflow badge when more than 2 tags', () => {
    const manyTags = {
      ...baseTask,
      tags: [
        { id: 'tag-1', name: 'a', color: '#111', task_count: 1 },
        { id: 'tag-2', name: 'b', color: '#222', task_count: 1 },
        { id: 'tag-3', name: 'c', color: '#333', task_count: 1 },
      ],
    };
    renderWithProviders(<TaskCard task={manyTags} />);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('shows selection checkbox in selection mode', () => {
    mockStoreState.selectionMode = true;
    const { container } = renderWithProviders(<TaskCard task={baseTask} />);
    const checkboxes = container.querySelectorAll('button');
    expect(checkboxes.length).toBeGreaterThan(1);
  });

  it('does not show priority when priority is 0', () => {
    renderWithProviders(<TaskCard task={baseTask} />);
    const flagIcons = screen.queryAllByTitle('Low').length +
      screen.queryAllByTitle('Medium').length +
      screen.queryAllByTitle('High').length +
      screen.queryAllByTitle('Urgent').length;
    expect(flagIcons).toBe(0);
  });

  it('renders priority colors for low priority', () => {
    const low = { ...baseTask, priority: 1 };
    renderWithProviders(<TaskCard task={low} />);
    expect(screen.getByTitle('Low')).toBeInTheDocument();
  });
});
