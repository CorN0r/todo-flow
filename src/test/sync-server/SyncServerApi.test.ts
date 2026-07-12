/// <reference types="node" />

import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { handleSyncRequest, FileBackedSyncStore } from '../../sync-server';
import type {
  AckResponse,
  AttachmentUploadInitResponse,
  BootstrapResponse,
  PullResponse,
  PushResponse,
  RegisteredDevice,
} from '../../sync-server';

const accountHeaders = { 'x-account-id': 'acct-1' };
const clientTime = '2026-01-01T00:00:00.000Z';

function request(store: FileBackedSyncStore, path: string, body?: unknown) {
  return handleSyncRequest(store, {
    method: 'POST',
    path,
    headers: accountHeaders,
    body,
  });
}

function responseBody<T>(response: { status: number; body: unknown }, status = 200) {
  expect(response.status).toBe(status);
  return response.body as T;
}

function registerDevice(store: FileBackedSyncStore) {
  const response = responseBody<{ device: RegisteredDevice }>(
    request(store, '/v1/devices/register', {
      client_device_key: 'android-emulator',
      platform: 'android',
      display_name: 'Pixel 7',
      app_version: '0.5.0',
    }),
    201,
  );
  return response.device;
}

describe('Sync Server API contract', () => {
  it('defines a machine-readable /v1 OpenAPI contract for every sync endpoint', () => {
    const contract = JSON.parse(readFileSync('sync-server/openapi.json', 'utf8')) as {
      openapi: string;
      paths: Record<string, unknown>;
    };

    expect(contract.openapi).toBe('3.1.0');
    expect(Object.keys(contract.paths).sort()).toEqual([
      '/v1/attachments/initiate-upload',
      '/v1/bootstrap',
      '/v1/devices/register',
      '/v1/sync/ack',
      '/v1/sync/pull',
      '/v1/sync/push',
    ]);
    expect(Object.keys(contract.paths).every((path) => path.startsWith('/v1/'))).toBe(true);
  });

  it('registers stable device identifiers and returns bootstrap entity buckets', () => {
    const store = new FileBackedSyncStore();

    const first = registerDevice(store);
    const second = responseBody<{ device: RegisteredDevice }>(
      request(store, '/v1/devices/register', {
        client_device_key: 'android-emulator',
        platform: 'android',
        display_name: 'Renamed Pixel',
      }),
      201,
    ).device;
    const bootstrap = responseBody<BootstrapResponse>(request(store, '/v1/bootstrap'));

    expect(second.device_id).toBe(first.device_id);
    expect(second.display_name).toBe('Renamed Pixel');
    expect(bootstrap).toMatchObject({
      cursor: 0,
      tasks: [],
      tags: [],
      reminders: [],
      habits: [],
      habit_logs: [],
      settings: [],
    });
  });

  it('persists canonical entities and revisioned change log in the selected file store', () => {
    const filePath = join(mkdtempSync(join(tmpdir(), 'todoflow-sync-')), 'store.json');
    const store = new FileBackedSyncStore(filePath);
    const device = registerDevice(store);

    const push = responseBody<PushResponse>(
      request(store, '/v1/sync/push', {
        device_id: device.device_id,
        operations: [
          {
            op_id: 'op-task-create',
            entity_type: 'task',
            entity_id: 'task-1',
            operation: 'create',
            payload: { title: 'Server task', due_date: '2026-01-02' },
            client_time: clientTime,
            device_id: device.device_id,
          },
        ],
      }),
    );

    const reloaded = new FileBackedSyncStore(filePath);
    const bootstrap = responseBody<BootstrapResponse>(request(reloaded, '/v1/bootstrap'));
    const pull = responseBody<PullResponse>(request(reloaded, '/v1/sync/pull', { cursor: 0 }));

    expect(push.accepted).toHaveLength(1);
    expect(bootstrap.cursor).toBe(1);
    expect(bootstrap.tasks[0].payload).toMatchObject({ title: 'Server task' });
    expect(pull.changes.map((change) => change.revision)).toEqual([1]);
    expect(pull.changes[0]).toMatchObject({
      entity_type: 'task',
      entity_id: 'task-1',
      operation: 'create',
      operation_id: 'op-task-create',
    });
  });

  it('handles idempotent push, cursor pull, acknowledgement, and attachment handoff shapes', () => {
    const store = new FileBackedSyncStore();
    const device = registerDevice(store);
    const operation = {
      op_id: 'op-tag-create',
      entity_type: 'tag',
      entity_id: 'tag-1',
      operation: 'create',
      payload: { name: 'Work', color: '#2563EB' },
      client_time: clientTime,
      device_id: device.device_id,
    };

    const firstPush = responseBody<PushResponse>(request(store, '/v1/sync/push', {
      device_id: device.device_id,
      operations: [operation],
    }));
    const duplicatePush = responseBody<PushResponse>(request(store, '/v1/sync/push', {
      device_id: device.device_id,
      operations: [operation],
    }));
    const pullAfterCursor = responseBody<PullResponse>(request(store, '/v1/sync/pull', { cursor: firstPush.next_cursor }));
    const ack = responseBody<AckResponse>(request(store, '/v1/sync/ack', {
      device_id: device.device_id,
      applied_cursor: firstPush.next_cursor,
      operation_ids: ['op-tag-create'],
    }));
    const attachment = responseBody<AttachmentUploadInitResponse>(
      request(store, '/v1/attachments/initiate-upload', {
        device_id: device.device_id,
        task_id: 'task-1',
        filename: 'photo.png',
        mime_type: 'image/png',
        byte_size: 1024,
      }),
      201,
    );

    expect(firstPush.accepted[0]).toMatchObject({ op_id: 'op-tag-create', revision: 1, status: 'accepted' });
    expect(duplicatePush.accepted[0]).toMatchObject({ op_id: 'op-tag-create', revision: 1, status: 'duplicate' });
    expect(store.exportSnapshot().changes).toHaveLength(1);
    expect(pullAfterCursor).toMatchObject({ changes: [], next_cursor: firstPush.next_cursor });
    expect(ack).toMatchObject({ device_id: device.device_id, applied_cursor: 1, operation_ids: ['op-tag-create'] });
    expect(attachment).toMatchObject({
      upload_method: 'PUT',
      metadata: {
        task_id: 'task-1',
        filename: 'photo.png',
        mime_type: 'image/png',
        byte_size: 1024,
      },
    });
    expect(JSON.stringify(attachment)).not.toContain('data:image');
  });
});
