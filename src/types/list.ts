export interface TodoList {
  id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ListWithCount extends TodoList {
  task_count: number;
  incomplete_count: number;
}

export interface CreateListInput {
  name: string;
  color?: string;
  icon?: string;
}
