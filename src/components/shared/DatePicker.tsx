import { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isToday, format, isSameDay } from '../../lib/date';

interface DatePickerProps {
  value: string;
  onChange: (val: string) => void;
  dateCounts?: Map<string, number>;
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

export function DatePicker({ value, onChange, dateCounts }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
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
    onChange(format(d, 'yyyy-MM-dd'));
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

  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-2 py-1 rounded-md text-sm transition-colors border',
          value
            ? 'border-primary bg-muted text-foreground'
            : 'border-border text-muted-foreground hover:border-border',
        )}
      >
        <CalendarIcon size={14} />
        <span>{value || 'Pick a date'}</span>
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
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-background border rounded-xl shadow-xl p-3 min-w-[260px]">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="p-1 rounded hover:bg-accent">
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm font-medium">
                {monthNames[viewMonth]} {viewYear}
              </span>
              <button onClick={nextMonth} className="p-1 rounded hover:bg-accent">
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {dayNames.map((n) => (
                <div key={n} className="text-center text-[10px] text-muted-foreground py-1 font-medium">
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
                          isCurrentMonth && 'hover:bg-accent cursor-pointer',
                          !isCurrentMonth && 'text-muted-foreground cursor-default',
                          isTodayDate && 'font-bold text-primary',
                          isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
                        )}
                      >
                        {d.getDate()}
                        {count > 0 && !isSelected && (
                          <span
                            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                            style={{
                              backgroundColor: count > 2 ? '#ef4444' : count > 0 ? '#6366f1' : undefined,
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

            {/* Quick actions */}
            <div className="mt-2 pt-2 border-t flex gap-1">
              <button
                onClick={() => { onChange(format(today, 'yyyy-MM-dd')); setOpen(false); }}
                className="text-xs px-2 py-1 rounded-md hover:bg-accent transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => { onChange(format(addDays(today, 1), 'yyyy-MM-dd')); setOpen(false); }}
                className="text-xs px-2 py-1 rounded-md hover:bg-accent transition-colors"
              >
                Tomorrow
              </button>
              {value && (
                <button
                  onClick={() => { onChange(''); setOpen(false); }}
                  className="text-xs px-2 py-1 rounded-md hover:bg-red-50 text-red-500 transition-colors ml-auto"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
