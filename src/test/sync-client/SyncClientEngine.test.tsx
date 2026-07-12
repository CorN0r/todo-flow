/// <reference types="node" />

import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { resetRepositories, setRepositoriesForTesting } from '../../domain/repositories/current';
import { MobileApp } from '../../mobile/MobileApp';
import { mergeEntityFields, mergeTaskFields } from '../../sync-client/conflicts';
import { createMemorySyncLocalAdapter, ensurePreSyncBackup, runClientSyncOnce } from '../../sync-client/engine';
import { LocalServerSyncRepository } from '../../sync-client/repository';
import { FileBackedSyncStore } from '../../sync-server';
import { buildTask, renderWithProviders } from '../test-utils';

const clientTime = '2026-01-01T00:00:00.000Z';

function createRemote(accountId = 'acct-sync') {
  return new LocalServerSyncRepository(new FileBackedSyncStore(), accountId);
}

function renderMobileSettings() {
  return renderWithProviders(
    <Routes>
      <Route path="/mobile/*" element={<MobileApp />} />
    </Routes>,
    { initialEntries: ['/mobile/settings'] },
  );
}

describe('Sync client engine', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-01-05T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRepositories();
  });

  it('wraps the /v1 repository contract for bootstrap, push, pull, ack, and attachments', async () => {
    const filePath = join(mkdtempSync(join(tmpdir(), 'todoflow-client-sync-')), 'store.json');
    const remote = new LocalServerSyncRepository(new FileBackedSyncStore(filePath), 'acct-repo');
    const device = await remote.registerDevice({
      client_device_key: 'windows-main',
      platform: 'windows',
      display_name: 'Windows desktop',
      app_version: '0.5.0',
    });

    const push = await remote.push({
      device_id: device.device_id,
      operations: [{
        op_id: 'op-task-repo',
        entity_type: 'task',
        entity_id: 'task-repo',
        operation: 'create',
        payload: { title: 'Repository task' },
        client_time: clientTime,
        device_id: device.device_id,
      }],
    });
    const pull = await remote.pull({ cursor: 0 });
    const ack = await remote.ack({
      device_id: device.device_id,
      applied_cursor: pull.next_cursor,
      operation_ids: ['op-task-repo'],
    });
    const bootstrap = await remote.bootstrap();
    const upload = await remote.initAttachmentUpload({
      device_id: device.device_id,
      task_id: 'task-repo',
      filename: 'note.txt',
      mime_type: 'text/plain',
      byte_size: 42,
    });

    expect(push.accepted[0]).toMatchObject({ op_id: 'op-task-repo', revision: 1 });
    expect(pull.changes[0]).toMatchObject({ entity_type: 'task', entity_id: 'task-repo' });
    expect(ack).toMatchObject({ applied_cursor: 1, operation_ids: ['op-task-repo'] });
    expect(bootstrap.tasks[0].payload).toMatchObject({ title: 'Repository task' });
    expect(upload).toMatchObject({ upload_method: 'PUT', metadata: { filename: 'note.txt' } });
    await expect(remote.getStatus()).resolves.toBe('idle');
  });

  it('pushes queued local operations from desktop and pulls them incrementally on Android', async () => {
    const remote = createRemote('acct-two-way');
    const desktop = createMemoryRepositories();
    const android = createMemoryRepositories();

    await desktop.repositories.sync.recordOperation({
      op_id: 'op-create-desktop-task',
      entity_type: 'task',
      entity_id: 'task-shared',
      operation: 'create',
      payload: { title: 'Shared task', priority: 2 },
      client_time: clientTime,
      device_id: 'desktop-local',
    });

    const desktopResult = await runClientSyncOnce({
      repositories: desktop.repositories,
      remote,
      local: createMemorySyncLocalAdapter(desktop.state),
      device: { clientDeviceKey: 'windows-main', platform: 'windows', displayName: 'Windows desktop' },
    });
    const androidResult = await runClientSyncOnce({
      repositories: android.repositories,
      remote,
      local: createMemorySyncLocalAdapter(android.state),
      device: { clientDeviceKey: 'pixel-7', platform: 'android', displayName: 'Pixel 7' },
    });

    expect(desktopResult).toMatchObject({ pushed: 1, pulled: 1, conflicts: 0, cursor: 1 });
    expect(androidResult).toMatchObject({ pushed: 0, pulled: 1, conflicts: 0, cursor: 1 });
    expect((await desktop.repositories.sync.listOperations('acked')).map((operation) => operation.op_id)).toEqual(['op-create-desktop-task']);
    expect(android.state.tasks[0]).toMatchObject({
      id: 'task-shared',
      title: 'Shared task',
      priority: 2,
      server_revision: 1,
      sync_status: 'clean',
    });
    await expect(android.repositories.sync.getMeta('sync_cursor')).resolves.toBe('1');
  });

  it('applies remote creates, updates, and deletes idempotently in local memory', async () => {
    const remote = createRemote('acct-idempotent');
    const sender = await remote.registerDevice({
      client_device_key: 'server-seed',
      platform: 'test',
      display_name: 'Seeder',
    });
    const local = createMemoryRepositories();

    await remote.push({
      device_id: sender.device_id,
      operations: [{
        op_id: 'op-create-idempotent',
        entity_type: 'task',
        entity_id: 'task-idempotent',
        operation: 'create',
        payload: { title: 'Remote created', priority: 1 },
        client_time: clientTime,
        device_id: sender.device_id,
      }],
    });
    await runClientSyncOnce({
      repositories: local.repositories,
      remote,
      local: createMemorySyncLocalAdapter(local.state),
      device: { clientDeviceKey: 'android-idempotent', platform: 'android', displayName: 'Pixel 7' },
    });
    await runClientSyncOnce({
      repositories: local.repositories,
      remote,
      local: createMemorySyncLocalAdapter(local.state),
      device: { clientDeviceKey: 'android-idempotent', platform: 'android', displayName: 'Pixel 7' },
    });

    expect(local.state.tasks).toHaveLength(1);
    expect(local.state.tasks[0].title).toBe('Remote created');

    await remote.push({
      device_id: sender.device_id,
      operations: [{
        op_id: 'op-update-idempotent',
        entity_type: 'task',
        entity_id: 'task-idempotent',
        operation: 'update',
        base_revision: 1,
        payload: { title: 'Remote updated', is_completed: true },
        client_time: clientTime,
        device_id: sender.device_id,
      }],
    });
    await runClientSyncOnce({
      repositories: local.repositories,
      remote,
      local: createMemorySyncLocalAdapter(local.state),
      device: { clientDeviceKey: 'android-idempotent', platform: 'android', displayName: 'Pixel 7' },
    });

    expect(local.state.tasks).toHaveLength(1);
    expect(local.state.tasks[0]).toMatchObject({ title: 'Remote updated', is_completed: true, server_revision: 2 });

    await remote.push({
      device_id: sender.device_id,
      operations: [{
        op_id: 'op-reorder-idempotent',
        entity_type: 'task',
        entity_id: 'task-idempotent',
        operation: 'reorder',
        base_revision: 2,
        payload: { sort_order: 42 },
        client_time: clientTime,
        device_id: sender.device_id,
      }],
    });
    await runClientSyncOnce({
      repositories: local.repositories,
      remote,
      local: createMemorySyncLocalAdapter(local.state),
      device: { clientDeviceKey: 'android-idempotent', platform: 'android', displayName: 'Pixel 7' },
    });

    expect(local.state.tasks).toHaveLength(1);
    expect(local.state.tasks[0]).toMatchObject({ sort_order: 42, server_revision: 3 });

    await remote.push({
      device_id: sender.device_id,
      operations: [{
        op_id: 'op-delete-idempotent',
        entity_type: 'task',
        entity_id: 'task-idempotent',
        operation: 'delete',
        base_revision: 3,
        payload: {},
        client_time: clientTime,
        device_id: sender.device_id,
      }],
    });
    await runClientSyncOnce({
      repositories: local.repositories,
      remote,
      local: createMemorySyncLocalAdapter(local.state),
      device: { clientDeviceKey: 'android-idempotent', platform: 'android', displayName: 'Pixel 7' },
    });

    expect(local.state.tasks).toHaveLength(1);
    expect(local.state.tasks[0]).toMatchObject({ is_archived: true, server_revision: 4 });
    expect((local.state.tasks[0] as { deleted_at?: string }).deleted_at).toEqual(expect.any(String));
  });

  it('merges non-overlapping task fields and records remote-wins field conflicts', () => {
    const result = mergeTaskFields(
      { title: 'Base', priority: 1, due_date: null, description: '<p>base</p>' },
      {
        title: 'Local title',
        priority: 3,
        due_date: null,
        description: `<p>local</p><img src="data:image/png;base64,${'a'.repeat(520)}">`,
      },
      {
        title: 'Remote title',
        priority: 1,
        due_date: '2026-01-08',
        description: `<p>remote</p><img src="data:image/png;base64,${'b'.repeat(520)}">`,
      },
    );

    expect(result.payload).toMatchObject({
      title: 'Remote title',
      priority: 3,
      due_date: '2026-01-08',
    });
    expect(result.conflicts).toEqual([
      {
        field: 'title',
        local_value: 'Local title',
        remote_value: 'Remote title',
        base_value: 'Base',
        resolution: 'remote_wins',
      },
      {
        field: 'description',
        local_value: { kind: 'rich_text_snapshot', length: 566, has_embedded_data: true },
        remote_value: { kind: 'rich_text_snapshot', length: 567, has_embedded_data: true },
        base_value: '<p>base</p>',
        resolution: 'remote_wins',
      },
    ]);

    expect(mergeEntityFields(
      'tag',
      { name: 'Work', color: '#111111', sort_order: 1 },
      { name: 'Work local', color: '#111111', sort_order: 2 },
      { name: 'Work', color: '#2563EB', sort_order: 1 },
    ).payload).toMatchObject({ name: 'Work local', color: '#2563EB', sort_order: 2 });

    expect(mergeEntityFields(
      'reminder',
      { task_id: 'task-1', offset: '0m', reminder_time: '2026-01-05T10:00:00.000Z' },
      { task_id: 'task-1', offset: '10m', reminder_time: '2026-01-05T10:00:00.000Z' },
      { task_id: 'task-1', offset: '0m', reminder_time: '2026-01-05T11:00:00.000Z' },
    ).payload).toMatchObject({ offset: '10m', reminder_time: '2026-01-05T11:00:00.000Z' });

    expect(mergeEntityFields(
      'habit',
      { name: 'Drink water', target_count: 1, sort_order: 1 },
      { name: 'Drink water', target_count: 2, sort_order: 1 },
      { name: 'Hydrate', target_count: 1, sort_order: 3 },
    ).payload).toMatchObject({ name: 'Hydrate', target_count: 2, sort_order: 3 });

    expect(mergeEntityFields(
      'habit_log',
      { habit_id: 'habit-1', log_date: '2026-01-05', count: 1, note: '' },
      { habit_id: 'habit-1', log_date: '2026-01-05', count: 2, note: '' },
      { habit_id: 'habit-1', log_date: '2026-01-05', count: 1, note: 'remote note' },
    ).payload).toMatchObject({ count: 2, note: 'remote note' });
  });

  it('stores stale push conflicts and exposes conflicted entity status locally', async () => {
    const remote = createRemote('acct-conflict');
    const seedDevice = await remote.registerDevice({
      client_device_key: 'seed',
      platform: 'test',
      display_name: 'Seeder',
    });
    const local = createMemoryRepositories();

    await remote.push({
      device_id: seedDevice.device_id,
      operations: [{
        op_id: 'op-seed-conflict',
        entity_type: 'task',
        entity_id: 'task-conflict',
        operation: 'create',
        payload: { title: 'Remote baseline' },
        client_time: clientTime,
        device_id: seedDevice.device_id,
      }],
    });
    await local.repositories.sync.recordOperation({
      op_id: 'op-stale-conflict',
      entity_type: 'task',
      entity_id: 'task-conflict',
      operation: 'update',
      base_revision: 0,
      payload: { title: 'Local stale edit' },
      client_time: clientTime,
      device_id: 'local',
    });

    const result = await runClientSyncOnce({
      repositories: local.repositories,
      remote,
      local: createMemorySyncLocalAdapter(local.state),
      device: { clientDeviceKey: 'android-conflict', platform: 'android', displayName: 'Pixel 7' },
    });

    expect(result.conflicts).toBe(1);
    expect(local.state.syncConflicts[0]).toMatchObject({
      entity_type: 'task',
      entity_id: 'task-conflict',
      remote_payload: { title: 'Remote baseline' },
    });
    await expect(local.repositories.sync.deriveEntityStatus('task', 'task-conflict')).resolves.toBe('conflicted');
  });

  it('registers background notification work for pulled reminders without marking them reminded', async () => {
    const remote = createRemote('acct-reminder');
    const seedDevice = await remote.registerDevice({
      client_device_key: 'seed-reminder',
      platform: 'test',
      display_name: 'Seeder',
    });
    const local = createMemoryRepositories();
    const backgroundSpy = vi.fn(async () => ({ supported: true }));
    local.repositories.platform.registerBackgroundWork = backgroundSpy;

    await remote.push({
      device_id: seedDevice.device_id,
      operations: [{
        op_id: 'op-reminder-create',
        entity_type: 'reminder',
        entity_id: 'reminder-1',
        operation: 'create',
        payload: {
          task_id: 'task-1',
          offset: '0m',
          reminder_time: '2026-01-05T10:00:00.000Z',
          reminded: true,
        },
        client_time: clientTime,
        device_id: seedDevice.device_id,
      }],
    });

    await runClientSyncOnce({
      repositories: local.repositories,
      remote,
      local: createMemorySyncLocalAdapter(local.state),
      device: { clientDeviceKey: 'android-reminder', platform: 'android', displayName: 'Pixel 7' },
    });

    expect(backgroundSpy).toHaveBeenCalledWith({ id: 'reminder:reminder-1', reason: 'notification' });
    expect(local.state.reminders[0]).toMatchObject({
      id: 'reminder-1',
      task_id: 'task-1',
      reminded: false,
    });
  });

  it('keeps local sync status derivation stable for pending, syncing, failed, deleted, and conflicted entities', async () => {
    const memory = createMemoryRepositories();
    const { sync } = memory.repositories;

    await sync.recordOperation({ op_id: 'op-pending', entity_type: 'task', entity_id: 'task-pending', operation: 'create', payload: {}, device_id: 'd' });
    await sync.recordOperation({ op_id: 'op-syncing', entity_type: 'task', entity_id: 'task-syncing', operation: 'update', payload: {}, device_id: 'd' });
    await sync.markOperationStatus('op-syncing', 'syncing');
    await sync.recordOperation({ op_id: 'op-failed', entity_type: 'task', entity_id: 'task-failed', operation: 'update', payload: {}, device_id: 'd' });
    await sync.incrementRetry('op-failed', 'offline');
    await sync.recordOperation({ op_id: 'op-delete', entity_type: 'task', entity_id: 'task-delete', operation: 'delete', payload: {}, device_id: 'd' });
    await sync.saveConflict({ entity_type: 'task', entity_id: 'task-conflicted', local_payload: {}, remote_payload: {} });

    await expect(sync.deriveEntityStatus('task', 'task-pending')).resolves.toBe('pending');
    await expect(sync.deriveEntityStatus('task', 'task-syncing')).resolves.toBe('syncing');
    await expect(sync.deriveEntityStatus('task', 'task-failed')).resolves.toBe('failed');
    await expect(sync.deriveEntityStatus('task', 'task-delete')).resolves.toBe('deleted');
    await expect(sync.deriveEntityStatus('task', 'task-conflicted')).resolves.toBe('conflicted');
    await expect(sync.deriveEntityStatus('task', 'task-clean')).resolves.toBe('clean');
  });

  it('creates a pre-sync backup once and records the backup timestamp', async () => {
    const memory = createMemoryRepositories();
    const backupSpy = vi.fn(async () => {});
    memory.repositories.settings.backupDatabase = backupSpy;

    await expect(ensurePreSyncBackup(memory.repositories, 'pre-sync.db')).resolves.toBe(true);
    await expect(ensurePreSyncBackup(memory.repositories, 'pre-sync-again.db')).resolves.toBe(false);

    expect(backupSpy).toHaveBeenCalledTimes(1);
    expect(backupSpy).toHaveBeenCalledWith('pre-sync.db');
    await expect(memory.repositories.sync.getMeta('sync_preflight_backup_at')).resolves.toBe('2026-01-05T09:00:00.000Z');
  });

  it('exposes manual sync controls in mobile settings and task app bars', async () => {
    const user = userEvent.setup();
    const memory = createMemoryRepositories({
      tasks: [buildTask({ id: 'task-manual-sync', title: 'Manual sync visible' })],
      syncMeta: { sync_status: 'pending', sync_cursor: '7' },
    });
    setRepositoriesForTesting(memory.repositories);

    renderMobileSettings();

    expect(await screen.findByRole('heading', { name: '\u8bbe\u7f6e' })).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '\u7acb\u5373\u540c\u6b65' }));

    await waitFor(() => {
      expect(memory.state.syncMeta.manual_pull_requested_at).toBe('2026-01-05T09:00:00.000Z');
      expect(memory.state.syncMeta.last_manual_sync_at).toBe('2026-01-05T09:00:00.000Z');
      expect(memory.state.syncMeta.sync_status).toBe('clean');
    });
    expect(screen.getByText('\u5df2\u540c\u6b65')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('navigation', { name: '\u4e3b\u5bfc\u822a' })).getByText('\u4efb\u52a1'));
    expect(await screen.findByText('Manual sync visible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u7acb\u5373\u540c\u6b65' })).toHaveClass('min-w-11');
  });
});
