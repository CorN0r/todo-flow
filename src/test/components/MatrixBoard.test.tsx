import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { MatrixBoard } from '../../components/tasks/MatrixBoard';
import { buildTask, renderWithProviders } from '../test-utils';
import { useUIStore } from '../../stores/uiStore';
import { format } from '../../lib/date';

vi.mock('../../hooks/useTasks', () => ({
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useCreateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
  useToggleMyDay: () => vi.fn(),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

function quadrant(title: string) {
  return screen.getByText(title).closest('.rounded-xl') as HTMLElement;
}

describe('MatrixBoard', () => {
  beforeEach(() => {
    useUIStore.setState({ sortMode: 'manual', theme: 'light', selectionMode: false, selectedTaskIds: new Set() });
  });

  it('四个象限都在,按紧急性和重要性分开放', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    renderWithProviders(<MatrixBoard tasks={[
      buildTask({ id: 'urgent', title: '救火', priority: 3, due_date: today }),
      buildTask({ id: 'later', title: '慢慢来', priority: 3 }),
      buildTask({ id: 'low', title: '闲事', priority: 0 }),
    ]} />);

    for (const title of ['立即处理', '计划安排', '委派他人', '可删除']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(within(quadrant('立即处理')).getByText('救火')).toBeInTheDocument();
    expect(within(quadrant('计划安排')).getByText('慢慢来')).toBeInTheDocument();
    expect(within(quadrant('可删除')).getByText('闲事')).toBeInTheDocument();
  });

  it('已完成和已放弃的任务不进象限', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    renderWithProviders(<MatrixBoard tasks={[
      buildTask({ id: 'open', title: '还要做', priority: 3, due_date: today }),
      buildTask({ id: 'done', title: '做完的事', priority: 3, due_date: today, is_completed: true }),
      buildTask({ id: 'dropped', title: '放弃的事', priority: 3, due_date: today, is_abandoned: true }),
    ]} />);

    expect(screen.getByText('还要做')).toBeInTheDocument();
    expect(screen.queryByText('做完的事')).not.toBeInTheDocument();
    expect(screen.queryByText('放弃的事')).not.toBeInTheDocument();
  });

  it('范围内没有可安排的任务时给出说明', () => {
    renderWithProviders(<MatrixBoard tasks={[
      buildTask({ id: 'done', title: '做完的事', priority: 3, is_completed: true }),
    ]} />);

    expect(screen.getByText('没有可安排的任务')).toBeInTheDocument();
    expect(screen.getByText('四象限只显示未完成的任务')).toBeInTheDocument();
  });
});
