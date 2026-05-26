import { invoke } from '@tauri-apps/api/core';
import type { Task, TaskDetail, CreateTaskInput, UpdateTaskInput, ReorderItem, Tag } from '../types/task';
import type { TodoList, ListWithCount, CreateListInput } from '../types/list';
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
  list_id?: string;
  is_completed?: boolean;
  due_date_from?: string;
  due_date_to?: string;
  search_query?: string;
  parent_task_id?: string;
  my_day_date?: string;
  tag_id?: string;
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
export async function getTags(): Promise<Tag[]> {
  return invoke('get_tags');
}

export async function createTag(name: string, color: string): Promise<Tag> {
  return invoke('create_tag', { name, color });
}

export async function updateTag(id: string, name?: string, color?: string): Promise<Tag> {
  return invoke('update_tag', { id, name, color });
}

export async function deleteTag(id: string): Promise<void> {
  return invoke('delete_tag', { id });
}

// List commands
export async function createList(input: CreateListInput): Promise<TodoList> {
  return invoke('create_list', { ...input });
}

export async function getLists(): Promise<ListWithCount[]> {
  return invoke('get_lists');
}

export async function updateList(
  id: string,
  input: Partial<Pick<TodoList, 'name' | 'color' | 'icon'>>
): Promise<TodoList> {
  return invoke('update_list', { id, ...input });
}

export async function deleteList(id: string): Promise<void> {
  return invoke('delete_list', { id });
}

export async function reorderLists(items: { id: string; sort_order: number }[]): Promise<void> {
  return invoke('reorder_lists', { items });
}

// Attachment commands
export async function uploadAttachment(taskId: string, sourcePath: string): Promise<Attachment> {
  return invoke('upload_attachment', { taskId, sourcePath });
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

// Widget commands
export async function getTodayTaskCount(): Promise<number> {
  return invoke('get_today_task_count');
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
  tasks_by_list: { list_id: string; list_name: string; list_color: string; count: number }[];
}

export async function hideToTray(): Promise<void> {
  return invoke('hide_to_tray');
}

export async function showMainFromWidget(): Promise<void> {
  return invoke('show_main_from_widget');
}
