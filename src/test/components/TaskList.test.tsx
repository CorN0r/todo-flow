import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskList } from '../../components/tasks/TaskList';
import { renderWithProviders, buildTask } from '../test-utils';

vi.mock('../../hooks/useTasks', () => ({
  useReorderTasks: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useCreateTask: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: null, isLoading: false }),
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: any) => {
    const state = {
      selectedTaskId: null,
      setSelectedTaskId: vi.fn(),
      selectionMode: false,
      selectedTaskIds: new Set(),
      enterSelectionMode: vi.fn(),
      toggleTaskSelection: vi.fn(),
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  }),
}));

describe('TaskList', () => {
  it('renders task cards for each task', () => {
    const tasks = [
      buildTask({ id: 'task-1', title: 'First Task' }),
      buildTask({ id: 'task-2', title: 'Second Task' }),
    ];
    renderWithProviders(<TaskList tasks={tasks} />);
    expect(screen.getByText('First Task')).toBeInTheDocument();
    expect(screen.getByText('Second Task')).toBeInTheDocument();
  });

  it('renders empty container when no tasks', () => {
    const { container } = renderWithProviders(<TaskList tasks={[]} />);
    const dnd = container.querySelector('.flex.flex-col');
    expect(dnd).toBeInTheDocument();
    expect(dnd?.children.length).toBe(0);
  });
});
