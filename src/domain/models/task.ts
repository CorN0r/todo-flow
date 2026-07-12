export type {
  CreateTaskInput,
  ReorderItem,
  Task,
  TaskDetail,
  UpdateTaskInput,
} from '../../types/task';

export interface TaskFilters {
  tag_id?: string;
  is_completed?: boolean;
  due_date_from?: string;
  due_date_to?: string;
  search_query?: string;
  parent_task_id?: string;
  my_day_date?: string;
  priority?: number;
  is_suspended?: boolean;
  is_abandoned?: boolean;
  include_children?: boolean;
  include_archived?: boolean;
}

export interface SyncMetadataFields {
  deleted_at?: string | null;
  server_revision?: number | null;
  local_revision?: number;
  last_modified_device_id?: string | null;
  sync_status?: string | null;
}
