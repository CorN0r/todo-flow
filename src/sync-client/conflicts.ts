import type { JsonRecord, SyncEntityType } from '../sync-server';

export interface FieldConflict {
  field: string;
  local_value: unknown;
  remote_value: unknown;
  base_value: unknown;
  resolution: 'remote_wins' | 'merged';
}

export interface FieldMergeResult {
  payload: JsonRecord;
  conflicts: FieldConflict[];
}

const entityFieldRules: Record<SyncEntityType, string[]> = {
  task: [
    'title',
    'description',
    'is_completed',
    'priority',
    'due_date',
    'reminder',
    'tag_ids',
    'recurrence',
    'sort_order',
    'my_day_date',
  ],
  tag: ['name', 'color', 'icon', 'parent_tag_id', 'sort_order'],
  reminder: ['task_id', 'offset', 'reminder_time'],
  habit: ['name', 'color', 'icon', 'frequency', 'target_count', 'sort_order'],
  habit_log: ['habit_id', 'log_date', 'count', 'note'],
  setting: ['value'],
  attachment: ['task_id', 'original_name', 'storage_name', 'mime_type', 'file_size', 'thumbnail_name'],
};

const taskScalarFields = entityFieldRules.task;

const richTextFields = new Set(['description', 'note']);

function valueForConflict(value: JsonRecord, field: string) {
  const next = value[field] ?? null;
  if (!richTextFields.has(field) || typeof next !== 'string') return next;
  if (next.length <= 500 && !next.includes('data:')) return next;
  return {
    kind: 'rich_text_snapshot',
    length: next.length,
    has_embedded_data: next.includes('data:'),
  };
}

function changed(value: JsonRecord, base: JsonRecord, field: string) {
  return JSON.stringify(value[field] ?? null) !== JSON.stringify(base[field] ?? null);
}

export function mergeEntityFields(
  entityType: SyncEntityType,
  base: JsonRecord,
  local: JsonRecord,
  remote: JsonRecord,
): FieldMergeResult {
  const payload: JsonRecord = { ...local };
  const conflicts: FieldConflict[] = [];
  const fields = entityFieldRules[entityType] ?? Object.keys({ ...base, ...local, ...remote });

  for (const field of fields) {
    const localChanged = changed(local, base, field);
    const remoteChanged = changed(remote, base, field);
    if (remoteChanged && !localChanged) {
      payload[field] = remote[field] ?? null;
      continue;
    }
    if (!remoteChanged || !localChanged) continue;
    if (JSON.stringify(local[field] ?? null) === JSON.stringify(remote[field] ?? null)) continue;
    payload[field] = remote[field] ?? null;
    conflicts.push({
      field,
      local_value: valueForConflict(local, field),
      remote_value: valueForConflict(remote, field),
      base_value: valueForConflict(base, field),
      resolution: 'remote_wins',
    });
  }

  return { payload, conflicts };
}

export function mergeTaskFields(base: JsonRecord, local: JsonRecord, remote: JsonRecord): FieldMergeResult {
  return mergeEntityFields('task', base, local, remote);
}

export const documentedConflictFields = {
  ...entityFieldRules,
  task: taskScalarFields,
};
