import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createList, getLists, updateList, deleteList } from '../lib/db';
import type { CreateListInput } from '../types/list';

const LISTS_KEY = ['lists'] as const;

export function useLists() {
  return useQuery({
    queryKey: LISTS_KEY,
    queryFn: getLists,
    staleTime: 30_000,
  });
}

export function useCreateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateListInput) => createList(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LISTS_KEY });
      toast.success('List created');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useUpdateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; color?: string; icon?: string }) =>
      updateList(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LISTS_KEY });
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useDeleteList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LISTS_KEY });
      toast.success('List deleted');
    },
    onError: (err: string) => toast.error(err),
  });
}
