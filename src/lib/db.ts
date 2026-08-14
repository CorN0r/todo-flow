import { invoke } from '@tauri-apps/api/core';
import type { Task, TaskDetail, CreateTaskInput, UpdateTaskInput, ReorderItem, TaskReminder } from '../types/task';
import type { Tag, TagWithCount, CreateTagInput } from '../types/tag';
import type { Attachment } from '../types/attachment';
import type {
  CreateSyncConflictInput,
  CreateSyncOperationInput,
  SyncConflict,
  SyncEntityStatus,
  SyncEntityType,
  SyncMetaEntry,
  SyncOperation,
  SyncOperationStatus,
} from '../domain/models/sync';

// Task commands
export async function createTask(input: CreateTaskInput): Promise<Task> {
  return invoke('create_task', { ...input });
}

export async function getTask(id: string): Promise<TaskDetail> {
  return invoke('get_task', { id });
}

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  return invoke('update_task', { ...input });
}

export async function deleteTask(id: string): Promise<void> {
  return invoke('delete_task', { id });
}

export async function reorderTasks(items: ReorderItem[]): Promise<void> {
  return invoke('reorder_tasks', { items });
}

export async function getTasks(filters?: {
  tag_ids?: string[];
  is_completed?: boolean;
  due_date_from?: string;
  due_date_to?: string;
  search_query?: string;
  parent_task_id?: string;
  my_day_date?: string;
  priority?: number;
  is_suspended?: boolean;
  is_abandoned?: boolean;
  include_children?: boolean;
  include_archived?: boolean;
}): Promise<Task[]> {
  return invoke('get_tasks', { ...filters });
}

export async function duplicateTask(id: string): Promise<Task> {
  return invoke('duplicate_task', { id });
}

export async function addTaskToMyDay(id: string): Promise<Task> {
  return invoke('add_task_to_my_day', { id });
}

export async function removeTaskFromMyDay(id: string): Promise<Task> {
  return invoke('remove_task_from_my_day', { id });
}

// Reminder commands
export async function getTaskReminders(taskId: string): Promise<TaskReminder[]> {
  return invoke('get_task_reminders', { task_id: taskId });
}

export async function createTaskReminder(taskId: string, offset: string, dueDate?: string): Promise<TaskReminder> {
  return invoke('create_task_reminder', { task_id: taskId, offset, due_date: dueDate });
}

export async function deleteTaskReminder(reminderId: string): Promise<void> {
  return invoke('delete_task_reminder', { reminder_id: reminderId });
}

export async function clearTaskReminders(taskId: string): Promise<void> {
  return invoke('clear_task_reminders', { task_id: taskId });
}

// Tag commands
export async function createTag(input: CreateTagInput): Promise<Tag> {
  return invoke('create_tag', { ...input });
}

export async function getTags(): Promise<TagWithCount[]> {
  return invoke('get_tags');
}

export async function updateTag(
  id: string,
  input: { name?: string; color?: string; parent_tag_id?: string | null }
): Promise<Tag> {
  return invoke('update_tag', { id, ...input });
}

export async function deleteTag(id: string): Promise<void> {
  return invoke('delete_tag', { id });
}

export async function reorderTags(items: { id: string; sort_order: number }[]): Promise<void> {
  return invoke('reorder_tags', { items });
}

// Attachment commands
export async function uploadAttachment(taskId: string, sourcePath: string): Promise<Attachment> {
  return invoke('upload_attachment', { taskId, sourcePath });
}

export async function uploadLinkAttachment(taskId: string, url: string, title?: string): Promise<Attachment> {
  return invoke('upload_link_attachment', { taskId, url, title });
}

export async function getAttachments(taskId: string): Promise<Attachment[]> {
  return invoke('get_attachments', { taskId });
}

export async function deleteAttachment(id: string): Promise<void> {
  return invoke('delete_attachment', { id });
}

export async function getAttachmentFilePath(attachmentId: string): Promise<string> {
  return invoke('get_attachment_file_path', { attachmentId });
}

// Settings commands
export async function getSetting(key: string): Promise<string | null> {
  return invoke('get_setting', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke('set_setting', { key, value });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  return invoke('get_all_settings');
}

export async function backupDatabase(destination: string): Promise<void> {
  return invoke('backup_database', { destination });
}

export async function exportCsv(path: string, content: string): Promise<void> {
  return invoke('export_csv', { path, content });
}

export async function importDatabase(source: string): Promise<string> {
  return invoke('import_database', { source });
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke('get_dashboard_stats');
}

export interface DashboardStats {
  total_tasks: number;
  completed_tasks: number;
  incomplete_tasks: number;
  overdue_tasks: number;
  suspended_tasks: number;
  abandoned_tasks: number;
  today_completed: number;
  today_total: number;
  completion_by_date: { date: string; completed: number }[];
  tasks_by_tag: { tag_id: string; tag_name: string; tag_color: string; count: number }[];
}

export async function hideToTray(): Promise<void> {
  return invoke('hide_to_tray');
}

export async function showMainFromWidget(): Promise<void> {
  return invoke('show_main_from_widget');
}

export async function showWidgetContextMenu(x: number, y: number): Promise<void> {
  return invoke('show_widget_context_menu', { x, y });
}

export async function showPomodoroWindow(): Promise<void> {
  return invoke('show_pomodoro_window');
}

export async function hidePomodoroWindow(): Promise<void> {
  return invoke('hide_pomodoro_window');
}

// Task note commands (桌面便签)
import type { NoteStyle, TaskNote } from '../types/note';

export async function openTaskNote(taskId: string): Promise<void> {
  return invoke('open_task_note', { task_id: taskId });
}

export async function closeTaskNote(taskId: string): Promise<void> {
  return invoke('close_task_note', { task_id: taskId });
}

export async function getTaskNote(taskId: string): Promise<TaskNote | null> {
  return invoke('get_task_note', { task_id: taskId });
}

export async function getAllTaskNotes(): Promise<TaskNote[]> {
  return invoke('get_all_task_notes');
}

export async function setNoteAlwaysOnTop(taskId: string, on: boolean): Promise<void> {
  return invoke('set_note_always_on_top', { task_id: taskId, on });
}

export async function setNoteStyle(taskId: string, style: NoteStyle): Promise<void> {
  return invoke('set_note_style', { task_id: taskId, style });
}

export async function setNoteCollapsed(taskId: string, collapsed: boolean): Promise<void> {
  return invoke('set_note_collapsed', { task_id: taskId, collapsed });
}

// Habit commands
import type { Habit, HabitWithStats, HabitLog, CreateHabitInput, UpdateHabitInput, ReorderHabitsItem } from '../types/habit';

export async function createHabit(input: CreateHabitInput): Promise<Habit> {
  return invoke('create_habit', { req: input });
}

export async function getHabits(): Promise<HabitWithStats[]> {
  return invoke('get_habits');
}

export async function updateHabit(id: string, input: UpdateHabitInput): Promise<Habit> {
  return invoke('update_habit', { id, req: input });
}

export async function deleteHabit(id: string): Promise<void> {
  return invoke('delete_habit', { id });
}

export async function reorderHabits(items: ReorderHabitsItem[]): Promise<void> {
  return invoke('reorder_habits', { items });
}

export async function toggleHabitLog(habitId: string, date?: string): Promise<HabitLog> {
  return invoke('toggle_habit_log', { habit_id: habitId, date });
}

// Sync metadata and operation commands
export async function getSyncMeta(key: string): Promise<string | null> {
  return invoke('get_sync_meta', { key });
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  return invoke('set_sync_meta', { key, value });
}

export async function listSyncMeta(): Promise<SyncMetaEntry[]> {
  return invoke('list_sync_meta');
}

export async function recordSyncOperation(input: CreateSyncOperationInput): Promise<SyncOperation> {
  return invoke('record_sync_operation', { req: input });
}

export async function listSyncOperations(status?: SyncOperationStatus): Promise<SyncOperation[]> {
  return invoke('list_sync_operations', { status });
}

export async function markSyncOperationStatus(
  opId: string,
  status: SyncOperationStatus,
  lastError?: string | null,
): Promise<SyncOperation> {
  return invoke('mark_sync_operation_status', { op_id: opId, status, last_error: lastError });
}

export async function incrementSyncOperationRetry(opId: string, lastError: string): Promise<SyncOperation> {
  return invoke('increment_sync_operation_retry', { op_id: opId, last_error: lastError });
}

export async function saveSyncConflict(input: CreateSyncConflictInput): Promise<SyncConflict> {
  return invoke('save_sync_conflict', { req: input });
}

export async function listSyncConflicts(entityType?: SyncEntityType, entityId?: string): Promise<SyncConflict[]> {
  return invoke('list_sync_conflicts', { entity_type: entityType, entity_id: entityId });
}

export async function resolveSyncConflict(id: string): Promise<SyncConflict> {
  return invoke('resolve_sync_conflict', { id });
}

export async function deriveSyncStatus(entityType: SyncEntityType, entityId: string): Promise<SyncEntityStatus> {
  return invoke('derive_sync_status', { entity_type: entityType, entity_id: entityId });
}
