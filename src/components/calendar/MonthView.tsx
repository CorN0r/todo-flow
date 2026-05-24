import { cn } from '../../lib/cn';
import { useCalendarStore } from '../../stores/calendarStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { useUIStore } from '../../stores/uiStore';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isToday,
  format,
} from '../../lib/date';

export function MonthView() {
  const { currentDate } = useCalendarStore();
  const { eventsByDate } = useCalendarEvents(currentDate, 'month');
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);

  const monthStart = startOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(endOfMonth(currentDate));

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map((name) => (
          <div key={name} className="text-center text-xs text-muted-foreground py-1 font-medium">
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="border rounded-lg overflow-hidden">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
            {week.map((d, di) => {
              const dateKey = format(d, 'yyyy-MM-dd');
              const dayEvents = eventsByDate[dateKey] || [];
              const isCurrentMonth = d.getMonth() === currentDate.getMonth();
              const isTodayDate = isToday(d);

              return (
                <div
                  key={di}
                  className={cn(
                    'min-h-[80px] border-r last:border-r-0 p-1',
                    !isCurrentMonth && 'bg-muted/30'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div
                      className={cn(
                        'text-xs w-6 h-6 flex items-center justify-center rounded-full',
                        isTodayDate && 'bg-primary text-primary-foreground font-medium'
                      )}
                    >
                      {d.getDate()}
                    </div>
                    {dayEvents.length > 0 && (
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                        isTodayDate
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {dayEvents.length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <button
                        key={ev.task.id}
                        onClick={() => setSelectedTaskId(ev.task.id)}
                        className={cn(
                          'w-full text-left text-xs px-1 py-0.5 rounded truncate block transition-colors',
                          ev.task.is_completed
                            ? 'bg-muted text-muted-foreground line-through'
                            : 'bg-primary/10 text-primary hover:bg-primary/20'
                        )}
                      >
                        {ev.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-xs text-muted-foreground pl-1">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
