import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRepositories } from '../domain/repositories/current';
import { queryKeys, invalidateAttachments } from '../lib/queryKeys';

export function useAttachments(taskId: string | null) {
  return useQuery({
    queryKey: queryKeys.attachments.forTask(taskId),
    queryFn: () => getRepositories().attachments.listForTask(taskId!),
    enabled: !!taskId,
    staleTime: 30_000,
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, sourcePath, isLink, linkTitle }: { taskId: string; sourcePath: string; isLink?: boolean; linkTitle?: string }) =>
      isLink
        ? getRepositories().attachments.uploadLink(taskId, sourcePath, linkTitle)
        : getRepositories().attachments.uploadFile(taskId, sourcePath),
    onSuccess: (_, variables) => {
      invalidateAttachments(queryClient, variables.taskId);
      toast.success(variables.isLink ? 'Link added' : 'File attached');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getRepositories().attachments.delete(id),
    onSuccess: () => {
      invalidateAttachments(queryClient);
      toast.success('Attachment removed');
    },
    onError: (err: string) => toast.error(err),
  });
}
