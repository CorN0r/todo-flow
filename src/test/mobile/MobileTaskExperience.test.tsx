import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileApp } from '../../mobile/MobileApp';
import { MobileTaskDetailSheet } from '../../mobile/components/MobileTaskDetailSheet';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { resetRepositories, setRepositoriesForTesting } from '../../domain/repositories/current';
import type { Task } from '../../types/task';
import type { Tag } from '../../types/tag';
import { buildTask, renderWithProviders } from '../test-utils';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const tag: Tag = {
  id: 'tag-work',
  name: 'Work',
  color: '#2563EB',
  icon: 'tag',
  sort_order: 0,
  parent_tag_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderMobile(initialEntry = '/mobile/today', tasks: Task[] = []) {
  const memory = createMemoryRepositories({ tasks, tags: [tag] });
  setRepositoriesForTesting(memory.repositories);
  const result = renderWithProviders(
    <Routes>
      <Route path="/mobile/*" element={<MobileApp />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
  return { ...result, state: memory.state };
}

describe('Mobile task experience', () => {
  beforeEach(() => {
    setRepositoriesForTesting(createMemoryRepositories({ tags: [tag] }).repositories);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRepositories();
  });

  it('shows today, My Day, overdue, and task card visual signals', async () => {
    const today = todayISO();
    const tasks: Task[] = [
      buildTask({ id: 'overdue', title: 'Pay bill', due_date: yesterdayISO(), priority: 3, tag_id: tag.id }),
      buildTask({ id: 'my-day', title: 'Plan sprint', my_day_date: today, reminder: 'at_due_time' }),
      buildTask({ id: 'due-today', title: 'Ship build', due_date: today, sync_status: 'pending' } as Partial<Task>),
    ];

    renderMobile('/mobile/today', tasks);

    expect(await screen.findByText('逾期')).toBeInTheDocument();
    expect(screen.getAllByText('我的一天').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('今天到期')).toBeInTheDocument();
    expect(screen.getByText('Pay bill')).toBeInTheDocument();
    expect(screen.getByText('高')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('提醒')).toBeInTheDocument();
    expect(screen.getByText('待同步')).toBeInTheDocument();
  });

  it('creates a task from the global mobile FAB', async () => {
    const user = userEvent.setup();
    renderMobile();

    await user.click(screen.getByLabelText('新增任务'));
    await user.type(screen.getByPlaceholderText('写下要做的事'), '买牛奶');
    await user.click(screen.getByText('高'));
    await user.click(screen.getByText('到期时'));
    await user.click(screen.getByText('Work'));
    await user.click(screen.getByText('创建任务'));

    expect(await screen.findByText('买牛奶')).toBeInTheDocument();
    expect(screen.getByText('高')).toBeInTheDocument();
    expect(screen.getByText('提醒')).toBeInTheDocument();
  });

  it('toggles completion immediately from the mobile task card', async () => {
    const user = userEvent.setup();
    renderMobile('/mobile/today', [
      buildTask({ id: 'task-1', title: 'Review notes', due_date: todayISO(), is_completed: false }),
    ]);

    const toggle = await screen.findByLabelText('完成任务');
    await user.click(toggle);

    await waitFor(() => expect(screen.getByLabelText('标记为未完成')).toBeInTheDocument());
  });

  it('keeps repeated mobile controls at Android-safe touch target sizes', async () => {
    renderMobile('/mobile/today', [
      buildTask({ id: 'task-1', title: 'Review notes', due_date: todayISO(), is_completed: false }),
    ]);

    const nav = screen.getByRole('navigation', { name: '主导航' });
    for (const link of within(nav).getAllByRole('link')) {
      expect(link).toHaveClass('min-h-14');
    }
    expect(screen.getByLabelText('新增任务')).toHaveClass('min-h-14');
    expect(await screen.findByLabelText('完成任务')).toHaveClass('min-h-11');
  });

  it('filters, searches, sorts, and enters tags on the Tasks tab', async () => {
    const user = userEvent.setup();
    renderMobile('/mobile/tasks', [
      buildTask({ id: 'task-a', title: 'Milk run', tag_id: tag.id, priority: 1 }),
      buildTask({ id: 'task-b', title: 'Done item', is_completed: true, priority: 4 }),
    ]);

    await user.type(screen.getByPlaceholderText('搜索任务'), 'Milk');
    expect(await screen.findByText('Milk run')).toBeInTheDocument();
    expect(screen.queryByText('Done item')).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('搜索任务'));
    await user.click(await screen.findByRole('button', { name: '已完成 1' }));
    expect(await screen.findByText('Done item')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '全部 2' }));
    await user.click(screen.getByText('优先级'));
    const tagControls = screen.getAllByText('Work');
    await user.click(tagControls[0]);

    const content = screen.getByRole('heading', { name: '任务' }).closest('section')!;
    expect(within(content).getByText('Milk run')).toBeInTheDocument();
    expect(within(content).queryByText('Done item')).not.toBeInTheDocument();
  });

  it('filters suspended and abandoned tasks after search and tag scoping', async () => {
    const user = userEvent.setup();
    renderMobile('/mobile/tasks', [
      buildTask({ id: 'active', title: 'Active item' }),
      buildTask({ id: 'paused', title: 'Paused work', tag_id: tag.id, is_suspended: true }),
      buildTask({ id: 'abandoned', title: 'Abandoned item', is_abandoned: true }),
    ]);

    expect(await screen.findByText('Active item')).toBeInTheDocument();
    expect(screen.queryByText('Paused work')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '进行中 1' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: '挂起 1' }));
    expect(await screen.findByText('Paused work')).toBeInTheDocument();
    expect(screen.queryByText('Active item')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('搜索任务'), 'Paused');
    const tagControls = screen.getAllByText('Work');
    await user.click(tagControls[0]);
    expect(screen.getByRole('button', { name: '挂起 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部 1' })).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('搜索任务'));
    await user.click(screen.getByText('全部标签'));
    await user.click(screen.getByRole('button', { name: '已放弃 1' }));
    expect(await screen.findByText('Abandoned item')).toBeInTheDocument();
  });

  it('restores the active default when re-entering the mobile Tasks tab', async () => {
    const user = userEvent.setup();
    renderMobile('/mobile/tasks', [
      buildTask({ id: 'active', title: 'Active item' }),
      buildTask({ id: 'done', title: 'Done item', is_completed: true }),
    ]);

    await user.click(await screen.findByRole('button', { name: '已完成 1' }));
    expect(await screen.findByText('Done item')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: '主导航' });
    await user.click(within(nav).getByRole('link', { name: '设置' }));
    await user.click(within(nav).getByRole('link', { name: '任务' }));

    expect(await screen.findByText('Active item')).toBeInTheDocument();
    expect(screen.queryByText('Done item')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '进行中 1' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens mobile task detail and edits task fields locally', async () => {
    const user = userEvent.setup();
    const { state } = renderMobile('/mobile/tasks', [
      buildTask({ id: 'task-detail', title: 'Draft note', due_date: todayISO(), priority: 1, sync_status: 'pending' } as Partial<Task>),
    ]);

    await user.click(await screen.findByText('Draft note'));
    const dialog = await screen.findByRole('dialog', { name: '\u4efb\u52a1\u8be6\u60c5' });

    const title = within(dialog).getByLabelText('\u6807\u9898');
    await user.clear(title);
    await user.type(title, 'Edited note');
    await user.click(within(dialog).getByText('\u9ad8'));
    await user.click(within(dialog).getByText('\u660e\u5929'));
    await user.click(within(dialog).getByText('\u5230\u671f\u65f6'));
    await user.click(within(dialog).getByText('Work'));
    await user.click(within(dialog).getByText('\u6bcf\u5468'));
    await user.type(within(dialog).getByLabelText('\u63cf\u8ff0'), 'Detail body');
    await user.click(within(dialog).getByText('\u4fdd\u5b58\u4fee\u6539'));

    await waitFor(() => {
      const edited = state.tasks.find((task) => task.id === 'task-detail');
      expect(edited?.title).toBe('Edited note');
      expect(edited?.priority).toBe(3);
      expect(edited?.tag_id).toBe(tag.id);
      expect(edited?.reminder).toBe('at_due_time');
      expect(edited?.description).toBe('Detail body');
      expect(edited?.recurrence).toContain('weekly');
    });
  });

  it('opens a touch action sheet from long press without a right-click dependency', async () => {
    const { state } = renderMobile('/mobile/tasks', [
      buildTask({ id: 'task-long-press', title: 'Long press task', is_completed: false }),
    ]);

    const cardText = await screen.findByText('Long press task');
    vi.useFakeTimers();
    fireEvent.pointerDown(cardText);
    vi.advanceTimersByTime(530);
    fireEvent.pointerUp(cardText);
    vi.useRealTimers();

    const actionSheet = await screen.findByRole('dialog', { name: '\u4efb\u52a1\u64cd\u4f5c' });
    fireEvent.click(within(actionSheet).getByText('\u5b8c\u6210\u4efb\u52a1'));

    await waitFor(() => expect(state.tasks.find((task) => task.id === 'task-long-press')?.is_completed).toBe(true));
  });

  it('creates, toggles, and deletes mobile subtasks from detail', async () => {
    const user = userEvent.setup();
    const { state } = renderMobile('/mobile/tasks', [
      buildTask({ id: 'parent-task', title: 'Parent task' }),
      buildTask({ id: 'existing-child', title: 'Existing child', parent_task_id: 'parent-task' }),
    ]);

    await user.click(await screen.findByText('Parent task'));
    const dialog = await screen.findByRole('dialog', { name: '\u4efb\u52a1\u8be6\u60c5' });

    expect(within(dialog).getByText('Existing child')).toBeInTheDocument();
    const subtaskInput = within(dialog).getAllByLabelText('\u65b0\u589e\u5b50\u4efb\u52a1')[0];
    await user.type(subtaskInput, 'Mobile child{enter}');

    await waitFor(() => {
      expect(state.tasks.some((task) => task.title === 'Mobile child' && task.parent_task_id === 'parent-task')).toBe(true);
    });

    const childRow = within(dialog).getByText('Mobile child').closest('div')!;
    await user.click(within(childRow).getByLabelText('\u5b8c\u6210\u4efb\u52a1'));
    await waitFor(() => expect(state.tasks.find((task) => task.title === 'Mobile child')?.is_completed).toBe(true));

    await user.click(within(childRow).getByLabelText('\u5220\u9664\u4efb\u52a1'));
    await waitFor(() => expect(state.tasks.some((task) => task.title === 'Mobile child')).toBe(false));
  });

  it('prevents mobile subtasks from nesting beyond TodoFlow two-level depth', async () => {
    const memory = createMemoryRepositories({
      tasks: [
        buildTask({ id: 'parent-task', title: 'Parent task' }),
        buildTask({ id: 'child-task', title: 'Child task', parent_task_id: 'parent-task' }),
      ],
      tags: [tag],
    });
    setRepositoriesForTesting(memory.repositories);

    renderWithProviders(
      <MobileTaskDetailSheet taskId="child-task" open onClose={() => {}} />,
    );

    expect(await screen.findByText('\u5b50\u4efb\u52a1\u4e0d\u80fd\u518d\u7ee7\u7eed\u6dfb\u52a0\u4e0b\u4e00\u5c42')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('\u5199\u4e0b\u5b50\u4efb\u52a1')).not.toBeInTheDocument();
  });

  it('uses scalable mobile text tokens, motion hooks, and sync indicators', async () => {
    const user = userEvent.setup();
    renderMobile('/mobile/tasks', [
      buildTask({ id: 'task-motion', title: 'Motion task', sync_status: 'pending' } as Partial<Task>),
    ]);

    const root = document.querySelector('[data-app-surface="mobile"]') as HTMLElement;
    expect(root.style.getPropertyValue('--mobile-font-body')).toBe('0.9375rem');

    const nav = screen.getByRole('navigation', { name: '\u4e3b\u5bfc\u822a' });
    expect(within(nav).getAllByRole('link')[0]).toHaveClass('mobile-nav-motion');
    expect(await screen.findByText('\u5f85\u540c\u6b65')).toBeInTheDocument();

    await user.click(screen.getByLabelText('\u65b0\u589e\u4efb\u52a1'));
    expect(screen.getByText('\u672c\u5730\u4f18\u5148')).toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText('\u5173\u95ed')[0]);

    await user.click(screen.getByText('Motion task'));
    const dialog = await screen.findByRole('dialog', { name: '\u4efb\u52a1\u8be6\u60c5' });
    expect(dialog).toHaveAttribute('data-motion', 'mobile-sheet');
    expect(document.querySelector('[data-motion="mobile-task-detail"]')).toBeInTheDocument();
    expect(within(dialog).getByText('\u540c\u6b65\u72b6\u6001')).toBeInTheDocument();
  });

  it('keeps create, edit, complete, delete, and reopen workflows local while offline', async () => {
    const user = userEvent.setup();
    const { state } = renderMobile('/mobile/tasks', [
      buildTask({ id: 'offline-task', title: 'Offline start', is_completed: false }),
    ]);

    await user.click(await screen.findByLabelText('\u5b8c\u6210\u4efb\u52a1'));
    await waitFor(() => expect(state.tasks.find((task) => task.id === 'offline-task')?.is_completed).toBe(true));

    await user.click(screen.getByRole('button', { name: '\u5df2\u5b8c\u6210 1' }));
    await user.click(await screen.findByLabelText('\u6807\u8bb0\u4e3a\u672a\u5b8c\u6210'));
    await waitFor(() => expect(state.tasks.find((task) => task.id === 'offline-task')?.is_completed).toBe(false));
    await user.click(screen.getByRole('button', { name: '\u8fdb\u884c\u4e2d 1' }));

    await user.click(screen.getByLabelText('\u65b0\u589e\u4efb\u52a1'));
    await user.type(screen.getByPlaceholderText('\u5199\u4e0b\u8981\u505a\u7684\u4e8b'), 'Offline capture');
    await user.click(screen.getByText('\u521b\u5efa\u4efb\u52a1'));
    await waitFor(() => expect(state.tasks.some((task) => task.title === 'Offline capture')).toBe(true));

    await user.click(screen.getByText('Offline start'));
    const dialog = await screen.findByRole('dialog', { name: '\u4efb\u52a1\u8be6\u60c5' });
    const title = within(dialog).getByLabelText('\u6807\u9898');
    await user.clear(title);
    await user.type(title, 'Offline edited');
    await user.click(within(dialog).getByText('\u4fdd\u5b58\u4fee\u6539'));
    await waitFor(() => expect(state.tasks.find((task) => task.id === 'offline-task')?.title).toBe('Offline edited'));

    await user.click(within(dialog).getByText('\u5220\u9664\u4efb\u52a1'));
    await waitFor(() => expect(state.tasks.some((task) => task.id === 'offline-task')).toBe(false));
  });
});
