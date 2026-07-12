import { Check, Flag, Pencil, Sun, Trash2 } from 'lucide-react';
import { useDeleteTask, useUpdateTask } from '../../hooks/useTasks';
import type { Task } from '../../domain/models/task';
import { MobileBottomSheet } from './MobilePrimitives';

const T = {
  title: '\u4efb\u52a1\u64cd\u4f5c',
  openDetail: '\u6253\u5f00\u8be6\u60c5',
  complete: '\u5b8c\u6210\u4efb\u52a1',
  reopen: '\u91cd\u65b0\u6253\u5f00',
  addMyDay: '\u52a0\u5165\u6211\u7684\u4e00\u5929',
  removeMyDay: '\u79fb\u51fa\u6211\u7684\u4e00\u5929',
  markHigh: '\u8bbe\u4e3a\u9ad8\u4f18\u5148\u7ea7',
  deleteTask: '\u5220\u9664\u4efb\u52a1',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ActionButton({
  danger = false,
  icon: Icon,
  label,
  onClick,
}: {
  danger?: boolean;
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-[var(--mobile-radius-md)] px-3 text-left text-[var(--mobile-font-body)] font-medium leading-6 ${
        danger
          ? 'text-[var(--mobile-color-danger)]'
          : 'text-[var(--mobile-color-text)] hover:bg-[var(--mobile-color-primary-container)]'
      }`}
    >
      <Icon aria-hidden className="h-5 w-5 shrink-0" />
      <span className="min-w-0 break-words">{label}</span>
    </button>
  );
}

export function MobileTaskActionSheet({
  task,
  open,
  onClose,
  onOpenDetail,
}: {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onOpenDetail: (taskId: string) => void;
}) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const runAndClose = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <MobileBottomSheet title={T.title} open={open && !!task} onClose={onClose}>
      {task && (
        <div className="space-y-1 pb-2" data-motion="mobile-action-sheet">
          <p className="mb-2 break-words text-[var(--mobile-font-caption)] font-medium leading-5 text-[var(--mobile-color-text-muted)]">
            {task.title}
          </p>
          <ActionButton icon={Pencil} label={T.openDetail} onClick={() => runAndClose(() => onOpenDetail(task.id))} />
          <ActionButton
            icon={Check}
            label={task.is_completed ? T.reopen : T.complete}
            onClick={() => runAndClose(() => updateTask.mutate({ id: task.id, is_completed: !task.is_completed }))}
          />
          <ActionButton
            icon={Sun}
            label={task.my_day_date ? T.removeMyDay : T.addMyDay}
            onClick={() => runAndClose(() => updateTask.mutate({ id: task.id, my_day_date: task.my_day_date ? null : todayISO() }))}
          />
          <ActionButton
            icon={Flag}
            label={T.markHigh}
            onClick={() => runAndClose(() => updateTask.mutate({ id: task.id, priority: 3 }))}
          />
          <ActionButton
            danger
            icon={Trash2}
            label={T.deleteTask}
            onClick={() => runAndClose(() => deleteTask.mutate(task.id))}
          />
        </div>
      )}
    </MobileBottomSheet>
  );
}
