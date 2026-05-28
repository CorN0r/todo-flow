import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createHabit, getHabits, updateHabit, deleteHabit, reorderHabits, toggleHabitLog,
} from '../lib/db';
import type { CreateHabitInput, HabitWithStats } from '../types/habit';

const HABITS_KEY = ['habits'] as const;

export function useHabits() {
  return useQuery({
    queryKey: HABITS_KEY,
    queryFn: getHabits,
    staleTime: 30_000,
  });
}

export function useCreateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHabitInput) => createHabit(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
      toast.success('习惯已创建');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; color?: string; frequency?: string; target_count?: number }) =>
      updateHabit(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useDeleteHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHabit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
      toast.success('习惯已删除');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useToggleHabitLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ habitId, date }: { habitId: string; date?: string }) => toggleHabitLog(habitId, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useReorderHabits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: string; sort_order: number }[]) => reorderHabits(items),
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY });
      const previous = queryClient.getQueryData(HABITS_KEY);
      queryClient.setQueryData(HABITS_KEY, (old: HabitWithStats[] | undefined) => {
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
      if (ctx?.previous) queryClient.setQueryData(HABITS_KEY, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: HABITS_KEY }),
  });
}
