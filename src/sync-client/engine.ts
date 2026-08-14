import type { AppRepositories } from '../domain/repositories';
import type { MemoryRepositoryState } from '../domain/adapters/memory';
import type {
  CreateSyncConflictInput,
  SyncEntityType as LocalSyncEntityType,
  SyncOperation,
} from '../domain/models/sync';
import type {
  ClientSyncOperation,
  JsonRecord,
  RevisionedChange,
  SyncEntityType as RemoteSyncEntityType,
} from '../sync-server';
import { mergeEntityFields } from './conflicts';
import type { RemoteSyncRepository } from './repository';

export interface SyncDeviceProfile {
  clientDeviceKey: string;
  platform: 'windows' | 'android' | 'ios' | 'harmonyos' | 'web' | 'test';
  displayName: string;
  appVersion?: string;
}

export interface LocalSyncAdapter {
  applyRemoteChange(change: RevisionedChange): Promise<'applied' | 'skipped'>;
  backupBeforeFirstSync?(): Promise<void>;
}

export interface SyncRunResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  cursor: number;
}

const entityToRemote: Record<LocalSyncEntityType, RemoteSyncEntityType> = {
  task: 'task',
  task_reminder: 'reminder',
  tag: 'tag',
  attachment: 'attachment',
  habit: 'habit',
  habit_log: 'habit_log',
  setting: 'setting',
};

const entityToLocal: Record<RemoteSyncEntityType, LocalSyncEntityType> = {
  task: 'task',
  reminder: 'task_reminder',
  tag: 'tag',
  attachment: 'attachment',
  habit: 'habit',
  habit_log: 'habit_log',
  setting: 'setting',
};

function asPayload(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord;
  return { value };
}

function asOptionalPayload(value: unknown): JsonRecord | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord;
  return null;
}

function operationPatch(value: unknown): JsonRecord {
  const payload = asPayload(value);
  const fields = asOptionalPayload(payload.fields);
  const changes = asOptionalPayload(payload.changes);
  return fields ?? changes ?? payload;
}

function operationBase(value: unknown): JsonRecord | null {
  const payload = asPayload(value);
  return asOptionalPayload(payload.base) ?? asOptionalPayload(payload.base_payload);
}

function toRemoteOperation(operation: SyncOperation): ClientSyncOperation {
  return {
    op_id: operation.op_id,
    entity_type: entityToRemote[operation.entity_type],
    entity_id: operation.entity_id,
    operation: operation.operation,
    payload: operationPatch(operation.payload),
    base_revision: operation.base_revision,
    client_time: operation.client_time,
    device_id: operation.device_id,
  };
}

function conflictInput(conflict: {
  entity_type: RemoteSyncEntityType;
  entity_id: string;
  remote_payload: JsonRecord;
  local_payload?: JsonRecord;
}): CreateSyncConflictInput {
  return {
    entity_type: entityToLocal[conflict.entity_type],
    entity_id: conflict.entity_id,
    local_payload: conflict.local_payload ?? {},
    remote_payload: conflict.remote_payload,
  };
}

export async function ensurePreSyncBackup(repositories: AppRepositories, destination = `todoflow-pre-sync-${new Date().toISOString().slice(0, 10)}.db`) {
  const alreadyBackedUp = await repositories.sync.getMeta('sync_preflight_backup_at');
  if (alreadyBackedUp) return false;
  await repositories.settings.backupDatabase(destination);
  await repositories.sync.setMeta('sync_preflight_backup_at', new Date().toISOString());
  return true;
}

export async function runClientSyncOnce({
  repositories,
  remote,
  local,
  device,
}: {
  repositories: AppRepositories;
  remote: RemoteSyncRepository;
  local: LocalSyncAdapter;
  device: SyncDeviceProfile;
}): Promise<SyncRunResult> {
  await repositories.sync.setMeta('sync_status', 'syncing');
  if (local.backupBeforeFirstSync) await local.backupBeforeFirstSync();

  try {
    const registered = await remote.registerDevice({
      client_device_key: device.clientDeviceKey,
      platform: device.platform,
      display_name: device.displayName,
      app_version: device.appVersion,
    });
    await repositories.sync.setMeta('sync_device_id', registered.device_id);

    const pending = [
      ...await repositories.sync.listOperations('pending'),
      ...(await repositories.sync.listOperations('failed')).filter((operation) => operation.last_error !== 'base_revision_stale'),
    ];
    for (const operation of pending) {
      await repositories.sync.markOperationStatus(operation.op_id, 'syncing');
    }

    const push = pending.length > 0
      ? await remote.push({ device_id: registered.device_id, operations: pending.map(toRemoteOperation) })
      : { accepted: [], conflicts: [], next_cursor: Number(await repositories.sync.getMeta('sync_cursor') ?? 0) };

    const acceptedOperationIds = push.accepted.map((item) => item.op_id);
    let pushedCount = push.accepted.length;
    let unresolvedConflictCount = 0;

    for (const accepted of push.accepted) {
      await repositories.sync.markOperationStatus(accepted.op_id, 'acked');
    }
    for (const conflict of push.conflicts) {
      const operation = pending.find((item) => item.op_id === conflict.op_id);
      const base = operation ? operationBase(operation.payload) : null;
      const patch = operation ? operationPatch(operation.payload) : {};
      const merge = base
        ? mergeEntityFields(conflict.entity_type, base, { ...base, ...patch }, conflict.remote_payload)
        : null;

      if (operation && merge && merge.conflicts.length === 0) {
        const mergePush = await remote.push({
          device_id: registered.device_id,
          operations: [{
            op_id: `${operation.op_id}:merge:${conflict.server_revision}`,
            entity_type: conflict.entity_type,
            entity_id: conflict.entity_id,
            operation: 'update',
            payload: merge.payload,
            base_revision: conflict.server_revision,
            client_time: new Date().toISOString(),
            device_id: registered.device_id,
          }],
        });
        for (const accepted of mergePush.accepted) {
          acceptedOperationIds.push(accepted.op_id);
          pushedCount += 1;
        }
        if (mergePush.accepted.length > 0 && mergePush.conflicts.length === 0) {
          await repositories.sync.markOperationStatus(operation.op_id, 'acked');
          continue;
        }
      }

      unresolvedConflictCount += 1;
      if (operation) await repositories.sync.markOperationStatus(operation.op_id, 'failed', conflict.reason);
      await repositories.sync.saveConflict(conflictInput({
        ...conflict,
        local_payload: {
          attempted_payload: patch,
          field_conflicts: merge?.conflicts ?? [],
        },
      }));
    }

    const cursor = Number(await repositories.sync.getMeta('sync_cursor') ?? 0);
    const pulled = await remote.pull({ cursor });
    for (const change of pulled.changes) {
      await local.applyRemoteChange(change);
      if (change.entity_type === 'reminder' && !change.deleted_at) {
        await repositories.platform.registerBackgroundWork({ id: `reminder:${change.entity_id}`, reason: 'notification' });
      }
    }
    await remote.ack({
      device_id: registered.device_id,
      applied_cursor: pulled.next_cursor,
      operation_ids: acceptedOperationIds,
    });
    await repositories.sync.setMeta('sync_cursor', String(pulled.next_cursor));
    await repositories.sync.setMeta('sync_status', unresolvedConflictCount > 0 ? 'conflicted' : 'clean');

    return {
      pushed: pushedCount,
      pulled: pulled.changes.length,
      conflicts: unresolvedConflictCount,
      cursor: pulled.next_cursor,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const syncing = await repositories.sync.listOperations('syncing');
    for (const operation of syncing) {
      await repositories.sync.incrementRetry(operation.op_id, message);
    }
    await repositories.sync.setMeta('sync_status', 'failed');
    throw error;
  }
}

function upsertById<T extends { id: string }>(items: T[], next: T) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    items[index] = next;
  } else {
    items.push(next);
  }
}

function hasRevision(entity: { server_revision?: number | null }, revision: number) {
  return typeof entity.server_revision === 'number' && entity.server_revision >= revision;
}

export function createMemorySyncLocalAdapter(state: MemoryRepositoryState): LocalSyncAdapter {
  return {
    async applyRemoteChange(change) {
      if (change.entity_type === 'task') {
        const existing = state.tasks.find((task) => task.id === change.entity_id) as ({ server_revision?: number | null; deleted_at?: string | null } | undefined);
        if (existing && hasRevision(existing, change.revision)) return 'skipped';
        if (change.deleted_at) {
          if (existing) {
            existing.deleted_at = change.deleted_at;
            (existing as { is_archived?: boolean }).is_archived = true;
            existing.server_revision = change.revision;
          }
          return 'applied';
        }
        upsertById(state.tasks, {
          id: change.entity_id,
          title: String(change.payload.title ?? 'Untitled'),
          description: String(change.payload.description ?? ''),
          is_completed: Boolean(change.payload.is_completed ?? false),
          is_archived: false,
          is_suspended: false,
          is_abandoned: false,
          is_pinned: false,
          priority: Number(change.payload.priority ?? 0),
          due_date: (change.payload.due_date as string | null | undefined) ?? null,
          reminder: (change.payload.reminder as string | null | undefined) ?? null,
          tag_ids: (change.payload.tag_ids as string[] | undefined) ?? (change.payload.tag_id ? [change.payload.tag_id as string] : []),
          parent_task_id: (change.payload.parent_task_id as string | null | undefined) ?? null,
          sort_order: Number(change.payload.sort_order ?? state.tasks.length),
          recurrence: (change.payload.recurrence as string | null | undefined) ?? null,
          my_day_date: (change.payload.my_day_date as string | null | undefined) ?? null,
          children_count: 0,
          created_at: String(change.payload.created_at ?? change.server_time),
          updated_at: change.server_time,
          server_revision: change.revision,
          sync_status: 'clean',
        } as (typeof state.tasks)[number]);
        return 'applied';
      }

      if (change.entity_type === 'tag') {
        if (change.deleted_at) {
          state.tags = state.tags.filter((tag) => tag.id !== change.entity_id);
          return 'applied';
        }
        upsertById(state.tags, {
          id: change.entity_id,
          name: String(change.payload.name ?? 'Tag'),
          color: String(change.payload.color ?? '#6366f1'),
          icon: String(change.payload.icon ?? 'tag'),
          sort_order: Number(change.payload.sort_order ?? state.tags.length),
          parent_tag_id: (change.payload.parent_tag_id as string | null | undefined) ?? null,
          created_at: String(change.payload.created_at ?? change.server_time),
          updated_at: change.server_time,
          server_revision: change.revision,
        } as (typeof state.tags)[number]);
        return 'applied';
      }

      if (change.entity_type === 'habit') {
        if (change.deleted_at) {
          state.habits = state.habits.filter((habit) => habit.id !== change.entity_id);
          return 'applied';
        }
        upsertById(state.habits, {
          id: change.entity_id,
          name: String(change.payload.name ?? 'Habit'),
          color: String(change.payload.color ?? '#10B981'),
          icon: String(change.payload.icon ?? 'check'),
          frequency: String(change.payload.frequency ?? 'daily'),
          target_count: Number(change.payload.target_count ?? 1),
          sort_order: Number(change.payload.sort_order ?? state.habits.length),
          created_at: String(change.payload.created_at ?? change.server_time),
          updated_at: change.server_time,
          server_revision: change.revision,
        } as (typeof state.habits)[number]);
        return 'applied';
      }

      if (change.entity_type === 'habit_log') {
        if (change.deleted_at) {
          state.habitLogs = state.habitLogs.filter((log) => log.id !== change.entity_id);
          return 'applied';
        }
        upsertById(state.habitLogs, {
          id: change.entity_id,
          habit_id: String(change.payload.habit_id ?? ''),
          log_date: String(change.payload.log_date ?? change.server_time.slice(0, 10)),
          count: Number(change.payload.count ?? 1),
          note: String(change.payload.note ?? ''),
          created_at: String(change.payload.created_at ?? change.server_time),
          server_revision: change.revision,
        } as (typeof state.habitLogs)[number]);
        return 'applied';
      }

      if (change.entity_type === 'reminder') {
        if (change.deleted_at) {
          state.reminders = state.reminders.filter((reminder) => reminder.id !== change.entity_id);
          return 'applied';
        }
        upsertById(state.reminders, {
          id: change.entity_id,
          task_id: String(change.payload.task_id ?? ''),
          offset: String(change.payload.offset ?? '0m'),
          reminder_time: String(change.payload.reminder_time ?? change.server_time),
          reminded: false,
          created_at: String(change.payload.created_at ?? change.server_time),
          server_revision: change.revision,
        } as (typeof state.reminders)[number]);
        return 'applied';
      }

      if (change.entity_type === 'setting') {
        if (!change.deleted_at) state.settings[change.entity_id] = String(change.payload.value ?? '');
        return 'applied';
      }

      return 'skipped';
    },
  };
}
