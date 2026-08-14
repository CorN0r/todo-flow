import { cn } from '../../lib/cn';
import { isOverdue } from '../../lib/date';
import { useUpdateTask } from '../../hooks/useTasks';
import { DatePicker } from '../shared/DatePicker';
import type { Task } from '../../types/task';

/** 子任务截止日期:父任务同款「小图标 + 文本」只读样式,点击弹日历编辑。无日期时显示低调灰色小图标入口。 */
export function SubtaskDateChip({ child }: { child: Task }) {
  const updateTask = useUpdateTask();
  const overdue = child.due_date ? isOverdue(child.due_date) : false;

  return (
    <DatePicker
      value={child.due_date || ''}
      onChange={(v) => updateTask.mutate({ id: child.id, due_date: v })}
      showTime
      compact={!!child.due_date}
      iconOnly={child.due_date ? undefined : true}
      triggerClassName={child.due_date ? cn(
        '!gap-1 !px-0 !py-0 !border-0 !bg-transparent !rounded-none text-[12px] !font-normal shrink-0 cursor-pointer transition-colors',
        overdue ? '!text-red-500' : '!text-[#9CA3AF] hover:!text-[#6B7280] dark:hover:!text-white/80',
      ) : undefined}
    />
  );
}
