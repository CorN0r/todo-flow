import { cn } from '../../lib/cn';
import { useCalendarStore } from '../../stores/calendarStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { useUIStore } from '../../stores/uiStore';
import { isToday, format } from '../../lib/date';

export function DayView() {
  const { currentDate } = useCalendarStore();
  const { eventsByDate } = useCalendarEvents(currentDate, 'day');
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);

  const dateKey = format(currentDate, 'yyyy-MM-dd');
  const dayEvents = eventsByDate[dateKey] || [];
  const isTodayDate = isToday(currentDate);

  return (
    <div>
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2">
          <div className={cn(
            'text-sm inline-flex items-center justify-center px-3 py-1 rounded-full',
            isTodayDate && 'bg-primary text-primary-foreground'
          )}>
            {format(currentDate, 'EEEE, MMMM d, yyyy')}
          </div>
          {dayEvents.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">
              {dayEvents.length} task{dayEvents.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Time slots */}
      <div className="space-y-1 max-w-lg mx-auto">
        {dayEvents.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            No tasks scheduled for this day.
          </p>
        )}
        {dayEvents.map((ev) => (
          <button
            key={ev.task.id}
            onClick={() => setSelectedTaskId(ev.task.id)}
            className={cn(
              'w-full text-left p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors',
              ev.task.is_completed && 'opacity-60'
            )}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={ev.task.is_completed}
                className="rounded"
                readOnly
              />
              <span className={cn(
                'text-sm',
                ev.task.is_completed && 'line-through text-muted-foreground'
              )}>
                {ev.title}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
