import type { Task } from '../types/task';
import { todayISO } from './date';

export const TASK_STATUS_FILTERS = [
  'all',
  'active',
  'completed',
  'suspended',
  'abandoned',
  'overdue',
] as const;

export type TaskStatusFilter = (typeof TASK_STATUS_FILTERS)[number];
export type TaskPrimaryStatus = 'active' | 'completed' | 'suspended' | 'abandoned';
export type TaskStatusCounts = Record<TaskStatusFilter, number>;

export function classifyTaskStatus(task: Task): TaskPrimaryStatus {
  if (task.is_abandoned) return 'abandoned';
  if (task.is_completed) return 'completed';
  if (task.is_suspended) return 'suspended';
  return 'active';
}

export function isTaskOverdueForStatus(task: Task, today = todayISO()): boolean {
  return classifyTaskStatus(task) === 'active'
    && !!task.due_date
    && task.due_date.slice(0, 10) < today;
}

export function matchesTaskStatusFilter(
  task: Task,
  filter: TaskStatusFilter,
  today = todayISO(),
): boolean {
  if (task.is_archived || task.parent_task_id) return false;
  if (filter === 'all') return true;
  if (filter === 'overdue') return isTaskOverdueForStatus(task, today);
  return classifyTaskStatus(task) === filter;
}

export function filterTasksByStatus(
  tasks: Task[],
  filter: TaskStatusFilter,
  today = todayISO(),
): Task[] {
  return tasks.filter((task) => matchesTaskStatusFilter(task, filter, today));
}

export function getTaskStatusCounts(tasks: Task[], today = todayISO()): TaskStatusCounts {
  const counts: TaskStatusCounts = {
    all: 0,
    active: 0,
    completed: 0,
    suspended: 0,
    abandoned: 0,
    overdue: 0,
  };

  for (const task of tasks) {
    if (task.is_archived || task.parent_task_id) continue;
    counts.all += 1;
    const status = classifyTaskStatus(task);
    counts[status] += 1;
    if (isTaskOverdueForStatus(task, today)) counts.overdue += 1;
  }

  return counts;
}
