import type { QueryClient } from '@tanstack/react-query';
import type { TaskFilters } from '../domain/models/task';

/**
 * 集中管理 TanStack Query 键。
 * 所有键必须是 readonly tuple，以便类型安全地传递给 invalidateQueries。
 */
export const queryKeys = {
  tasks: {
    all: ['tasks'] as const,
    list: (filters?: TaskFilters) =>
      filters ? (['tasks', filters] as const) : (['tasks'] as const),
    detail: (id: string | null) =>
      id ? (['task', id] as const) : (['task'] as const),
  },
  tags: {
    all: ['tags'] as const,
  },
  habits: {
    all: ['habits'] as const,
  },
  attachments: {
    all: ['attachments'] as const,
    forTask: (taskId: string | null) =>
      taskId ? (['attachments', taskId] as const) : (['attachments'] as const),
  },
  reminders: {
    all: ['task-reminders'] as const,
    forTask: (taskId: string | null) =>
      taskId ? (['task-reminders', taskId] as const) : (['task-reminders'] as const),
  },
  taskNotes: {
    all: ['task-notes'] as const,
    detail: (taskId: string | null) =>
      taskId ? (['task-note', taskId] as const) : (['task-note'] as const),
  },
  dashboardStats: {
    all: ['dashboard-stats'] as const,
  },
  myDayPlan: {
    all: ['my-day-plan'] as const,
    detail: (date: string | null) =>
      date ? (['my-day-plan', date] as const) : (['my-day-plan'] as const),
  },
} as const;

/** 失效所有任务列表与详情缓存 */
export function invalidateTasks(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
}

/** 失效单个任务详情缓存；不传 id 时失效所有任务详情 */
export function invalidateTask(queryClient: QueryClient, id?: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(id ?? null) });
}

/** 失效标签列表缓存 */
export function invalidateTags(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
}

/** 失效习惯列表缓存 */
export function invalidateHabits(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
}

/** 失效所有附件或指定任务附件缓存 */
export function invalidateAttachments(queryClient: QueryClient, taskId?: string | null) {
  queryClient.invalidateQueries({ queryKey: queryKeys.attachments.forTask(taskId ?? null) });
}

/** 失效所有提醒或指定任务提醒缓存 */
export function invalidateReminders(queryClient: QueryClient, taskId?: string | null) {
  queryClient.invalidateQueries({ queryKey: queryKeys.reminders.forTask(taskId ?? null) });
}

/** 失效所有桌面便签或指定便签缓存 */
export function invalidateTaskNotes(queryClient: QueryClient, taskId?: string | null) {
  queryClient.invalidateQueries({ queryKey: queryKeys.taskNotes.detail(taskId ?? null) });
}

/** 失效仪表盘统计缓存 */
export function invalidateDashboardStats(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats.all });
}

/** 失效当日 AI 今日重点计划缓存;不传日期时失效全部 */
export function invalidateMyDayPlan(queryClient: QueryClient, date?: string | null) {
  queryClient.invalidateQueries({ queryKey: queryKeys.myDayPlan.detail(date ?? null) });
}
