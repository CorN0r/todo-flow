export type { CreateTagInput, Tag, TagWithCount } from '../../types/tag';

export interface UpdateTagInput {
  name?: string;
  color?: string;
  parent_tag_id?: string | null;
}

export interface ReorderTagItem {
  id: string;
  sort_order: number;
}
