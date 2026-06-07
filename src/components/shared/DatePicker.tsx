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
  startOpen?: boolean;
  iconOnly?: boolean | 'label';
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

export function DatePicker({ value, onChange, dateCounts, showTime, startOpen, iconOnly }: DatePickerProps) {
  const [open, setOpen] = useState(startOpen ?? false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const today = new Date();
  const datePart = value ? value.slice(0, 10) : value;
  const timePart = value.length > 10 ? value.slice(11, 16) : '09:00';
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
    onChange(showTime ? `${dateStr} ${timePart}` : dateStr);
    if (!showTime) setOpen(false);
  };

  const handleTimeChange = (time: string) => {
    const base = datePart || format(today, 'yyyy-MM-dd');
    onChange(`${base} ${time}`);
  };

  const displayValue = value.length > 10 ? value : value;

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

  const compactLabel = value ? format(new Date(value.replace(' ', 'T')), 'M月d日') + (value.length > 10 ? ' ' + value.slice(11, 16) : '') : '';

  return (
    <div className="relative inline-block">
      {iconOnly && value ? (
        <span
          ref={triggerRef as any}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium bg-[#7C72F6]/[0.10] text-[#7C72F6] cursor-pointer transition-colors hover:opacity-80"
        >
          <CalendarIcon size={12} />
          <span className="truncate max-w-[90px]">{compactLabel}</span>
          <span role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(''); } }}
            className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
            <X size={12} />
          </span>
        </span>
      ) : iconOnly === 'label' ? (
        <button
          ref={triggerRef}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] transition-colors"
        >
          <CalendarIcon size={12} />截止日期
        </button>
      ) : (
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={cn(
          iconOnly
            ? 'flex items-center justify-center shrink-0 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1] transition-colors'
            : cn('flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors border font-medium',
              value ? 'border-[#7C72F6] bg-[#7C72F6]/[0.06] text-[#7C72F6]' : 'border-[#E5E7EB] dark:border-white/[0.07] text-[#9CA3AF] hover:border-[#D1D5DB] hover:text-[#6B7280]'),
        )}
        style={iconOnly ? { width: '28px', height: '28px' } : undefined}
        title={iconOnly ? (displayValue || '选择日期') : undefined}
      >
        <CalendarIcon size={iconOnly ? 13 : 14} />
        {!iconOnly && <span>{displayValue || (showTime ? '选择日期时间' : '选择日期')}</span>}
        {!iconOnly && value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(''); } }}
            className="hover:text-red-500 transition-colors cursor-pointer"
          >
            <X size={12} />
          </span>
        )}
      </button>
      )}

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

            {/* Time presets */}
            {showTime && (
              <div className="mt-2 pt-2 border-t border-[#F3F4F6] dark:border-white/[0.06]">
                <div className="text-[10px] text-[#9CA3AF] font-semibold tracking-wide mb-2">时间</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {[
                    { label: '上午 9:00', time: '09:00' },
                    { label: '下午 2:00', time: '14:00' },
                    { label: '傍晚 5:30', time: '17:30' },
                  ].map((preset) => (
                    <button
                      key={preset.time}
                      onClick={() => handleTimeChange(preset.time)}
                      className={cn(
                        'text-[11px] px-2 py-1 rounded-lg transition-colors font-medium',
                        timePart === preset.time ? 'bg-[#7C72F6] text-white' : 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1]',
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
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
                onClick={() => { const d = format(today, 'yyyy-MM-dd'); onChange(showTime ? `${d} ${timePart}` : d); setOpen(false); }}
                className="text-[12px] px-2.5 py-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-[#6B7280] font-medium"
              >
                今天
              </button>
              <button
                onClick={() => { const tomorrow = format(addDays(today, 1), 'yyyy-MM-dd'); onChange(showTime ? `${tomorrow} ${timePart}` : tomorrow); setOpen(false); }}
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
