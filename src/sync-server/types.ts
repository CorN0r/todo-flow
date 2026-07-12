export type SyncEntityType =
  | 'task'
  | 'tag'
  | 'reminder'
  | 'habit'
  | 'habit_log'
  | 'setting'
  | 'attachment';

export type SyncOperationType = 'create' | 'update' | 'reorder' | 'delete';

export type JsonRecord = Record<string, unknown>;

export interface DeviceRegistrationRequest {
  client_device_key: string;
  platform: 'windows' | 'android' | 'ios' | 'harmonyos' | 'web' | 'test';
  display_name?: string;
  app_version?: string;
}

export interface RegisteredDevice {
  device_id: string;
  account_id: string;
  client_device_key: string;
  platform: DeviceRegistrationRequest['platform'];
  display_name: string | null;
  app_version: string | null;
  registered_at: string;
  last_seen_at: string;
}

export interface CanonicalEntity {
  account_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  payload: JsonRecord;
  revision: number;
  deleted_at: string | null;
  updated_at: string;
}

export interface RevisionedChange {
  revision: number;
  account_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperationType;
  payload: JsonRecord;
  deleted_at: string | null;
  device_id: string;
  operation_id: string;
  server_time: string;
}

export interface ClientSyncOperation {
  op_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperationType;
  payload: JsonRecord;
  base_revision?: number | null;
  client_time: string;
  device_id: string;
}

export interface PushRequest {
  device_id: string;
  operations: ClientSyncOperation[];
}

export interface AcceptedOperation {
  op_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  revision: number;
  status: 'accepted' | 'duplicate';
}

export interface SyncConflictResult {
  op_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  server_revision: number;
  remote_payload: JsonRecord;
  reason: 'base_revision_stale';
}

export interface PushResponse {
  accepted: AcceptedOperation[];
  conflicts: SyncConflictResult[];
  next_cursor: number;
}

export interface PullRequest {
  cursor: number;
  limit?: number;
}

export interface PullResponse {
  changes: RevisionedChange[];
  next_cursor: number;
}

export interface BootstrapResponse {
  cursor: number;
  tasks: CanonicalEntity[];
  tags: CanonicalEntity[];
  reminders: CanonicalEntity[];
  habits: CanonicalEntity[];
  habit_logs: CanonicalEntity[];
  settings: CanonicalEntity[];
}

export interface AckRequest {
  device_id: string;
  applied_cursor?: number;
  operation_ids?: string[];
}

export interface AckResponse {
  device_id: string;
  applied_cursor: number | null;
  operation_ids: string[];
  acknowledged_at: string;
}

export interface AttachmentUploadInitRequest {
  device_id: string;
  task_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
}

export interface AttachmentUploadInitResponse {
  attachment_id: string;
  upload_url: string;
  upload_method: 'PUT';
  expires_at: string;
  metadata: {
    task_id: string;
    filename: string;
    mime_type: string;
    byte_size: number;
  };
}
