import type { Attachment } from '../../types/attachment';
import type { Habit, HabitLog, HabitWithStats } from '../../types/habit';
import type { Tag, TagWithCount } from '../../types/tag';
import type { Task, TaskReminder } from '../../types/task';
import type { AppRepositories } from '../repositories';
import type {
  CreateSyncConflictInput,
  CreateSyncOperationInput,
  SyncConflict,
  SyncEntityStatus,
  SyncOperation,
  SyncOperationStatus,
} from '../models/sync';

export interface MemoryRepositoryState {
  tasks: Task[];
  reminders: TaskReminder[];
  tags: Tag[];
  habits: Habit[];
  habitLogs: HabitLog[];
  attachments: Attachment[];
  settings: Record<string, string>;
  syncMeta: Record<string, string>;
  syncOperations: SyncOperation[];
  syncConflicts: SyncConflict[];
}

export type MemoryRepositorySeed = Partial<{
  tasks: Task[];
  reminders: TaskReminder[];
  tags: Tag[];
  habits: Habit[];
  habitLogs: HabitLog[];
  attachments: Attachment[];
  settings: Record<string, string>;
  syncMeta: Record<string, string>;
  syncOperations: SyncOperation[];
  syncConflicts: SyncConflict[];
}>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function createId(prefix: string, state: MemoryRepositoryState) {
  const total =
    state.tasks.length +
    state.reminders.length +
    state.tags.length +
    state.habits.length +
    state.habitLogs.length +
    state.attachments.length +
    state.syncOperations.length +
    state.syncConflicts.length +
    1;
  return `${prefix}-${total}`;
}

function toTaskWithChildren(task: Task, tasks: Task[], includeChildren: boolean): Task {
  const children = tasks.filter((candidate) => candidate.parent_task_id === task.id);
  return {
    ...clone(task),
    children_count: children.length,
    children: includeChildren ? children.map((child) => toTaskWithChildren(child, tasks, includeChildren)) : undefined,
  };
}

function toTagTree(tags: Tag[], parentId: string | null = null): TagWithCount[] {
  return tags
    .filter((tag) => tag.parent_tag_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((tag) => ({
      ...clone(tag),
      task_count: 0,
      incomplete_count: 0,
      children: toTagTree(tags, tag.id),
    }));
}

function habitStats(habit: Habit, logs: HabitLog[]): HabitWithStats {
  const habitLogs = logs.filter((log) => log.habit_id === habit.id);
  const doneToday = habitLogs.some((log) => log.log_date === today() && log.count > 0);
  return {
    ...clone(habit),
    current_streak: doneToday ? 1 : 0,
    best_streak: habitLogs.length > 0 ? 1 : 0,
    completion_rate: habitLogs.length > 0 ? 100 : 0,
    is_done_today: doneToday,
  };
}

function deriveStatus(operations: SyncOperation[], conflicts: SyncConflict[]): SyncEntityStatus {
  if (conflicts.some((conflict) => !conflict.resolved_at)) return 'conflicted';
  if (operations.some((operation) => operation.operation === 'delete' && operation.status !== 'acked')) return 'deleted';
  if (operations.some((operation) => operation.status === 'failed')) return 'failed';
  if (operations.some((operation) => operation.status === 'syncing')) return 'syncing';
  if (operations.some((operation) => operation.status === 'pending')) return 'pending';
  return 'clean';
}

export function createMemoryRepositories(seed: MemoryRepositorySeed = {}) {
  const state: MemoryRepositoryState = {
    tasks: clone(seed.tasks ?? []),
    reminders: clone(seed.reminders ?? []),
    tags: clone(seed.tags ?? []),
    habits: clone(seed.habits ?? []),
    habitLogs: clone(seed.habitLogs ?? []),
    attachments: clone(seed.attachments ?? []),
    settings: clone(seed.settings ?? {}),
    syncMeta: clone(seed.syncMeta ?? {}),
    syncOperations: clone(seed.syncOperations ?? []),
    syncConflicts: clone(seed.syncConflicts ?? []),
  };

  const repositories: AppRepositories = {
    tasks: {
      async create(input) {
        const timestamp = now();
        const task: Task = {
          id: createId('task', state),
          title: input.title,
          description: input.description ?? '',
          is_completed: false,
          is_archived: false,
          is_suspended: false,
          is_abandoned: false,
          is_pinned: false,
          priority: input.priority ?? 0,
          due_date: input.due_date ?? null,
          reminder: input.reminder ?? null,
          tag_ids: input.tag_ids ?? [],
          parent_task_id: input.parent_task_id ?? null,
          sort_order: state.tasks.length,
          recurrence: input.recurrence ?? null,
          my_day_date: input.my_day_date ?? null,
          children_count: 0,
          created_at: timestamp,
          updated_at: timestamp,
        };
        state.tasks.push(task);
        return clone(task);
      },
      async get(id) {
        const task = state.tasks.find((item) => item.id === id);
        if (!task) throw new Error(`Task not found: ${id}`);
        return {
          task: toTaskWithChildren(task, state.tasks, true),
          children: state.tasks.filter((item) => item.parent_task_id === id).map((child) => toTaskWithChildren(child, state.tasks, true)),
        };
      },
      async list(filters = {}) {
        const includeChildren = filters.include_children ?? false;
        let tasks = [...state.tasks];
        if (!filters.include_archived) tasks = tasks.filter((task) => !task.is_archived);
        if (filters.tag_ids !== undefined) tasks = tasks.filter((task) => filters.tag_ids!.some((tid) => task.tag_ids.includes(tid)));
        if (filters.is_completed !== undefined) tasks = tasks.filter((task) => task.is_completed === filters.is_completed);
        if (filters.due_date_from) tasks = tasks.filter((task) => task.due_date !== null && task.due_date >= filters.due_date_from!);
        if (filters.due_date_to) tasks = tasks.filter((task) => task.due_date !== null && task.due_date <= filters.due_date_to!);
        if (filters.search_query) {
          const query = filters.search_query.toLowerCase();
          tasks = tasks.filter((task) => task.title.toLowerCase().includes(query) || task.description.toLowerCase().includes(query));
        }
        if (filters.parent_task_id !== undefined) tasks = tasks.filter((task) => task.parent_task_id === filters.parent_task_id);
        if (filters.my_day_date !== undefined) tasks = tasks.filter((task) => task.my_day_date === filters.my_day_date);
        if (filters.priority !== undefined) tasks = tasks.filter((task) => task.priority === filters.priority);
        if (filters.is_suspended !== undefined) tasks = tasks.filter((task) => task.is_suspended === filters.is_suspended);
        if (filters.is_abandoned !== undefined) tasks = tasks.filter((task) => task.is_abandoned === filters.is_abandoned);
        return tasks.sort((a, b) => a.sort_order - b.sort_order).map((task) => toTaskWithChildren(task, state.tasks, includeChildren));
      },
      async update(input) {
        const index = state.tasks.findIndex((task) => task.id === input.id);
        if (index === -1) throw new Error(`Task not found: ${input.id}`);
        const updated = { ...state.tasks[index], ...input, updated_at: now() };
        state.tasks[index] = updated;
        return clone(updated);
      },
      async delete(id) {
        const ids = new Set([id]);
        for (const task of state.tasks) {
          if (ids.has(task.parent_task_id ?? '')) ids.add(task.id);
        }
        state.tasks = state.tasks.filter((task) => !ids.has(task.id));
        state.reminders = state.reminders.filter((reminder) => !ids.has(reminder.task_id));
      },
      async reorder(items) {
        for (const item of items) {
          const task = state.tasks.find((candidate) => candidate.id === item.id);
          if (task) {
            task.sort_order = item.sort_order;
            task.parent_task_id = item.parent_task_id;
            task.updated_at = now();
          }
        }
      },
      async duplicate(id) {
        const detail = await repositories.tasks.get(id);
        return repositories.tasks.create({
          title: `${detail.task.title} copy`,
          description: detail.task.description,
          tag_ids: detail.task.tag_ids,
          parent_task_id: detail.task.parent_task_id ?? undefined,
          due_date: detail.task.due_date ?? undefined,
          priority: detail.task.priority,
          reminder: detail.task.reminder ?? undefined,
          recurrence: detail.task.recurrence ?? undefined,
          my_day_date: detail.task.my_day_date,
        });
      },
      async addToMyDay(id) {
        return repositories.tasks.update({ id, my_day_date: today() });
      },
      async removeFromMyDay(id) {
        return repositories.tasks.update({ id, my_day_date: null });
      },
    },
    reminders: {
      async listForTask(taskId) {
        return clone(state.reminders.filter((reminder) => reminder.task_id === taskId));
      },
      async create({ taskId, offset, dueDate }) {
        const reminder: TaskReminder = {
          id: createId('reminder', state),
          task_id: taskId,
          offset,
          reminder_time: dueDate ?? now(),
          reminded: false,
          created_at: now(),
        };
        state.reminders.push(reminder);
        return clone(reminder);
      },
      async delete(id) {
        state.reminders = state.reminders.filter((reminder) => reminder.id !== id);
      },
      async clearForTask(taskId) {
        state.reminders = state.reminders.filter((reminder) => reminder.task_id !== taskId);
      },
    },
    tags: {
      async create(input) {
        const timestamp = now();
        const tag: Tag = {
          id: createId('tag', state),
          name: input.name,
          color: input.color ?? '#6366f1',
          icon: 'tag',
          sort_order: state.tags.length,
          parent_tag_id: input.parent_tag_id ?? null,
          created_at: timestamp,
          updated_at: timestamp,
        };
        state.tags.push(tag);
        return clone(tag);
      },
      async list() {
        return toTagTree(state.tags);
      },
      async update(id, input) {
        const index = state.tags.findIndex((tag) => tag.id === id);
        if (index === -1) throw new Error(`Tag not found: ${id}`);
        state.tags[index] = { ...state.tags[index], ...input, updated_at: now() };
        return clone(state.tags[index]);
      },
      async delete(id) {
        const ids = new Set([id]);
        for (const tag of state.tags) {
          if (ids.has(tag.parent_tag_id ?? '')) ids.add(tag.id);
        }
        state.tags = state.tags.filter((tag) => !ids.has(tag.id));
        state.tasks = state.tasks.map((task) =>
          task.tag_ids.some((tid) => ids.has(tid))
            ? { ...task, tag_ids: task.tag_ids.filter((tid) => !ids.has(tid)) }
            : task,
        );
      },
      async reorder(items) {
        for (const item of items) {
          const tag = state.tags.find((candidate) => candidate.id === item.id);
          if (tag) {
            tag.sort_order = item.sort_order;
            tag.updated_at = now();
          }
        }
      },
    },
    habits: {
      async create(input) {
        const timestamp = now();
        const habit: Habit = {
          id: createId('habit', state),
          name: input.name,
          color: input.color ?? '#10b981',
          icon: input.icon ?? 'check',
          frequency: input.frequency ?? 'daily',
          target_count: input.target_count ?? 1,
          sort_order: state.habits.length,
          created_at: timestamp,
          updated_at: timestamp,
        };
        state.habits.push(habit);
        return clone(habit);
      },
      async list() {
        return state.habits.sort((a, b) => a.sort_order - b.sort_order).map((habit) => habitStats(habit, state.habitLogs));
      },
      async update(id, input) {
        const index = state.habits.findIndex((habit) => habit.id === id);
        if (index === -1) throw new Error(`Habit not found: ${id}`);
        state.habits[index] = { ...state.habits[index], ...input, updated_at: now() };
        return clone(state.habits[index]);
      },
      async delete(id) {
        state.habits = state.habits.filter((habit) => habit.id !== id);
        state.habitLogs = state.habitLogs.filter((log) => log.habit_id !== id);
      },
      async reorder(items) {
        for (const item of items) {
          const habit = state.habits.find((candidate) => candidate.id === item.id);
          if (habit) {
            habit.sort_order = item.sort_order;
            habit.updated_at = now();
          }
        }
      },
      async toggleLog(habitId, date = today()) {
        const existingIndex = state.habitLogs.findIndex((log) => log.habit_id === habitId && log.log_date === date);
        if (existingIndex >= 0) {
          const [removed] = state.habitLogs.splice(existingIndex, 1);
          return clone({ ...removed, count: 0 });
        }
        const log: HabitLog = {
          id: createId('habit-log', state),
          habit_id: habitId,
          log_date: date,
          count: 1,
          note: '',
          created_at: now(),
        };
        state.habitLogs.push(log);
        return clone(log);
      },
    },
    attachments: {
      async uploadFile(taskId, sourcePath) {
        const attachment: Attachment = {
          id: createId('attachment', state),
          task_id: taskId,
          original_name: sourcePath.split(/[\\/]/).pop() ?? sourcePath,
          storage_name: sourcePath,
          mime_type: 'application/octet-stream',
          file_size: 0,
          thumbnail_name: null,
          created_at: now(),
        };
        state.attachments.push(attachment);
        return clone(attachment);
      },
      async uploadLink(taskId, url, title) {
        const attachment: Attachment = {
          id: createId('attachment', state),
          task_id: taskId,
          original_name: title ?? url,
          storage_name: url,
          mime_type: 'text/uri-list',
          file_size: 0,
          thumbnail_name: null,
          created_at: now(),
        };
        state.attachments.push(attachment);
        return clone(attachment);
      },
      async listForTask(taskId) {
        return clone(state.attachments.filter((attachment) => attachment.task_id === taskId));
      },
      async delete(id) {
        state.attachments = state.attachments.filter((attachment) => attachment.id !== id);
      },
      async getFilePath(id) {
        const attachment = state.attachments.find((item) => item.id === id);
        if (!attachment) throw new Error(`Attachment not found: ${id}`);
        return attachment.storage_name;
      },
    },
    settings: {
      async get(key) {
        return state.settings[key] ?? null;
      },
      async set(key, value) {
        state.settings[key] = value;
      },
      async getAll() {
        return clone(state.settings);
      },
      async backupDatabase() {},
      async exportCsv() {},
      async importDatabase(source) {
        return source;
      },
      async getDashboardStats() {
        const total = state.tasks.length;
        const completed = state.tasks.filter((task) => task.is_completed).length;
        const todayDate = today();
        return {
          total_tasks: total,
          completed_tasks: completed,
          incomplete_tasks: total - completed,
          overdue_tasks: state.tasks.filter((task) => task.due_date && task.due_date < todayDate && !task.is_completed).length,
          suspended_tasks: state.tasks.filter((task) => task.is_suspended).length,
          abandoned_tasks: state.tasks.filter((task) => task.is_abandoned).length,
          today_completed: state.tasks.filter((task) => task.due_date === todayDate && task.is_completed).length,
          today_total: state.tasks.filter((task) => task.due_date === todayDate).length,
          completion_by_date: [],
          tasks_by_tag: [],
        };
      },
    },
    sync: {
      async getMeta(key) {
        return state.syncMeta[key] ?? null;
      },
      async setMeta(key, value) {
        state.syncMeta[key] = value;
      },
      async listMeta() {
        return Object.entries(state.syncMeta).map(([key, value]) => ({ key, value }));
      },
      async recordOperation(input: CreateSyncOperationInput) {
        const operation: SyncOperation = {
          op_id: input.op_id ?? createId('op', state),
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          operation: input.operation,
          base_revision: input.base_revision ?? null,
          payload: input.payload,
          client_time: input.client_time ?? now(),
          device_id: input.device_id,
          status: 'pending',
          retry_count: 0,
          last_error: null,
          created_at: now(),
        };
        state.syncOperations.push(operation);
        return clone(operation);
      },
      async listOperations(status?: SyncOperationStatus) {
        return clone(state.syncOperations.filter((operation) => !status || operation.status === status));
      },
      async markOperationStatus(opId, status, lastError = null) {
        const operation = state.syncOperations.find((item) => item.op_id === opId);
        if (!operation) throw new Error(`Sync operation not found: ${opId}`);
        operation.status = status;
        operation.last_error = lastError;
        return clone(operation);
      },
      async incrementRetry(opId, lastError) {
        const operation = state.syncOperations.find((item) => item.op_id === opId);
        if (!operation) throw new Error(`Sync operation not found: ${opId}`);
        operation.retry_count += 1;
        operation.status = 'failed';
        operation.last_error = lastError;
        return clone(operation);
      },
      async saveConflict(input: CreateSyncConflictInput) {
        const conflict: SyncConflict = {
          id: input.id ?? createId('conflict', state),
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          local_payload: input.local_payload,
          remote_payload: input.remote_payload,
          created_at: input.created_at ?? now(),
          resolved_at: null,
        };
        state.syncConflicts.push(conflict);
        return clone(conflict);
      },
      async listConflicts(entityType, entityId) {
        return clone(state.syncConflicts.filter((conflict) => {
          if (conflict.resolved_at) return false;
          if (entityType && conflict.entity_type !== entityType) return false;
          if (entityId && conflict.entity_id !== entityId) return false;
          return true;
        }));
      },
      async resolveConflict(id) {
        const conflict = state.syncConflicts.find((item) => item.id === id);
        if (!conflict) throw new Error(`Sync conflict not found: ${id}`);
        conflict.resolved_at = now();
        return clone(conflict);
      },
      async deriveEntityStatus(entityType, entityId) {
        const operations = state.syncOperations.filter((operation) => operation.entity_type === entityType && operation.entity_id === entityId);
        const conflicts = state.syncConflicts.filter((conflict) => conflict.entity_type === entityType && conflict.entity_id === entityId);
        return deriveStatus(operations, conflicts);
      },
    },
    platform: {
      kind: 'test',
      async hideToTray() {},
      async showMainFromWidget() {},
      async showWidgetContextMenu() {},
      async showPomodoroWindow() {},
      async hidePomodoroWindow() {},
      async sendNotification() {},
      async chooseFiles() {
        return [];
      },
      async chooseSavePath() {
        return null;
      },
      async readFileBytes() {
        return new Uint8Array();
      },
      toFileAssetUrl(path) {
        return path;
      },
      async share() {
        return { supported: false, reason: 'Memory platform adapter does not implement share.' };
      },
      async registerBackgroundWork() {
        return { supported: false, reason: 'Memory platform adapter does not implement background work.' };
      },
      async onFileDrop() {
        return () => {};
      },
    },
  };

  return { repositories, state };
}
