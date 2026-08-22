import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRepositories } from '../domain/repositories/current';
import { queryKeys, invalidateTaskNotes } from '../lib/queryKeys';

export function useTaskNotes() {
  return useQuery({
    queryKey: queryKeys.taskNotes.all,
    queryFn: () => getRepositories().taskNotes.list(),
    staleTime: 30_000,
  });
}

export function useToggleTaskNote() {
  const queryClient = useQueryClient();

  return async (taskId: string, pinned: boolean) => {
    try {
      if (pinned) {
        await getRepositories().taskNotes.close(taskId);
        toast.success('已取消固定');
      } else {
        await getRepositories().taskNotes.open(taskId);
        toast.success('已固定到桌面');
      }
      invalidateTaskNotes(queryClient);
    } catch (e) {
      // 后端错误(如便签数量已达上限)序列化为中文字符串,直接透出
      toast.error(String(e));
    }
  };
}
