import type { Attachment } from '../models/attachment';
import type { CreateHabitInput, Habit, HabitWithStats, ReorderHabitsItem, UpdateHabitInput } from '../models/habit';
import type { HabitLog } from '../models/habitLog';
import type { CreateTaskReminderInput, TaskReminder } from '../models/reminder';
import type { DashboardStats, SettingsMap } from '../models/settings';
import type {
  CreateSyncConflictInput,
  CreateSyncOperationInput,
  SyncConflict,
  SyncEntityStatus,
  SyncEntityType,
  SyncMetaEntry,
  SyncOperation,
  SyncOperationStatus,
} from '../models/sync';
import type { CreateTagInput, ReorderTagItem, Tag, TagWithCount, UpdateTagInput } from '../models/tag';
import type { CreateTaskInput, ReorderItem, Task, TaskDetail, TaskFilters, UpdateTaskInput } from '../models/task';

export interface TaskRepository {
  create(input: CreateTaskInput): Promise<Task>;
  get(id: string): Promise<TaskDetail>;
  list(filters?: TaskFilters): Promise<Task[]>;
  update(input: UpdateTaskInput): Promise<Task>;
  delete(id: string): Promise<void>;
  reorder(items: ReorderItem[]): Promise<void>;
  duplicate(id: string): Promise<Task>;
  addToMyDay(id: string): Promise<Task>;
  removeFromMyDay(id: string): Promise<Task>;
}

export interface ReminderRepository {
  listForTask(taskId: string): Promise<TaskReminder[]>;
  create(input: CreateTaskReminderInput): Promise<TaskReminder>;
  delete(id: string): Promise<void>;
  clearForTask(taskId: string): Promise<void>;
}

export interface TagRepository {
  create(input: CreateTagInput): Promise<Tag>;
  list(): Promise<TagWithCount[]>;
  update(id: string, input: UpdateTagInput): Promise<Tag>;
  delete(id: string): Promise<void>;
  reorder(items: ReorderTagItem[]): Promise<void>;
}

export interface HabitRepository {
  create(input: CreateHabitInput): Promise<Habit>;
  list(): Promise<HabitWithStats[]>;
  update(id: string, input: UpdateHabitInput): Promise<Habit>;
  delete(id: string): Promise<void>;
  reorder(items: ReorderHabitsItem[]): Promise<void>;
  toggleLog(habitId: string, date?: string): Promise<HabitLog>;
}

export interface AttachmentRepository {
  uploadFile(taskId: string, sourcePath: string): Promise<Attachment>;
  uploadLink(taskId: string, url: string, title?: string): Promise<Attachment>;
  listForTask(taskId: string): Promise<Attachment[]>;
  delete(id: string): Promise<void>;
  getFilePath(id: string): Promise<string>;
}

export interface SettingsRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getAll(): Promise<SettingsMap>;
  backupDatabase(destination: string): Promise<void>;
  exportCsv(path: string, content: string): Promise<void>;
  importDatabase(source: string): Promise<string>;
  getDashboardStats(): Promise<DashboardStats>;
}

export interface SyncOperationRepository {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  listMeta(): Promise<SyncMetaEntry[]>;
  recordOperation(input: CreateSyncOperationInput): Promise<SyncOperation>;
  listOperations(status?: SyncOperationStatus): Promise<SyncOperation[]>;
  markOperationStatus(opId: string, status: SyncOperationStatus, lastError?: string | null): Promise<SyncOperation>;
  incrementRetry(opId: string, lastError: string): Promise<SyncOperation>;
  saveConflict(input: CreateSyncConflictInput): Promise<SyncConflict>;
  listConflicts(entityType?: SyncEntityType, entityId?: string): Promise<SyncConflict[]>;
  resolveConflict(id: string): Promise<SyncConflict>;
  deriveEntityStatus(entityType: SyncEntityType, entityId: string): Promise<SyncEntityStatus>;
}

export type PlatformKind = 'desktop' | 'android' | 'web' | 'test';

export interface PlatformFileDialogFilter {
  name: string;
  extensions: string[];
}

export interface PlatformOpenFileOptions {
  multiple?: boolean;
  filters?: PlatformFileDialogFilter[];
}

export interface PlatformSaveFileOptions {
  defaultPath?: string;
  filters?: PlatformFileDialogFilter[];
}

export interface PlatformNotificationRequest {
  title: string;
  body?: string;
}

export interface PlatformShareRequest {
  title?: string;
  text?: string;
  url?: string;
}

export interface PlatformBackgroundWorkRequest {
  id: string;
  reason: 'sync' | 'notification' | 'focus-session' | 'other';
}

export interface PlatformCapabilityResult {
  supported: boolean;
  reason?: string;
}

export interface PlatformFileDropEvent {
  paths: string[];
  position: { x: number; y: number };
}

export interface PlatformRepository {
  kind: PlatformKind;
  hideToTray(): Promise<void>;
  showMainFromWidget(): Promise<void>;
  showWidgetContextMenu(x: number, y: number): Promise<void>;
  showPomodoroWindow(): Promise<void>;
  hidePomodoroWindow(): Promise<void>;
  sendNotification(request: PlatformNotificationRequest): Promise<void>;
  chooseFiles(options?: PlatformOpenFileOptions): Promise<string[]>;
  chooseSavePath(options?: PlatformSaveFileOptions): Promise<string | null>;
  readFileBytes(path: string): Promise<Uint8Array>;
  toFileAssetUrl(path: string): string;
  share(request: PlatformShareRequest): Promise<PlatformCapabilityResult>;
  registerBackgroundWork(request: PlatformBackgroundWorkRequest): Promise<PlatformCapabilityResult>;
  onFileDrop(handler: (event: PlatformFileDropEvent) => void): Promise<() => void>;
}

export interface AppRepositories {
  tasks: TaskRepository;
  reminders: ReminderRepository;
  tags: TagRepository;
  habits: HabitRepository;
  attachments: AttachmentRepository;
  settings: SettingsRepository;
  sync: SyncOperationRepository;
  platform: PlatformRepository;
}
