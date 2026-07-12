import * as db from '../../lib/db';
import { createPlatformRepository } from './platformServices';
import type { AppRepositories } from '../repositories';

export const desktopRepositories: AppRepositories = {
  tasks: {
    create: (input) => db.createTask(input),
    get: (id) => db.getTask(id),
    list: (filters) => db.getTasks(filters),
    update: (input) => db.updateTask(input),
    delete: (id) => db.deleteTask(id),
    reorder: (items) => db.reorderTasks(items),
    duplicate: (id) => db.duplicateTask(id),
    addToMyDay: (id) => db.addTaskToMyDay(id),
    removeFromMyDay: (id) => db.removeTaskFromMyDay(id),
  },
  reminders: {
    listForTask: (taskId) => db.getTaskReminders(taskId),
    create: ({ taskId, offset, dueDate }) => db.createTaskReminder(taskId, offset, dueDate),
    delete: (id) => db.deleteTaskReminder(id),
    clearForTask: (taskId) => db.clearTaskReminders(taskId),
  },
  tags: {
    create: (input) => db.createTag(input),
    list: () => db.getTags(),
    update: (id, input) => db.updateTag(id, input),
    delete: (id) => db.deleteTag(id),
    reorder: (items) => db.reorderTags(items),
  },
  habits: {
    create: (input) => db.createHabit(input),
    list: () => db.getHabits(),
    update: (id, input) => db.updateHabit(id, input),
    delete: (id) => db.deleteHabit(id),
    reorder: (items) => db.reorderHabits(items),
    toggleLog: (habitId, date) => db.toggleHabitLog(habitId, date),
  },
  attachments: {
    uploadFile: (taskId, sourcePath) => db.uploadAttachment(taskId, sourcePath),
    uploadLink: (taskId, url, title) => db.uploadLinkAttachment(taskId, url, title),
    listForTask: (taskId) => db.getAttachments(taskId),
    delete: (id) => db.deleteAttachment(id),
    getFilePath: (id) => db.getAttachmentFilePath(id),
  },
  settings: {
    get: (key) => db.getSetting(key),
    set: (key, value) => db.setSetting(key, value),
    getAll: () => db.getAllSettings(),
    backupDatabase: (destination) => db.backupDatabase(destination),
    exportCsv: (path, content) => db.exportCsv(path, content),
    importDatabase: (source) => db.importDatabase(source),
    getDashboardStats: () => db.getDashboardStats(),
  },
  sync: {
    getMeta: (key) => db.getSyncMeta(key),
    setMeta: (key, value) => db.setSyncMeta(key, value),
    listMeta: () => db.listSyncMeta(),
    recordOperation: (input) => db.recordSyncOperation(input),
    listOperations: (status) => db.listSyncOperations(status),
    markOperationStatus: (opId, status, lastError) => db.markSyncOperationStatus(opId, status, lastError),
    incrementRetry: (opId, lastError) => db.incrementSyncOperationRetry(opId, lastError),
    saveConflict: (input) => db.saveSyncConflict(input),
    listConflicts: (entityType, entityId) => db.listSyncConflicts(entityType, entityId),
    resolveConflict: (id) => db.resolveSyncConflict(id),
    deriveEntityStatus: (entityType, entityId) => db.deriveSyncStatus(entityType, entityId),
  },
  platform: createPlatformRepository(),
};
