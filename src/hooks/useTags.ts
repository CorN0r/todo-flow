import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTags, createTag, updateTag, deleteTag } from '../lib/db';
import { toast } from 'sonner';

const TAGS_KEY = ['tags'] as const;

export function useTags() {
  return useQuery({ queryKey: TAGS_KEY, queryFn: getTags, staleTime: 60_000 });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createTag(name, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_KEY });
      toast.success('Tag created');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, color }: { id: string; name?: string; color?: string }) =>
      updateTag(id, name, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_KEY });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_KEY });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Tag deleted');
    },
    onError: (err: string) => toast.error(err),
  });
}
