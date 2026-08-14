import { useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useTaskReminders } from '../../hooks/useTasks';
import { ReminderList } from '../shared/ReminderList';
import { Portal } from '../shared/Portal';
import type { Task } from '../../types/task';

/** 子任务提醒按钮:铃铛图标 + popover 内嵌 ReminderList。仅当子任务有截止日期时渲染。 */
export function SubtaskReminderButton({ child }: { child: Task }) {
  const { data: reminders } = useTaskReminders(child.id);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasReminder = (reminders?.length ?? 0) > 0;

  if (!child.due_date) return null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={cn(
          'shrink-0 p-1 rounded transition-colors',
          hasReminder
            ? 'text-[#7C72F6] hover:bg-[#7C72F6]/[0.08]'
            : 'text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]',
        )}
        title="管理提醒"
      >
        <Bell size={12} />
      </button>
      {open && (
        <Portal>
          <div className="fixed inset-0 z-[260]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="fixed z-[270] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl p-3 min-w-[240px]"
            style={(() => {
              const rect = btnRef.current?.getBoundingClientRect();
              if (!rect) return {};
              const spaceBelow = window.innerHeight - rect.bottom;
              const left = Math.max(4, Math.min(rect.left, window.innerWidth - 248));
              if (spaceBelow >= 300) return { top: rect.bottom + 4, left };
              return { bottom: window.innerHeight - rect.top + 4, left };
            })()}
          >
            <ReminderList taskId={child.id} dueDate={child.due_date} />
          </div>
        </Portal>
      )}
    </>
  );
}
