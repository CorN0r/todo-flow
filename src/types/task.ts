export interface Task {
  id: string;
  title: string;
  description: string;
  is_completed: boolean;
  is_archived: boolean;
  priority: number;
  due_date: string | null;
  reminder: string | null;
  list_id: string | null;
  parent_task_id: string | null;
  sort_order: number;
  recurrence: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskDetail {
  task: Task;
  children: Task[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  list_id?: string;
  parent_task_id?: string;
  due_date?: string;
  priority?: number;
  reminder?: string;
  recurrence?: string;
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string;
  is_completed?: boolean;
  priority?: number;
  due_date?: string;
  list_id?: string;
  parent_task_id?: string | null;
  reminder?: string;
  recurrence?: string;
}

export interface ReorderItem {
  id: string;
  sort_order: number;
  parent_task_id: string | null;
}
