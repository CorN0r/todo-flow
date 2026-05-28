export interface Tag {
  id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  parent_tag_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TagWithCount extends Tag {
  task_count: number;
  incomplete_count: number;
  children: TagWithCount[];
}

export interface CreateTagInput {
  name: string;
  color?: string;
  parent_tag_id?: string;
}
