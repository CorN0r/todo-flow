export type SyncEntityType =
  | 'task'
  | 'task_reminder'
  | 'tag'
  | 'attachment'
  | 'habit'
  | 'habit_log'
  | 'setting';

export type SyncOperationType = 'create' | 'update' | 'reorder' | 'delete';

export type SyncOperationStatus = 'pending' | 'syncing' | 'acked' | 'failed';

export type SyncEntityStatus =
  | 'clean'
  | 'pending'
  | 'syncing'
  | 'failed'
  | 'conflicted'
  | 'deleted';

export interface SyncOperation {
  op_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperationType;
  base_revision: number | null;
  payload: unknown;
  client_time: string;
  device_id: string;
  status: SyncOperationStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
}

export interface CreateSyncOperationInput {
  op_id?: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperationType;
  base_revision?: number | null;
  payload: unknown;
  client_time?: string;
  device_id: string;
}

export interface SyncConflict {
  id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  local_payload: unknown;
  remote_payload: unknown;
  created_at: string;
  resolved_at: string | null;
}

export interface CreateSyncConflictInput {
  id?: string;
  entity_type: SyncEntityType;
  entity_id: string;
  local_payload: unknown;
  remote_payload: unknown;
  created_at?: string;
}

export interface SyncMetaEntry {
  key: string;
  value: string;
}
