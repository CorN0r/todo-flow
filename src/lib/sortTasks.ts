import type { SortMode } from '../components/shared/PageTitle';
import type { Task } from '../types/task';

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const sorted = [...tasks];
  switch (mode) {
    case 'date-asc': return sorted.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    case 'date-desc': return sorted.sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''));
    case 'priority': return sorted.sort((a, b) => b.priority - a.priority);
    case 'alpha-asc': return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'alpha-desc': return sorted.sort((a, b) => b.title.localeCompare(a.title));
    case 'created-desc': return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case 'created-asc': return sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    default: return sorted;
  }
}
