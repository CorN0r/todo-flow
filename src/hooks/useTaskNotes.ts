import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { closeTaskNote, getAllTaskNotes, openTaskNote } from '../lib/db';

const TASK_NOTES_KEY = ['task-notes'] as const;

export function useTaskNotes() {
  return useQuery({
    queryKey: TASK_NOTES_KEY,
    queryFn: getAllTaskNotes,
    staleTime: 30_000,
  });
}

export function useToggleTaskNote() {
  const queryClient = useQueryClient();

  return async (taskId: string, pinned: boolean) => {
    try {
      if (pinned) {
        await closeTaskNote(taskId);
        toast.success('已取消固定');
      } else {
        await openTaskNote(taskId);
        toast.success('已固定到桌面');
      }
      queryClient.invalidateQueries({ queryKey: TASK_NOTES_KEY });
    } catch (e) {
      // 后端错误(如便签数量已达上限)序列化为中文字符串,直接透出
      toast.error(String(e));
    }
  };
}
