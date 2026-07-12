/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FileBackedSyncStore } from '../../sync-server';
import { LocalServerSyncRepository } from '../../sync-client/repository';
import type {
  AckRequest,
  AttachmentUploadInitRequest,
  ClientSyncOperation,
  DeviceRegistrationRequest,
  JsonRecord,
  PullRequest,
  PushRequest,
} from '../../sync-server';

const disallowedSyncPayloadKeys = [
  'android_uri',
  'content_uri',
  'ios_url',
  'tauri_path',
  'windows_path',
  'local_path',
  'file_path',
  'window_x',
  'window_y',
  'screen_x',
  'screen_y',
  'sidebar_width',
  'panel_width',
  'webview_state',
  'tray_state',
  'widget_position',
  'hover_state',
];

function collectDisallowedKeys(value: unknown, path = 'payload'): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectDisallowedKeys(item, `${path}[${index}]`));

  const record = value as JsonRecord;
  const found: string[] = [];
  for (const [key, nested] of Object.entries(record)) {
    const nextPath = `${path}.${key}`;
    if (disallowedSyncPayloadKeys.includes(key)) found.push(nextPath);
    found.push(...collectDisallowedKeys(nested, nextPath));
  }
  return found;
}

function futureClientPushRequest(deviceId: string, operations: ClientSyncOperation[]): PushRequest {
  return {
    device_id: deviceId,
    operations,
  };
}

function futureClientPullRequest(cursor: number): PullRequest {
  return { cursor, limit: 100 };
}

describe('Sync contract compatibility', () => {
  it('exports platform-neutral mobile design tokens as JSON', () => {
    const tokens = JSON.parse(readFileSync('docs/android-migration/mobile-design-tokens.json', 'utf8')) as {
      version: number;
      themes: Record<string, Record<string, unknown>>;
    };

    expect(tokens.version).toBe(1);
    expect(Object.keys(tokens.themes).sort()).toEqual(['dark', 'light', 'lumina']);
    for (const theme of Object.values(tokens.themes)) {
      expect(Object.keys(theme).sort()).toEqual(['colors', 'elevation', 'motion', 'radius', 'spacing', 'typography']);
    }
  });

  it('keeps sync payloads free of Windows-only or Android-only UI fields', async () => {
    const remote = new LocalServerSyncRepository(new FileBackedSyncStore(), 'acct-portable');
    const device = await remote.registerDevice({
      client_device_key: 'future-client',
      platform: 'web',
      display_name: 'Future client',
    });
    const operations: ClientSyncOperation[] = [
      {
        op_id: 'op-task-portable',
        entity_type: 'task',
        entity_id: 'task-portable',
        operation: 'create',
        payload: { title: 'Portable task', due_date: '2026-01-05', tag_id: 'tag-portable', sort_order: 1 },
        client_time: '2026-01-01T00:00:00.000Z',
        device_id: device.device_id,
      },
      {
        op_id: 'op-tag-portable',
        entity_type: 'tag',
        entity_id: 'tag-portable',
        operation: 'create',
        payload: { name: 'Portable', color: '#2563EB', sort_order: 0 },
        client_time: '2026-01-01T00:00:00.000Z',
        device_id: device.device_id,
      },
      {
        op_id: 'op-reminder-portable',
        entity_type: 'reminder',
        entity_id: 'reminder-portable',
        operation: 'create',
        payload: { task_id: 'task-portable', offset: '10m', reminder_time: '2026-01-05T10:00:00.000Z' },
        client_time: '2026-01-01T00:00:00.000Z',
        device_id: device.device_id,
      },
      {
        op_id: 'op-habit-portable',
        entity_type: 'habit',
        entity_id: 'habit-portable',
        operation: 'create',
        payload: { name: 'Read', color: '#10B981', icon: 'book-open', frequency: 'daily', target_count: 1, sort_order: 0 },
        client_time: '2026-01-01T00:00:00.000Z',
        device_id: device.device_id,
      },
      {
        op_id: 'op-habit-log-portable',
        entity_type: 'habit_log',
        entity_id: 'habit-log-portable',
        operation: 'create',
        payload: { habit_id: 'habit-portable', log_date: '2026-01-05', count: 1, note: 'done' },
        client_time: '2026-01-01T00:00:00.000Z',
        device_id: device.device_id,
      },
      {
        op_id: 'op-setting-portable',
        entity_type: 'setting',
        entity_id: 'theme',
        operation: 'update',
        payload: { value: 'lumina' },
        client_time: '2026-01-01T00:00:00.000Z',
        device_id: device.device_id,
      },
      {
        op_id: 'op-attachment-portable',
        entity_type: 'attachment',
        entity_id: 'attachment-portable',
        operation: 'create',
        payload: { task_id: 'task-portable', original_name: 'photo.png', mime_type: 'image/png', file_size: 1024 },
        client_time: '2026-01-01T00:00:00.000Z',
        device_id: device.device_id,
      },
    ];

    const push = await remote.push(futureClientPushRequest(device.device_id, operations));
    const pull = await remote.pull(futureClientPullRequest(0));
    const payloads = pull.changes.map((change) => change.payload);

    expect(push.accepted).toHaveLength(operations.length);
    expect(payloads.flatMap((payload) => collectDisallowedKeys(payload))).toEqual([]);
  });

  it('lets a future non-React client consume the sync contract types', () => {
    const registration = {
      client_device_key: 'harmonyos-poc',
      platform: 'web',
      display_name: 'HarmonyOS proof client',
      app_version: '0.5.0',
    } satisfies DeviceRegistrationRequest;
    const operation = {
      op_id: 'op-future-task',
      entity_type: 'task',
      entity_id: 'future-task',
      operation: 'create',
      payload: { title: 'Future client task' },
      client_time: '2026-01-01T00:00:00.000Z',
      device_id: 'future-device',
    } satisfies ClientSyncOperation;
    const push = futureClientPushRequest('future-device', [operation]);
    const pull = futureClientPullRequest(12);
    const ack = {
      device_id: 'future-device',
      applied_cursor: 13,
      operation_ids: [operation.op_id],
    } satisfies AckRequest;
    const attachment = {
      device_id: 'future-device',
      task_id: 'future-task',
      filename: 'future.png',
      mime_type: 'image/png',
      byte_size: 2048,
    } satisfies AttachmentUploadInitRequest;

    expect(registration.platform).toBe('web');
    expect(push.operations[0].payload).toMatchObject({ title: 'Future client task' });
    expect(pull).toEqual({ cursor: 12, limit: 100 });
    expect(ack.operation_ids).toEqual(['op-future-task']);
    expect(attachment.byte_size).toBe(2048);
  });
});
