import { useState, useMemo, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Portal } from './Portal';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isToday, format, isSameDay } from '../../lib/date';

interface DatePickerProps {
  value: string;
  onChange: (val: string) => void;
  dateCounts?: Map<string, number>;
  showTime?: boolean;
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
  return { weeks, month: firstDay.getMonth(), year: firstDay.getFullYear() };
}

export function DatePicker({ value, onChange, dateCounts, showTime }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const today = new Date();
  const datePart = showTime && value ? value.slice(0, 10) : value;
  const timePart = showTime && value && value.includes('T') ? value.slice(11, 16) : '09:00';
  const [viewYear, setViewYear] = useState(
    value ? parseInt(value.split('-')[0]) : today.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(
    value ? parseInt(value.split('-')[1]) - 1 : today.getMonth()
  );

  const { weeks, month: calMonth } = getCalendarDays(viewYear, viewMonth);

  const selectedDate = value ? new Date(value + 'T00:00:00') : null;

  const maxCount = useMemo(() => {
    if (!dateCounts) return 0;
    let max = 0;
    dateCounts.forEach((c) => { if (c > max) max = c; });
    return max;
  }, [dateCounts]);

  const handleSelect = (d: Date) => {
    const dateStr = format(d, 'yyyy-MM-dd');
    onChange(showTime ? `${dateStr}T${timePart}` : dateStr);
    if (!showTime) setOpen(false);
  };

  const handleTimeChange = (time: string) => {
    const base = datePart || format(today, 'yyyy-MM-dd');
    onChange(`${base}T${time}`);
  };

  const displayValue = showTime && value ? value.replace('T', ' ') : value;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors border font-medium',
          value
            ? 'border-[#7C72F6] bg-[#7C72F6]/[0.06] text-[#7C72F6]'
            : 'border-[#E5E7EB] dark:border-white/[0.07] text-[#9CA3AF] hover:border-[#D1D5DB] hover:text-[#6B7280]',
        )}
      >
        <CalendarIcon size={14} />
        <span>{displayValue || (showTime ? '选择日期时间' : '选择日期')}</span>
        {value && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="hover:text-red-500 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </button>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-2xl shadow-xl p-3 min-w-[260px]"
            style={(() => {
              const rect = triggerRef.current?.getBoundingClientRect();
              if (!rect) return {};
              const spaceBelow = window.innerHeight - rect.bottom;
              const left = Math.max(4, Math.min(rect.left, window.innerWidth - 268));
              if (spaceBelow >= 380) {
                return { top: rect.bottom + 4, left };
              }
              return { bottom: window.innerHeight - rect.top + 4, left };
            })()}
          >
            {/* Month nav */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors" aria-label="上个月">
                <ChevronLeft size={14} className="text-[#6B7280]" />
              </button>
              <span className="text-[13px] font-semibold text-[#111827] dark:text-white/90">
                {monthNames[viewMonth]} {viewYear}
              </span>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors" aria-label="下个月">
                <ChevronRight size={14} className="text-[#6B7280]" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {dayNames.map((n) => (
                <div key={n} className="text-center text-[10px] text-[#9CA3AF] py-1 font-semibold uppercase tracking-wide">
                  {n}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div>
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7">
                  {week.map((d, di) => {
                    const dateKey = format(d, 'yyyy-MM-dd');
                    const count = dateCounts?.get(dateKey) ?? 0;
                    const isCurrentMonth = d.getMonth() === calMonth;
                    const isTodayDate = isToday(d);
                    const isSelected = selectedDate && isSameDay(d, selectedDate);

                    return (
                      <button
                        key={di}
                        onClick={() => handleSelect(d)}
                        disabled={!isCurrentMonth}
                        className={cn(
                          'w-8 h-8 text-xs rounded-full flex items-center justify-center relative transition-colors',
                          isCurrentMonth && 'hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] cursor-pointer text-[#111827] dark:text-white/90',
                          !isCurrentMonth && 'text-[#D1D5DB] dark:text-white/[0.15] cursor-default',
                          isTodayDate && !isSelected && 'font-bold text-[#7C72F6]',
                          isSelected && 'bg-[#7C72F6] text-white hover:bg-[#7C72F6]',
                        )}
                      >
                        {d.getDate()}
                        {count > 0 && !isSelected && (
                          <span
                            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                            style={{
                              backgroundColor: count > 2 ? '#EF4444' : '#7C72F6',
                              opacity: 0.2 + (count / Math.max(maxCount, 1)) * 0.8,
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Time picker */}
            {showTime && (
              <div className="mt-2 pt-2 border-t border-[#F3F4F6] dark:border-white/[0.06]">
                <input
                  type="time"
                  value={timePart}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="w-full text-sm px-2 py-1 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:border-[#7C72F6] text-center [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
            )}

            {/* Quick actions */}
            <div className={`${showTime ? 'mt-2 pt-2' : 'mt-2 pt-2'} border-t border-[#F3F4F6] dark:border-white/[0.06] flex gap-1`}>
              <button
                onClick={() => { onChange(showTime ? `${format(today, 'yyyy-MM-dd')}T${timePart}` : format(today, 'yyyy-MM-dd')); setOpen(false); }}
                className="text-[12px] px-2.5 py-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-[#6B7280] font-medium"
              >
                今天
              </button>
              <button
                onClick={() => { onChange(showTime ? `${format(addDays(today, 1), 'yyyy-MM-dd')}T${timePart}` : format(addDays(today, 1), 'yyyy-MM-dd')); setOpen(false); }}
                className="text-[12px] px-2.5 py-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-[#6B7280] font-medium"
              >
                明天
              </button>
              {value && (
                <button
                  onClick={() => { onChange(''); setOpen(false); }}
                  className="text-[12px] px-2.5 py-1.5 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-red-950/30 text-[#EF4444] transition-colors font-medium ml-auto"
                >
                  清除
                </button>
              )}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
