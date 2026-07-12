import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import type { AppRepositories } from '../../domain/repositories';
import type { RemoteSyncRepository, RemoteSyncStatus } from '../../sync-client/repository';
import { createMemorySyncLocalAdapter, runClientSyncOnce, type SyncDeviceProfile } from '../../sync-client/engine';
import { LocalServerSyncRepository } from '../../sync-client/repository';
import { FileBackedSyncStore } from '../../sync-server';
import type {
  AckRequest,
  AckResponse,
  AttachmentUploadInitRequest,
  AttachmentUploadInitResponse,
  BootstrapResponse,
  DeviceRegistrationRequest,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  RegisteredDevice,
} from '../../sync-server';
import { buildTask } from '../test-utils';

const clientTime = '2026-01-01T00:00:00.000Z';
const desktopDevice: SyncDeviceProfile = { clientDeviceKey: 'desktop-main', platform: 'windows', displayName: 'Windows desktop' };
const androidDevice: SyncDeviceProfile = { clientDeviceKey: 'android-pixel', platform: 'android', displayName: 'Pixel 7' };

function createWorld(accountId = 'acct-cross-device') {
  const store = new FileBackedSyncStore();
  const remote = new LocalServerSyncRepository(store, accountId);
  const desktop = createMemoryRepositories();
  const android = createMemoryRepositories();
  return { store, remote, desktop, android };
}

async function syncClient(repositories: AppRepositories, state: ReturnType<typeof createMemoryRepositories>['state'], remote: RemoteSyncRepository, device: SyncDeviceProfile) {
  return runClientSyncOnce({
    repositories,
    remote,
    local: createMemorySyncLocalAdapter(state),
    device,
  });
}

async function seedRemoteTask(remote: RemoteSyncRepository, entityId = 'task-shared', payload = { title: 'Base task', due_date: null }) {
  const device = await remote.registerDevice({
    client_device_key: 'seed-device',
    platform: 'test',
    display_name: 'Seeder',
  });
  await remote.push({
    device_id: device.device_id,
    operations: [{
      op_id: `op-seed-${entityId}`,
      entity_type: 'task',
      entity_id: entityId,
      operation: 'create',
      payload,
      client_time: clientTime,
      device_id: device.device_id,
    }],
  });
}

class FlakyAfterAcceptRemote implements RemoteSyncRepository {
  private failed = false;
  private readonly inner: RemoteSyncRepository;

  constructor(inner: RemoteSyncRepository) {
    this.inner = inner;
  }

  registerDevice(input: DeviceRegistrationRequest): Promise<RegisteredDevice> {
    return this.inner.registerDevice(input);
  }

  bootstrap(): Promise<BootstrapResponse> {
    return this.inner.bootstrap();
  }

  async push(input: PushRequest): Promise<PushResponse> {
    const response = await this.inner.push(input);
    if (!this.failed) {
      this.failed = true;
      throw new Error('network dropped after accept');
    }
    return response;
  }

  pull(input: PullRequest): Promise<PullResponse> {
    return this.inner.pull(input);
  }

  ack(input: AckRequest): Promise<AckResponse> {
    return this.inner.ack(input);
  }

  initAttachmentUpload(input: AttachmentUploadInitRequest): Promise<AttachmentUploadInitResponse> {
    return this.inner.initAttachmentUpload(input);
  }

  getStatus(): Promise<RemoteSyncStatus> {
    return this.inner.getStatus();
  }
}

describe('Cross-device sync scenarios', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-01-05T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs a desktop-created task to Android', async () => {
    const { remote, desktop, android } = createWorld('acct-desktop-to-android');
    await desktop.repositories.sync.recordOperation({
      op_id: 'op-desktop-create',
      entity_type: 'task',
      entity_id: 'task-desktop',
      operation: 'create',
      payload: { title: 'Desktop created', priority: 2 },
      client_time: clientTime,
      device_id: 'desktop-local',
    });

    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);
    await syncClient(android.repositories, android.state, remote, androidDevice);

    expect(android.state.tasks).toHaveLength(1);
    expect(android.state.tasks[0]).toMatchObject({ id: 'task-desktop', title: 'Desktop created', priority: 2 });
  });

  it('syncs an Android-created offline task to desktop after reconnect', async () => {
    const { remote, desktop, android } = createWorld('acct-android-to-desktop');
    android.state.tasks.push(buildTask({ id: 'task-android', title: 'Android offline capture', sync_status: 'pending' } as Partial<ReturnType<typeof buildTask>>));
    await android.repositories.sync.recordOperation({
      op_id: 'op-android-create',
      entity_type: 'task',
      entity_id: 'task-android',
      operation: 'create',
      payload: { title: 'Android offline capture', priority: 1 },
      client_time: clientTime,
      device_id: 'android-local',
    });

    await syncClient(android.repositories, android.state, remote, androidDevice);
    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);

    expect(desktop.state.tasks).toHaveLength(1);
    expect(desktop.state.tasks[0]).toMatchObject({ id: 'task-android', title: 'Android offline capture', priority: 1 });
  });

  it('merges a desktop due date edit with an Android title edit into one task', async () => {
    const { remote, desktop, android } = createWorld('acct-merge');
    const base = { title: 'Base task', due_date: null };
    await seedRemoteTask(remote, 'task-merge', base);
    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);
    await syncClient(android.repositories, android.state, remote, androidDevice);

    desktop.state.tasks[0].due_date = '2026-01-10';
    await desktop.repositories.sync.recordOperation({
      op_id: 'op-desktop-due-date',
      entity_type: 'task',
      entity_id: 'task-merge',
      operation: 'update',
      base_revision: 1,
      payload: { base, fields: { due_date: '2026-01-10' } },
      client_time: clientTime,
      device_id: 'desktop-local',
    });
    android.state.tasks[0].title = 'Android title';
    await android.repositories.sync.recordOperation({
      op_id: 'op-android-title',
      entity_type: 'task',
      entity_id: 'task-merge',
      operation: 'update',
      base_revision: 1,
      payload: { base, fields: { title: 'Android title' } },
      client_time: clientTime,
      device_id: 'android-local',
    });

    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);
    const androidResult = await syncClient(android.repositories, android.state, remote, androidDevice);
    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);

    expect(androidResult).toMatchObject({ conflicts: 0 });
    expect(android.state.syncConflicts).toHaveLength(0);
    expect(android.state.tasks[0]).toMatchObject({ title: 'Android title', due_date: '2026-01-10', server_revision: 3 });
    expect(desktop.state.tasks[0]).toMatchObject({ title: 'Android title', due_date: '2026-01-10', server_revision: 3 });
  });

  it('resolves same-field task conflicts by server ordering and records metadata', async () => {
    const { remote, desktop, android } = createWorld('acct-same-field');
    const base = { title: 'Base task', due_date: null };
    await seedRemoteTask(remote, 'task-same-field', base);
    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);
    await syncClient(android.repositories, android.state, remote, androidDevice);

    desktop.state.tasks[0].title = 'Desktop title';
    await desktop.repositories.sync.recordOperation({
      op_id: 'op-desktop-title',
      entity_type: 'task',
      entity_id: 'task-same-field',
      operation: 'update',
      base_revision: 1,
      payload: { base, fields: { title: 'Desktop title' } },
      client_time: clientTime,
      device_id: 'desktop-local',
    });
    android.state.tasks[0].title = 'Android title';
    await android.repositories.sync.recordOperation({
      op_id: 'op-android-title-conflict',
      entity_type: 'task',
      entity_id: 'task-same-field',
      operation: 'update',
      base_revision: 1,
      payload: { base, fields: { title: 'Android title' } },
      client_time: clientTime,
      device_id: 'android-local',
    });

    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);
    const androidResult = await syncClient(android.repositories, android.state, remote, androidDevice);

    expect(androidResult).toMatchObject({ conflicts: 1 });
    expect(android.state.tasks[0]).toMatchObject({ title: 'Desktop title', server_revision: 2 });
    expect(android.state.syncConflicts[0]).toMatchObject({
      entity_type: 'task',
      entity_id: 'task-same-field',
      local_payload: {
        attempted_payload: { title: 'Android title' },
        field_conflicts: [{
          field: 'title',
          local_value: 'Android title',
          remote_value: 'Desktop title',
          base_value: 'Base task',
          resolution: 'remote_wins',
        }],
      },
    });
  });

  it('syncs a local delete as a tombstone and does not resurrect the task', async () => {
    const { remote, desktop, android } = createWorld('acct-delete');
    await seedRemoteTask(remote, 'task-delete', { title: 'Delete me', due_date: null });
    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);
    await syncClient(android.repositories, android.state, remote, androidDevice);

    desktop.state.tasks[0].is_archived = true;
    await desktop.repositories.sync.recordOperation({
      op_id: 'op-desktop-delete',
      entity_type: 'task',
      entity_id: 'task-delete',
      operation: 'delete',
      base_revision: 1,
      payload: {},
      client_time: clientTime,
      device_id: 'desktop-local',
    });

    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);
    await syncClient(android.repositories, android.state, remote, androidDevice);
    await syncClient(android.repositories, android.state, remote, androidDevice);

    expect(android.state.tasks).toHaveLength(1);
    expect(android.state.tasks[0].is_archived).toBe(true);
    expect((android.state.tasks[0] as { deleted_at?: string }).deleted_at).toEqual(expect.any(String));
  });

  it('syncs a desktop-created reminder to Android and schedules local delivery', async () => {
    const { remote, desktop, android } = createWorld('acct-reminder-cross');
    const backgroundSpy = vi.fn(async () => ({ supported: true }));
    android.repositories.platform.registerBackgroundWork = backgroundSpy;
    await desktop.repositories.sync.recordOperation({
      op_id: 'op-desktop-reminder',
      entity_type: 'task_reminder',
      entity_id: 'reminder-cross',
      operation: 'create',
      payload: {
        task_id: 'task-reminder',
        offset: '10m',
        reminder_time: '2026-01-05T10:00:00.000Z',
        reminded: true,
      },
      client_time: clientTime,
      device_id: 'desktop-local',
    });

    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);
    await syncClient(android.repositories, android.state, remote, androidDevice);

    expect(android.state.reminders[0]).toMatchObject({
      id: 'reminder-cross',
      task_id: 'task-reminder',
      offset: '10m',
      reminded: false,
    });
    expect(backgroundSpy).toHaveBeenCalledWith({ id: 'reminder:reminder-cross', reason: 'notification' });
  });

  it('syncs an Android habit check-in to desktop habit stats', async () => {
    const { remote, desktop, android } = createWorld('acct-habit');
    await android.repositories.sync.recordOperation({
      op_id: 'op-android-habit',
      entity_type: 'habit',
      entity_id: 'habit-water',
      operation: 'create',
      payload: { name: 'Drink water', color: '#10B981', icon: 'droplets', frequency: 'daily', target_count: 1, sort_order: 0 },
      client_time: clientTime,
      device_id: 'android-local',
    });
    await android.repositories.sync.recordOperation({
      op_id: 'op-android-habit-log',
      entity_type: 'habit_log',
      entity_id: 'habit-log-water',
      operation: 'create',
      payload: { habit_id: 'habit-water', log_date: '2026-01-05', count: 1, note: '' },
      client_time: clientTime,
      device_id: 'android-local',
    });

    await syncClient(android.repositories, android.state, remote, androidDevice);
    await syncClient(desktop.repositories, desktop.state, remote, desktopDevice);

    const habits = await desktop.repositories.habits.list();
    expect(habits[0]).toMatchObject({
      id: 'habit-water',
      name: 'Drink water',
      is_done_today: true,
      current_streak: 1,
      completion_rate: 100,
    });
  });

  it('retries a failed sync without duplicating remote changes', async () => {
    const { store, remote, desktop } = createWorld('acct-retry');
    const flaky = new FlakyAfterAcceptRemote(remote);
    await desktop.repositories.sync.recordOperation({
      op_id: 'op-retry-create',
      entity_type: 'task',
      entity_id: 'task-retry',
      operation: 'create',
      payload: { title: 'Retry once' },
      client_time: clientTime,
      device_id: 'desktop-local',
    });

    await expect(syncClient(desktop.repositories, desktop.state, flaky, desktopDevice)).rejects.toThrow('network dropped after accept');
    await expect(desktop.repositories.sync.deriveEntityStatus('task', 'task-retry')).resolves.toBe('failed');
    await syncClient(desktop.repositories, desktop.state, flaky, desktopDevice);

    expect(store.exportSnapshot().changes.filter((change) => change.entity_id === 'task-retry')).toHaveLength(1);
    await expect(desktop.repositories.sync.deriveEntityStatus('task', 'task-retry')).resolves.toBe('clean');
    expect(desktop.state.tasks.filter((task) => task.id === 'task-retry')).toHaveLength(1);
  });
});
