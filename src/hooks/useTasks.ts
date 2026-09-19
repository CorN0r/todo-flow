import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRepositories } from '../domain/repositories/current';
import type { CreateTaskInput, ReorderItem, TaskFilters, UpdateTaskInput } from '../domain/models/task';
import { queryKeys, invalidateTasks, invalidateTask, invalidateTags, invalidateReminders } from '../lib/queryKeys';
import { todayISO } from '../lib/date';

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: () =>
      getRepositories().tasks.list({
        include_children: true,
        ...filters,
      }),
    staleTime: 30_000,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id),
    queryFn: () => getRepositories().tasks.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => getRepositories().tasks.create(input),
    onSuccess: () => {
      invalidateTasks(queryClient);
      toast.success('任务已创建');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTaskInput) => getRepositories().tasks.update(input),
    onSuccess: () => {
      invalidateTasks(queryClient);
      invalidateTask(queryClient);
      invalidateTags(queryClient);
    },
    onError: (err: string) => toast.error(err),
  });
}

// 加入/移出「我的一天」。加入时若任务没有截止日期则自动补今天:
// 「今天」页面按 due_date 过滤,不补的话任务只会进「我的一天」而不会出现在「今天」。
// 已有截止日期不覆盖;移出只清 my_day_date,不回退 due_date。
export function useToggleMyDay() {
  const updateTask = useUpdateTask();
  return (task: { id: string; due_date?: string | null }, add: boolean) => {
    if (add) {
      updateTask.mutate({
        id: task.id,
        my_day_date: todayISO(),
        due_date: task.due_date ? undefined : todayISO(),
      });
    } else {
      updateTask.mutate({ id: task.id, my_day_date: '' });
    }
  };
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getRepositories().tasks.delete(id),
    onSuccess: () => {
      invalidateTasks(queryClient);
      invalidateTags(queryClient);
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: ReorderItem[]) => getRepositories().tasks.reorder(items),
    onSuccess: () => invalidateTasks(queryClient),
  });
}

export function useDuplicateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getRepositories().tasks.duplicate(id),
    onSuccess: () => {
      invalidateTasks(queryClient);
      toast.success('任务已复制');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useTaskReminders(taskId: string | null) {
  return useQuery({
    queryKey: queryKeys.reminders.forTask(taskId),
    queryFn: () => getRepositories().reminders.listForTask(taskId!),
    enabled: !!taskId,
    staleTime: 30_000,
  });
}

export function useCreateTaskReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, offset, dueDate }: { taskId: string; offset: string; dueDate?: string }) =>
      getRepositories().reminders.create({ taskId, offset, dueDate }),
    onSuccess: () => {
      invalidateReminders(queryClient);
      invalidateTasks(queryClient);
      toast.success('提醒已添加');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useDeleteTaskReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getRepositories().reminders.delete(id),
    onSuccess: () => {
      invalidateReminders(queryClient);
      invalidateTasks(queryClient);
      toast.success('提醒已删除');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useClearTaskReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => getRepositories().reminders.clearForTask(taskId),
    onSuccess: () => {
      invalidateReminders(queryClient);
      invalidateTasks(queryClient);
    },
    onError: (err: string) => toast.error(err),
  });
}
