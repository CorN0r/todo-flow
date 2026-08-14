import { describe, expect, it, vi, beforeEach } from 'vitest';
import { desktopRepositories } from '../../domain/adapters/desktop';
import * as db from '../../lib/db';
import type { Habit } from '../../types/habit';
import type { Tag } from '../../types/tag';
import type { Task, TaskReminder } from '../../types/task';

vi.mock('../../lib/db', () => ({
  createTask: vi.fn(),
  getTasks: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getTaskReminders: vi.fn(),
  createTaskReminder: vi.fn(),
  createTag: vi.fn(),
  getTags: vi.fn(),
  createHabit: vi.fn(),
  getHabits: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

const task: Task = {
  id: 'task-1',
  title: 'Task',
  description: '',
  is_completed: false,
  is_archived: false,
  is_suspended: false,
  is_abandoned: false,
  is_pinned: false,
  priority: 0,
  due_date: null,
  reminder: null,
  tag_ids: [],
  parent_task_id: null,
  sort_order: 0,
  recurrence: null,
  my_day_date: null,
  created_at: '2026-07-06T00:00:00Z',
  updated_at: '2026-07-06T00:00:00Z',
};

const reminder: TaskReminder = {
  id: 'reminder-1',
  task_id: task.id,
  offset: 'at_time',
  reminder_time: '2026-07-06T08:00:00Z',
  reminded: false,
  created_at: '2026-07-06T00:00:00Z',
};

const tag: Tag = {
  id: 'tag-1',
  name: 'Work',
  color: '#6366f1',
  icon: 'tag',
  sort_order: 0,
  parent_tag_id: null,
  created_at: '2026-07-06T00:00:00Z',
  updated_at: '2026-07-06T00:00:00Z',
};

const habit: Habit = {
  id: 'habit-1',
  name: 'Read',
  color: '#10b981',
  icon: 'book',
  frequency: 'daily',
  target_count: 1,
  sort_order: 0,
  created_at: '2026-07-06T00:00:00Z',
  updated_at: '2026-07-06T00:00:00Z',
};

describe('desktopRepositories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes task flow through the desktop db adapter', async () => {
    vi.mocked(db.createTask).mockResolvedValue(task);
    vi.mocked(db.getTasks).mockResolvedValue([task]);
    vi.mocked(db.updateTask).mockResolvedValue({ ...task, is_completed: true });
    vi.mocked(db.deleteTask).mockResolvedValue(undefined);

    await expect(desktopRepositories.tasks.create({ title: 'Task' })).resolves.toEqual(task);
    await expect(desktopRepositories.tasks.list({ include_children: true })).resolves.toEqual([task]);
    await expect(desktopRepositories.tasks.update({ id: task.id, is_completed: true })).resolves.toMatchObject({ is_completed: true });
    await expect(desktopRepositories.tasks.delete(task.id)).resolves.toBeUndefined();

    expect(db.createTask).toHaveBeenCalledWith({ title: 'Task' });
    expect(db.getTasks).toHaveBeenCalledWith({ include_children: true });
    expect(db.updateTask).toHaveBeenCalledWith({ id: task.id, is_completed: true });
    expect(db.deleteTask).toHaveBeenCalledWith(task.id);
  });

  it('routes reminder flow through the desktop db adapter', async () => {
    vi.mocked(db.getTaskReminders).mockResolvedValue([reminder]);
    vi.mocked(db.createTaskReminder).mockResolvedValue(reminder);

    await expect(desktopRepositories.reminders.listForTask(task.id)).resolves.toEqual([reminder]);
    await expect(desktopRepositories.reminders.create({ taskId: task.id, offset: 'at_time' })).resolves.toEqual(reminder);

    expect(db.getTaskReminders).toHaveBeenCalledWith(task.id);
    expect(db.createTaskReminder).toHaveBeenCalledWith(task.id, 'at_time', undefined);
  });

  it('routes tag flow through the desktop db adapter', async () => {
    vi.mocked(db.createTag).mockResolvedValue(tag);
    vi.mocked(db.getTags).mockResolvedValue([{ ...tag, task_count: 0, incomplete_count: 0, children: [] }]);

    await expect(desktopRepositories.tags.create({ name: 'Work' })).resolves.toEqual(tag);
    await expect(desktopRepositories.tags.list()).resolves.toHaveLength(1);

    expect(db.createTag).toHaveBeenCalledWith({ name: 'Work' });
    expect(db.getTags).toHaveBeenCalled();
  });

  it('routes habit flow through the desktop db adapter', async () => {
    vi.mocked(db.createHabit).mockResolvedValue(habit);
    vi.mocked(db.getHabits).mockResolvedValue([{ ...habit, current_streak: 0, best_streak: 0, completion_rate: 0, is_done_today: false }]);

    await expect(desktopRepositories.habits.create({ name: 'Read' })).resolves.toEqual(habit);
    await expect(desktopRepositories.habits.list()).resolves.toHaveLength(1);

    expect(db.createHabit).toHaveBeenCalledWith({ name: 'Read' });
    expect(db.getHabits).toHaveBeenCalled();
  });

  it('routes settings flow through the desktop db adapter', async () => {
    vi.mocked(db.getSetting).mockResolvedValue('dark');
    vi.mocked(db.setSetting).mockResolvedValue(undefined);

    await expect(desktopRepositories.settings.get('theme')).resolves.toBe('dark');
    await expect(desktopRepositories.settings.set('theme', 'lumina')).resolves.toBeUndefined();

    expect(db.getSetting).toHaveBeenCalledWith('theme');
    expect(db.setSetting).toHaveBeenCalledWith('theme', 'lumina');
  });
});
