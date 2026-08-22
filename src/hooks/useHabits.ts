import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRepositories } from '../domain/repositories/current';
import type { CreateHabitInput, HabitWithStats } from '../types/habit';
import { queryKeys, invalidateHabits } from '../lib/queryKeys';

export function useHabits() {
  return useQuery({
    queryKey: queryKeys.habits.all,
    queryFn: () => getRepositories().habits.list(),
    staleTime: 30_000,
  });
}

export function useCreateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHabitInput) => getRepositories().habits.create(input),
    onSuccess: () => {
      invalidateHabits(queryClient);
      toast.success('习惯已创建');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; color?: string; frequency?: string; target_count?: number }) =>
      getRepositories().habits.update(id, input),
    onSuccess: () => {
      invalidateHabits(queryClient);
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useDeleteHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getRepositories().habits.delete(id),
    onSuccess: () => {
      invalidateHabits(queryClient);
      toast.success('习惯已删除');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useToggleHabitLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ habitId, date }: { habitId: string; date?: string }) => getRepositories().habits.toggleLog(habitId, date),
    onSuccess: () => {
      invalidateHabits(queryClient);
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useReorderHabits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: string; sort_order: number }[]) => getRepositories().habits.reorder(items),
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.habits.all });
      const previous = queryClient.getQueryData(queryKeys.habits.all);
      queryClient.setQueryData(queryKeys.habits.all, (old: HabitWithStats[] | undefined) => {
        if (!old) return old;
        const sorted = [...old].sort((a, b) => {
          const ai = items.find((i) => i.id === a.id)?.sort_order ?? a.sort_order;
          const bi = items.find((i) => i.id === b.id)?.sort_order ?? b.sort_order;
          return ai - bi;
        });
        return sorted;
      });
      return { previous };
    },
    onError: (_err, _items, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.habits.all, ctx.previous);
    },
    onSettled: () => invalidateHabits(queryClient),
  });
}
