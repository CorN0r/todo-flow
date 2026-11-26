import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { KanbanBoard } from '../../components/tasks/KanbanBoard';
import { buildTask, renderWithProviders } from '../test-utils';
import { useUIStore } from '../../stores/uiStore';

const mockTags = { data: null as any };

vi.mock('../../hooks/useTasks', () => ({
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useCreateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => mockTags,
}));

// 按列头的文字找列。列头文字可能同时出现在卡片的标签上,所以不按文字全局查
function column(label: string) {
  const match = [...document.querySelectorAll<HTMLElement>('.rounded-xl')]
    .find((el) => el.querySelector('.font-semibold')?.textContent === label);
  if (!match) throw new Error(`没有名为 ${label} 的列`);
  return match;
}

describe('KanbanBoard', () => {
  beforeEach(() => {
    mockTags.data = null;
    useUIStore.setState({ sortMode: 'manual', theme: 'light' });
  });

  it('默认按优先级分列', () => {
    renderWithProviders(<KanbanBoard tasks={[
      buildTask({ id: 'a', title: '写周报', priority: 3 }),
      buildTask({ id: 'b', title: '取快递', priority: 0 }),
    ]} />);

    expect(within(column('高')).getByText('写周报')).toBeInTheDocument();
    expect(within(column('无')).getByText('取快递')).toBeInTheDocument();
  });

  it('已完成的任务照常出现在列中', () => {
    renderWithProviders(<KanbanBoard tasks={[
      buildTask({ id: 'done', title: '做完的事', priority: 2, is_completed: true }),
    ]} />);

    expect(within(column('中')).getByText('做完的事')).toBeInTheDocument();
  });

  it('切到按标签分组后出现无标签列', () => {
    mockTags.data = [{ id: 't1', name: 'Work', color: '#ff0000' }];
    renderWithProviders(<KanbanBoard tasks={[
      buildTask({ id: 'a', title: '工作上的事', tag_ids: ['t1'] }),
      buildTask({ id: 'b', title: '没打标签的事' }),
    ]} />);

    fireEvent.click(within(screen.getByRole('group', { name: '看板分组' })).getByRole('button', { name: '标签' }));

    expect(within(column('Work')).getByText('工作上的事')).toBeInTheDocument();
    expect(within(column('无标签')).getByText('没打标签的事')).toBeInTheDocument();
  });

  it('只有根任务占一张卡片', () => {
    renderWithProviders(<KanbanBoard tasks={[
      buildTask({ id: 'parent', title: '父任务', priority: 3 }),
      buildTask({ id: 'child', title: '子任务', priority: 3, parent_task_id: 'parent' }),
    ]} />);

    expect(screen.getByText('父任务')).toBeInTheDocument();
    expect(screen.queryByText('子任务')).not.toBeInTheDocument();
  });
});
