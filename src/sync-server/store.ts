/// <reference types="node" />

import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type {
  AckRequest,
  AckResponse,
  AcceptedOperation,
  AttachmentUploadInitRequest,
  AttachmentUploadInitResponse,
  BootstrapResponse,
  CanonicalEntity,
  ClientSyncOperation,
  DeviceRegistrationRequest,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  RegisteredDevice,
  RevisionedChange,
  SyncConflictResult,
  SyncEntityType,
} from './types';

interface AppliedOperationRecord {
  account_id: string;
  op_id: string;
  result: AcceptedOperation | SyncConflictResult;
}

interface SyncStoreSnapshot {
  nextRevision: number;
  devices: RegisteredDevice[];
  entities: CanonicalEntity[];
  changes: RevisionedChange[];
  appliedOperations: AppliedOperationRecord[];
  acknowledgements: AckResponse[];
  attachments: AttachmentUploadInitResponse[];
}

const entityTypes: SyncEntityType[] = ['task', 'tag', 'reminder', 'habit', 'habit_log', 'setting', 'attachment'];

function now() {
  return new Date().toISOString();
}

function stableId(prefix: string, value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return `${prefix}_${hash.toString(16).padStart(8, '0')}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function entityKey(accountId: string, entityType: SyncEntityType, entityId: string) {
  return `${accountId}:${entityType}:${entityId}`;
}

function operationKey(accountId: string, opId: string) {
  return `${accountId}:${opId}`;
}

function emptySnapshot(): SyncStoreSnapshot {
  return {
    nextRevision: 1,
    devices: [],
    entities: [],
    changes: [],
    appliedOperations: [],
    acknowledgements: [],
    attachments: [],
  };
}

export class FileBackedSyncStore {
  private snapshot: SyncStoreSnapshot;
  private readonly filePath?: string;

  constructor(filePath?: string) {
    this.filePath = filePath;
    this.snapshot = this.load();
  }

  registerDevice(accountId: string, input: DeviceRegistrationRequest): RegisteredDevice {
    const existing = this.snapshot.devices.find(
      (device) => device.account_id === accountId && device.client_device_key === input.client_device_key,
    );
    if (existing) {
      existing.last_seen_at = now();
      existing.app_version = input.app_version ?? existing.app_version;
      existing.display_name = input.display_name ?? existing.display_name;
      this.persist();
      return clone(existing);
    }

    const timestamp = now();
    const device: RegisteredDevice = {
      device_id: stableId('dev', `${accountId}:${input.client_device_key}`),
      account_id: accountId,
      client_device_key: input.client_device_key,
      platform: input.platform,
      display_name: input.display_name ?? null,
      app_version: input.app_version ?? null,
      registered_at: timestamp,
      last_seen_at: timestamp,
    };
    this.snapshot.devices.push(device);
    this.persist();
    return clone(device);
  }

  bootstrap(accountId: string): BootstrapResponse {
    const visible = this.snapshot.entities.filter((entity) => entity.account_id === accountId && !entity.deleted_at);
    const byType = (type: SyncEntityType) => visible.filter((entity) => entity.entity_type === type).sort((a, b) => a.revision - b.revision);
    return {
      cursor: this.currentCursor(accountId),
      tasks: byType('task'),
      tags: byType('tag'),
      reminders: byType('reminder'),
      habits: byType('habit'),
      habit_logs: byType('habit_log'),
      settings: byType('setting'),
    };
  }

  push(accountId: string, request: PushRequest): PushResponse {
    const accepted: AcceptedOperation[] = [];
    const conflicts: SyncConflictResult[] = [];

    for (const operation of request.operations) {
      const duplicate = this.snapshot.appliedOperations.find((item) => operationKey(item.account_id, item.op_id) === operationKey(accountId, operation.op_id));
      if (duplicate) {
        if ('status' in duplicate.result) {
          accepted.push({ ...duplicate.result, status: 'duplicate' });
        } else {
          conflicts.push(clone(duplicate.result));
        }
        continue;
      }

      const existing = this.getEntity(accountId, operation.entity_type, operation.entity_id);
      if (
        existing &&
        operation.base_revision != null &&
        operation.base_revision < existing.revision &&
        operation.operation !== 'delete'
      ) {
        const conflict: SyncConflictResult = {
          op_id: operation.op_id,
          entity_type: operation.entity_type,
          entity_id: operation.entity_id,
          server_revision: existing.revision,
          remote_payload: clone(existing.payload),
          reason: 'base_revision_stale',
        };
        this.snapshot.appliedOperations.push({ account_id: accountId, op_id: operation.op_id, result: conflict });
        conflicts.push(conflict);
        continue;
      }

      const result = this.applyOperation(accountId, operation);
      this.snapshot.appliedOperations.push({ account_id: accountId, op_id: operation.op_id, result });
      accepted.push(result);
    }

    this.persist();
    return {
      accepted,
      conflicts,
      next_cursor: this.currentCursor(accountId),
    };
  }

  pull(accountId: string, request: PullRequest): PullResponse {
    const limit = Math.max(1, Math.min(request.limit ?? 100, 500));
    const changes = this.snapshot.changes
      .filter((change) => change.account_id === accountId && change.revision > request.cursor)
      .sort((a, b) => a.revision - b.revision)
      .slice(0, limit);
    const nextCursor = changes.length > 0 ? changes[changes.length - 1].revision : request.cursor;
    return {
      changes: clone(changes),
      next_cursor: nextCursor,
    };
  }

  ack(_accountId: string, request: AckRequest): AckResponse {
    const response: AckResponse = {
      device_id: request.device_id,
      applied_cursor: request.applied_cursor ?? null,
      operation_ids: request.operation_ids ?? [],
      acknowledged_at: now(),
    };
    this.snapshot.acknowledgements = this.snapshot.acknowledgements.filter((ack) => !(ack.device_id === request.device_id && ack.applied_cursor === response.applied_cursor));
    this.snapshot.acknowledgements.push(response);
    this.persist();
    return clone(response);
  }

  initAttachmentUpload(accountId: string, request: AttachmentUploadInitRequest): AttachmentUploadInitResponse {
    const attachmentId = stableId('att', `${accountId}:${request.task_id}:${request.filename}:${now()}`);
    const response: AttachmentUploadInitResponse = {
      attachment_id: attachmentId,
      upload_url: `todoflow://attachments/${accountId}/${attachmentId}`,
      upload_method: 'PUT',
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      metadata: {
        task_id: request.task_id,
        filename: request.filename,
        mime_type: request.mime_type,
        byte_size: request.byte_size,
      },
    };
    this.snapshot.attachments.push(response);
    this.persist();
    return clone(response);
  }

  exportSnapshot(): SyncStoreSnapshot {
    return clone(this.snapshot);
  }

  private applyOperation(accountId: string, operation: ClientSyncOperation): AcceptedOperation {
    const revision = this.snapshot.nextRevision;
    this.snapshot.nextRevision += 1;
    const timestamp = now();
    const existingIndex = this.snapshot.entities.findIndex(
      (entity) => entityKey(entity.account_id, entity.entity_type, entity.entity_id) === entityKey(accountId, operation.entity_type, operation.entity_id),
    );
    const deletedAt = operation.operation === 'delete' ? timestamp : null;
    const previousPayload = existingIndex >= 0 ? this.snapshot.entities[existingIndex].payload : {};
    const payload = operation.operation === 'delete' ? previousPayload : { ...previousPayload, ...operation.payload };
    const entity: CanonicalEntity = {
      account_id: accountId,
      entity_type: operation.entity_type,
      entity_id: operation.entity_id,
      payload,
      revision,
      deleted_at: deletedAt,
      updated_at: timestamp,
    };

    if (existingIndex >= 0) {
      this.snapshot.entities[existingIndex] = entity;
    } else {
      this.snapshot.entities.push(entity);
    }

    this.snapshot.changes.push({
      revision,
      account_id: accountId,
      entity_type: operation.entity_type,
      entity_id: operation.entity_id,
      operation: operation.operation,
      payload,
      deleted_at: deletedAt,
      device_id: operation.device_id,
      operation_id: operation.op_id,
      server_time: timestamp,
    });

    return {
      op_id: operation.op_id,
      entity_type: operation.entity_type,
      entity_id: operation.entity_id,
      revision,
      status: 'accepted',
    };
  }

  private currentCursor(accountId: string) {
    return this.snapshot.changes
      .filter((change) => change.account_id === accountId)
      .reduce((cursor, change) => Math.max(cursor, change.revision), 0);
  }

  private getEntity(accountId: string, entityType: SyncEntityType, entityId: string) {
    return this.snapshot.entities.find(
      (entity) => entityKey(entity.account_id, entity.entity_type, entity.entity_id) === entityKey(accountId, entityType, entityId),
    );
  }

  private load(): SyncStoreSnapshot {
    if (!this.filePath || !existsSync(this.filePath)) return emptySnapshot();
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as SyncStoreSnapshot;
    return {
      ...emptySnapshot(),
      ...parsed,
      entities: parsed.entities.filter((entity) => entityTypes.includes(entity.entity_type)),
    };
  }

  private persist() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.snapshot, null, 2), 'utf8');
  }
}
