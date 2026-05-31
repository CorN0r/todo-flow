import type { SortMode } from '../components/shared/PageTitle';
import type { Task } from '../types/task';

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

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const sorted = [...tasks];
  switch (mode) {
    case 'date-asc': return sorted.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
    case 'date-desc': return sorted.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return b.due_date.localeCompare(a.due_date);
    });
    case 'priority': return sorted.sort((a, b) => b.priority - a.priority);
    case 'alpha-asc': return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'alpha-desc': return sorted.sort((a, b) => b.title.localeCompare(a.title));
    case 'created-desc': return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case 'created-asc': return sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    default: return sorted.sort((a, b) => {
      if (a.is_completed !== b.is_completed) return Number(a.is_completed) - Number(b.is_completed);
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }
}
