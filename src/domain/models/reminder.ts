export type { TaskReminder } from '../../types/task';

export interface CreateTaskReminderInput {
  taskId: string;
  offset: string;
  dueDate?: string;
}
