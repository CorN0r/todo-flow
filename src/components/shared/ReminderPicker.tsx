// DEPRECATED: Reminder functionality has been merged into DatePicker (showReminder prop).
// This component is no longer imported and may be removed in a future release.

import { useState, useRef } from 'react';
import { Bell, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Portal } from './Portal';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isToday, format, isSameDay } from '../../lib/date';

interface ReminderPickerProps {
  value: string;
  onChange: (val: string) => void;
  startOpen?: boolean;
}

function getCalendarDays(year: number, month: number) {
  const firstDay = startOfMonth(new Date(year, month, 1));
  const lastDay = endOfMonth(new Date(year, month, 1));
  const calStart = startOfWeek(firstDay);
  const calEnd = endOfWeek(lastDay);
  const weeks: Date[][] = [];
  let day = calStart;
  while (day <= calEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return { weeks, month: firstDay.getMonth() };
}

export function ReminderPicker({ value, onChange, startOpen }: ReminderPickerProps) {
  const [open, setOpen] = useState(startOpen ?? false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const today = new Date();

  const dateStr = value ? value.slice(0, 10) : format(today, 'yyyy-MM-dd');
  const timeStr = value && value.includes('T') ? value.slice(11, 16) : '09:00';

  const [viewYear, setViewYear] = useState(parseInt(dateStr.split('-')[0]));
  const [viewMonth, setViewMonth] = useState(parseInt(dateStr.split('-')[1]) - 1);
  const [selectedDate, setSelectedDate] = useState(dateStr);
  const [selectedTime, setSelectedTime] = useState(timeStr);

  const { weeks, month: calMonth } = getCalendarDays(viewYear, viewMonth);
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

  const openPicker = () => {
    const d = value ? value.slice(0, 10) : format(today, 'yyyy-MM-dd');
    const t = value && value.includes('T') ? value.slice(11, 16) : '09:00';
    setSelectedDate(d);
    setSelectedTime(t);
    setViewYear(parseInt(d.split('-')[0]));
    setViewMonth(parseInt(d.split('-')[1]) - 1);
    setOpen(true);
  };

  const rect = triggerRef.current?.getBoundingClientRect();
  const popupHeight = 380;
  const popupTop = rect ? rect.bottom + 4 : 0;
  const flipUp = popupTop + popupHeight > window.innerHeight;
  const top = flipUp ? (rect?.top ?? 0) - popupHeight - 4 : popupTop;
  const left = Math.min(rect?.left ?? 0, window.innerWidth - 316);

  const confirm = () => {
    onChange(`${selectedDate}T${selectedTime}`);
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const displayValue = value ? value.replace('T', ' ') : '';

  return (
    <>
      <button
        ref={triggerRef}
        onClick={openPicker}
        className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors border font-medium',
          value
            ? 'border-[#7C72F6] bg-[#7C72F6]/[0.06] text-[#7C72F6]'
            : 'border-[#E5E7EB] dark:border-white/[0.07] text-[#9CA3AF] hover:border-[#D1D5DB] hover:text-[#6B7280]',
        )}
      >
        <Bell size={14} />
        <span>{displayValue || '设置提醒'}</span>
        {value && (
          <X size={12} className="hover:text-red-500" onClick={(e) => { e.stopPropagation(); onChange(''); }} />
        )}
      </button>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-2xl shadow-xl p-4 w-[300px]"
            style={{ top, left }}
          >
            {/* Month nav */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]">
                <ChevronLeft size={14} className="text-[#6B7280]" />
              </button>
              <span className="text-[13px] font-semibold text-[#111827] dark:text-white/90">
                {viewYear}年{viewMonth + 1}月
              </span>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]">
                <ChevronRight size={14} className="text-[#6B7280]" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {dayNames.map((n) => (
                <div key={n} className="text-center text-[10px] text-[#9CA3AF] py-1 font-medium">{n}</div>
              ))}
            </div>

            {/* Calendar */}
            <div className="mb-3">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7">
                  {week.map((d, di) => {
                    const isCurrentMonth = d.getMonth() === calMonth;
                    const isTodayDate = isToday(d);
                    const isSelected = isSameDay(d, new Date(selectedDate + 'T00:00:00'));
                    return (
                      <button
                        key={di}
                        disabled={!isCurrentMonth}
                        onClick={() => { if (isCurrentMonth) setSelectedDate(format(d, 'yyyy-MM-dd')); }}
                        className={cn(
                          'w-9 h-9 text-xs rounded-full flex items-center justify-center transition-colors',
                          isCurrentMonth && 'hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] text-[#111827] dark:text-white/90',
                          !isCurrentMonth && 'text-[#D1D5DB] dark:text-white/[0.12]',
                          isTodayDate && !isSelected && 'font-bold text-[#7C72F6]',
                          isSelected && 'bg-[#7C72F6] text-white font-medium hover:bg-[#6C63E6]',
                        )}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Time + Actions */}
            <div className="border-t border-[#F3F4F6] dark:border-white/[0.06] pt-3 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#6B7280] shrink-0">时间</span>
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="text-[13px] px-2 py-1 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] outline-none focus:border-[#7C72F6] text-center [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              <div className="flex-1" />
              <button
                onClick={confirm}
                className="px-4 py-1.5 rounded-lg bg-[#7C72F6] text-white text-[12px] font-medium hover:bg-[#6C63E6] transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
