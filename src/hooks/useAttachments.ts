import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getAttachments, uploadAttachment, deleteAttachment } from '../lib/db';

export function useAttachments(taskId: string | null) {
  return useQuery({
    queryKey: ['attachments', taskId],
    queryFn: () => getAttachments(taskId!),
    enabled: !!taskId,
    staleTime: 30_000,
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, sourcePath }: { taskId: string; sourcePath: string }) =>
      uploadAttachment(taskId, sourcePath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['attachments', variables.taskId] });
      toast.success('Image attached');
    },
    onError: (err: string) => toast.error(err),
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments'] });
      toast.success('Attachment removed');
    },
    onError: (err: string) => toast.error(err),
  });
}
