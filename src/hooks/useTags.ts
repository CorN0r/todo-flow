import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createTag, getTags, updateTag, deleteTag, reorderTags } from '../lib/db';
import type { CreateTagInput, Tag } from '../types/tag';

const TAGS_KEY = ['tags'] as const;

export function useTags() {
  return useQuery({
    queryKey: TAGS_KEY,
    queryFn: getTags,
    staleTime: 30_000,
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) => createTag(input),
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
    mutationFn: ({ id, ...input }: { id: string; name?: string; color?: string }) =>
      updateTag(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_KEY });
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
      toast.success('Tag deleted');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useReorderTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: string; sort_order: number }[]) => reorderTags(items),
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: TAGS_KEY });
      const previous = queryClient.getQueryData(TAGS_KEY);
      queryClient.setQueryData(TAGS_KEY, (old: Tag[] | undefined) => {
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
      if (ctx?.previous) queryClient.setQueryData(TAGS_KEY, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TAGS_KEY }),
  });
}
