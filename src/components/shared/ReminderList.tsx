import { useState, useRef } from 'react';
import { Bell, Plus, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useTaskReminders, useCreateTaskReminder, useDeleteTaskReminder } from '../../hooks/useTasks';
import { getReminderPresets, getReminderLabel } from '../../lib/date';
import { Portal } from './Portal';

interface ReminderListProps {
  taskId: string;
  dueDate: string;
}

export function ReminderList({ taskId, dueDate }: ReminderListProps) {
  const { data: reminders } = useTaskReminders(taskId);
  const createReminder = useCreateTaskReminder();
  const deleteReminder = useDeleteTaskReminder();

  const [showMenu, setShowMenu] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('09:00');
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const existing = reminders || [];
  const usedOffsets = new Set(existing.map((r) => r.offset));
  const availablePresets = Object.entries(getReminderPresets()).filter(([key]) => !usedOffsets.has(key));

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Bell size={13} className="text-[#7C72F6]" />
        <span className="text-[11px] font-semibold text-[#6B7280] tracking-wide">提醒</span>
      </div>
      {existing.length > 0 && (
        <div className="space-y-1 mb-1">
          {existing.map((r) => (
          <div key={r.id}
            className="flex items-center gap-2 text-[12px] px-2.5 py-1.5 rounded-lg bg-[#F3F4F6] dark:bg-white/[0.04] border border-[#F3F4F6] dark:border-white/[0.04]">
            <span className={cn('font-medium', r.reminded ? 'text-[#9CA3AF]' : 'text-[#7C72F6]')}>
              {getReminderLabel(r.offset)}
            </span>
            <span className="flex-1 text-[#9CA3AF] text-[11px]">{r.reminder_time}</span>
            {r.reminded && <span className="text-[10px] text-[#9CA3AF]">已触发</span>}
            <button onClick={() => deleteReminder.mutate(r.id)}
              className="shrink-0 p-0.5 rounded hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] text-[#9CA3AF] hover:text-[#EF4444] transition-colors">
              <X size={12} />
            </button>
          </div>
        ))}
        </div>
      )}
      <div className="relative inline-block">
        <button ref={addBtnRef} onClick={() => setShowMenu(!showMenu)}
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md font-medium text-[#6B7280] hover:text-[#111827] dark:hover:text-white/90 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] border border-dashed border-[#D1D5DB] dark:border-white/[0.15] transition-colors">
          <Plus size={10} />添加
        </button>
        {showMenu && (
          <Portal>
            <div className="fixed inset-0 z-40" onClick={() => { setShowMenu(false); setShowCustom(false); }} />
            <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[180px]"
              style={{ top: (addBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: addBtnRef.current?.getBoundingClientRect().left ?? 0 }}>
              {availablePresets.map(([key, { label }]) => (
                <button key={key} onClick={() => {
                  createReminder.mutate({ taskId, offset: key, dueDate });
                  setShowMenu(false);
                }}
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] text-[#111827] dark:text-white/90 transition-colors">
                  {label}
                </button>
              ))}
              <button onClick={() => setShowCustom(!showCustom)}
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] text-[#6B7280] transition-colors">
                自定义...
              </button>
              {showCustom && (
                <div className="px-3 py-2 flex flex-col gap-1.5 border-t border-[#F3F4F6] dark:border-white/[0.06] mt-1 pt-1">
                  <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full text-[12px] px-2 py-1 rounded border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] outline-none text-[#111827] dark:text-white/90 [color-scheme:light] dark:[color-scheme:dark]" />
                  <div className="flex items-center gap-1.5">
                    <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)}
                      className="text-[12px] px-2 py-1 rounded border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] outline-none text-[#111827] dark:text-white/90 [color-scheme:light] dark:[color-scheme:dark] flex-1" />
                    <button onClick={() => {
                      if (customDate && customTime) {
                        const abs = `${customDate} ${customTime}`;
                        createReminder.mutate({ taskId, offset: `custom:${abs}`, dueDate });
                        setShowMenu(false);
                        setShowCustom(false);
                      }
                    }}
                      className="shrink-0 px-3 py-1 rounded bg-[#7C72F6] text-white text-[11px] font-medium hover:bg-[#6C63E6]">
                      添加
                    </button>
                </div>
                </div>
              )}
            </div>
          </Portal>
        )}
      </div>
    </div>
  );
}
