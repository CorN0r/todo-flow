import { invoke } from '@tauri-apps/api/core';
import type { Task, TaskDetail, CreateTaskInput, UpdateTaskInput, ReorderItem } from '../types/task';
import type { Tag, TagWithCount, CreateTagInput } from '../types/tag';
import type { Attachment } from '../types/attachment';

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
  tag_id?: string;
  is_completed?: boolean;
  due_date_from?: string;
  due_date_to?: string;
  search_query?: string;
  parent_task_id?: string;
  my_day_date?: string;
  include_children?: boolean;
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

export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke('get_dashboard_stats');
}

export interface DashboardStats {
  total_tasks: number;
  completed_tasks: number;
  incomplete_tasks: number;
  overdue_tasks: number;
  today_completed: number;
  today_total: number;
  streak_days: number;
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
