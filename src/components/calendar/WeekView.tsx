import { cn } from '../../lib/cn';
import { useCalendarStore } from '../../stores/calendarStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { useUIStore } from '../../stores/uiStore';
import { startOfWeek, addDays, isToday, format } from '../../lib/date';

export function WeekView() {
  const { currentDate } = useCalendarStore();
  const { eventsByDate } = useCalendarEvents(currentDate, 'week');
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);

  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const dateKey = format(d, 'yyyy-MM-dd');
          const dayEvents = eventsByDate[dateKey] || [];
          const isTodayDate = isToday(d);

          return (
            <div
              key={i}
              className={cn(
                'min-h-[200px] border-r last:border-r-0 p-2',
                isTodayDate && 'bg-primary/5'
              )}
            >
              <div className="text-center mb-2">
                <div className="text-xs text-muted-foreground">{format(d, 'EEE')}</div>
                <div className="flex items-center justify-center gap-1">
                  <div
                    className={cn(
                      'text-sm w-7 h-7 flex items-center justify-center rounded-full',
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
              </div>
              <div className="space-y-1">
                {dayEvents.map((ev) => (
                  <button
                    key={ev.task.id}
                    onClick={() => setSelectedTaskId(ev.task.id)}
                    className={cn(
                      'w-full text-left text-xs px-2 py-1 rounded block transition-colors',
                      ev.task.is_completed
                        ? 'bg-muted text-muted-foreground line-through'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    )}
                  >
                    {ev.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
