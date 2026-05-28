import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskCard } from '../../components/tasks/TaskCard';
import { renderWithTheme, buildTask, resetTheme } from '../test-utils';

const storeState = {
  selectionMode: false,
  selectedTaskIds: new Set<string>(),
  setSelectedTaskId: vi.fn(),
  enterSelectionMode: vi.fn(),
  toggleTaskSelection: vi.fn(),
};

vi.mock('../../stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: any) => {
    if (typeof selector === 'function') return selector(storeState);
    return storeState;
  }),
}));

vi.mock('../../hooks/useTasks', () => ({
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useCreateTask: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [{ id: 't1', name: 'Work', color: '#ff0000', icon: 'tag', sort_order: 0 }], isLoading: false }),
}));

describe('TaskCard visual matrix', () => {
  beforeEach(() => {
    storeState.selectionMode = false;
    storeState.selectedTaskIds = new Set();
  });

  afterEach(() => {
    resetTheme();
  });

  const snapshot = (element: HTMLElement) => {
    return element.innerHTML;
  };

  // ─── Light theme ───

  it('light: default', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({ title: 'Buy groceries' })} />, 'light');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('light: completed', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({ title: 'Call dentist', is_completed: true })} />, 'light');
    expect(screen.getByText('Call dentist')).toBeInTheDocument();
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('light: overdue', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({ title: 'Pay rent', due_date: '2026-01-01' })} />, 'light');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('light: high priority', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({ title: 'Urgent report', priority: 3 })} />, 'light');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('light: with due date', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({
      title: 'Team sync',
      due_date: '2026-06-15',
    })} />, 'light');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('light: completed with overdue date', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({
      title: 'Old task',
      is_completed: true,
      due_date: '2026-01-15',
    })} />, 'light');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('light: with subtasks', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({ title: 'Project setup', children_count: 3 })} />, 'light');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('light: selected in selection mode', () => {
    storeState.selectionMode = true;
    storeState.selectedTaskIds = new Set(['test-1']);
    const { container } = renderWithTheme(<TaskCard task={buildTask({ id: 'test-1', title: 'Selected task' })} />, 'light');
    expect(snapshot(container)).toMatchSnapshot();
  });

  // ─── Dark theme ───

  it('dark: default', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({ title: 'Buy groceries' })} />, 'dark');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('dark: completed', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({ title: 'Call dentist', is_completed: true })} />, 'dark');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('dark: overdue', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({ title: 'Pay rent', due_date: '2026-01-01' })} />, 'dark');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('dark: high priority', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({ title: 'Urgent report', priority: 3 })} />, 'dark');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('dark: with due date', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({
      title: 'Team sync',
      due_date: '2026-06-15',
    })} />, 'dark');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('dark: completed with overdue date', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({
      title: 'Old task',
      is_completed: true,
      due_date: '2026-01-15',
    })} />, 'dark');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('dark: with subtasks', () => {
    const { container } = renderWithTheme(<TaskCard task={buildTask({ title: 'Project setup', children_count: 3 })} />, 'dark');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('dark: selected in selection mode', () => {
    storeState.selectionMode = true;
    storeState.selectedTaskIds = new Set(['test-1']);
    const { container } = renderWithTheme(<TaskCard task={buildTask({ id: 'test-1', title: 'Selected task' })} />, 'dark');
    expect(snapshot(container)).toMatchSnapshot();
  });
});
