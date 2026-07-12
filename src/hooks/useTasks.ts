import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRepositories } from '../domain/repositories/current';
import type { CreateTaskInput, ReorderItem, TaskFilters, UpdateTaskInput } from '../domain/models/task';

const TASKS_KEY = ['tasks'] as const;

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: [...TASKS_KEY, filters],
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
    queryKey: ['task', id],
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
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' });
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
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'task' });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getRepositories().tasks.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: ReorderItem[]) => getRepositories().tasks.reorder(items),
    onSuccess: () => queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' }),
  });
}

export function useDuplicateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getRepositories().tasks.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' });
      toast.success('任务已复制');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useTaskReminders(taskId: string | null) {
  return useQuery({
    queryKey: ['task-reminders', taskId],
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
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'task-reminders' });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' });
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
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'task-reminders' });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' });
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
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'task-reminders' });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' });
    },
    onError: (err: string) => toast.error(err),
  });
}
