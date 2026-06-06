import type { SortMode } from '../components/shared/PageTitle';
import type { Task } from '../types/task';
import { isOverdue } from './date';

export function nestChildren(tasks: Task[]): Task[] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_task_id) {
      const list = map.get(t.parent_task_id) || [];
      list.push(t);
      map.set(t.parent_task_id, list);
    }
  }
  return tasks
    .filter((t) => !t.parent_task_id)
    .map((t) => ({ ...t, children: map.get(t.id) || [] }));
}

function pinFirst(a: Task, b: Task): number {
  if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
  return 0;
}

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const sorted = [...tasks];
  switch (mode) {
    case 'date-asc': return sorted.sort((a, b) => pinFirst(a, b) || (
      !a.due_date && !b.due_date ? 0 : !a.due_date ? 1 : !b.due_date ? -1 : a.due_date.localeCompare(b.due_date)));
    case 'date-desc': return sorted.sort((a, b) => pinFirst(a, b) || (
      !a.due_date && !b.due_date ? 0 : !a.due_date ? 1 : !b.due_date ? -1 : b.due_date.localeCompare(a.due_date)));
    case 'priority': return sorted.sort((a, b) => pinFirst(a, b) || b.priority - a.priority);
    case 'alpha-asc': return sorted.sort((a, b) => pinFirst(a, b) || a.title.localeCompare(b.title));
    case 'alpha-desc': return sorted.sort((a, b) => pinFirst(a, b) || b.title.localeCompare(a.title));
    case 'created-desc': return sorted.sort((a, b) => pinFirst(a, b) || b.created_at.localeCompare(a.created_at));
    case 'created-asc': return sorted.sort((a, b) => pinFirst(a, b) || a.created_at.localeCompare(b.created_at));
    case 'status': return sorted.sort((a, b) => {
      const pinned = pinFirst(a, b);
      if (pinned) return pinned;
      const aStatus = (isOverdue(a.due_date) && !a.is_completed && !a.is_abandoned) ? 0 : a.is_completed ? 4 : a.is_abandoned ? 3 : a.is_suspended ? 2 : 1;
      const bStatus = (isOverdue(b.due_date) && !b.is_completed && !b.is_abandoned) ? 0 : b.is_completed ? 4 : b.is_abandoned ? 3 : b.is_suspended ? 2 : 1;
      if (aStatus !== bStatus) return aStatus - bStatus;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    default: return sorted.sort((a, b) => pinFirst(a, b) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
}
