import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createTask,
  getTask,
  getTasks,
  updateTask,
  deleteTask,
  reorderTasks,
  duplicateTask,
} from '../lib/db';
import type { CreateTaskInput, UpdateTaskInput, ReorderItem } from '../types/task';

const TASKS_KEY = ['tasks'] as const;

export function useTasks(filters?: Parameters<typeof getTasks>[0]) {
  return useQuery({
    queryKey: [...TASKS_KEY, filters],
    queryFn: () => getTasks(filters),
    staleTime: 30_000,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => getTask(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      toast.success('Task created');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTaskInput) => updateTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      queryClient.invalidateQueries({ queryKey: ['task'] });
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      queryClient.invalidateQueries({ queryKey: ['task', id] });
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: ReorderItem[]) => reorderTasks(items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useDuplicateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      toast.success('Task duplicated');
    },
    onError: (err: string) => toast.error(err),
  });
}
