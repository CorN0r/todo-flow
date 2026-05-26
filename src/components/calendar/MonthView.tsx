import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { useCalendarStore } from '../../stores/calendarStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { useUIStore } from '../../stores/uiStore';
import { useUpdateTask } from '../../hooks/useTasks';
import { useLists } from '../../hooks/useLists';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isToday,
  format,
} from '../../lib/date';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

function DraggableTask({ ev, dateKey, listColor }: {
  ev: ReturnType<typeof useCalendarEvents>['eventsByDate'][string][0];
  dateKey: string;
  listColor?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${ev.task.id}`,
    data: { taskId: ev.task.id, fromDate: dateKey },
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const color = listColor || '#6366f1';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && 'opacity-40')}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedTaskId(ev.task.id);
        }}
        className="w-full text-left text-xs px-1 py-0.5 rounded truncate block transition-colors cursor-grab active:cursor-grabbing"
        style={ev.task.is_completed ? {} : {
          backgroundColor: color,
          color: '#ffffff',
        }}
      >
        <span className={cn(ev.task.is_completed && 'bg-muted text-muted-foreground line-through rounded px-0.5')}>
          {ev.title}
        </span>
      </button>
    </div>
  );
}

function DroppableDay({ dateKey, isCurrentMonth, children }: {
  dateKey: string; isCurrentMonth: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `date-${dateKey}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[80px] border-r last:border-r-0 p-1 cursor-pointer hover:bg-muted transition-colors',
        !isCurrentMonth && 'bg-muted',
        isOver && 'bg-accent ring-2 ring-primary',
      )}
    >
      {children}
    </div>
  );
}

export function MonthView() {
  const navigate = useNavigate();
  const { currentDate, setCurrentDate, setViewMode } = useCalendarStore();
  const { eventsByDate } = useCalendarEvents(currentDate, 'month');
  const updateTask = useUpdateTask();
  const { data: lists } = useLists();
  const [activeDrag, setActiveDrag] = useState<{ id: string; title: string } | null>(null);

  const listColorMap = useMemo(() => {
    if (!lists) return new Map<string, string>();
    return new Map(lists.map((l) => [l.id, l.color]));
  }, [lists]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const goToDay = useCallback(
    (d: Date) => {
      setCurrentDate(d);
      setViewMode('day');
      navigate('/calendar/day');
    },
    [navigate, setCurrentDate, setViewMode],
  );

  const handleDragStart = (event: DragStartEvent) => {
    const taskId = String(event.active.id).replace('task-', '');
    const fromDate = event.active.data.current?.fromDate;
    if (fromDate && eventsByDate[fromDate]) {
      const ev = eventsByDate[fromDate].find((e) => e.task.id === taskId);
      if (ev) setActiveDrag({ id: taskId, title: ev.title });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const targetDate = String(over.id).replace('date-', '');
    const taskId = String(active.id).replace('task-', '');
    const fromDate = active.data.current?.fromDate as string | undefined;

    if (targetDate && taskId && fromDate && targetDate !== fromDate) {
      updateTask.mutate({ id: taskId, due_date: targetDate });
    }
  };

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

  const activeTask = activeDrag;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                  <DroppableDay
                    key={di}
                    dateKey={dateKey}
                    isCurrentMonth={isCurrentMonth}
                  >
                    <div onClick={() => goToDay(d)} className="flex items-center justify-between mb-1">
                      <div
                        className={cn(
                          'text-xs w-6 h-6 flex items-center justify-center rounded-full',
                          isTodayDate && 'bg-primary text-primary-foreground font-medium',
                        )}
                      >
                        {d.getDate()}
                      </div>
                      {dayEvents.length > 0 && (
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                          isTodayDate ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
                        )}>
                          {dayEvents.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5" onClick={(e) => e.stopPropagation()}>
                      {dayEvents.slice(0, 2).map((ev) => (
                        <DraggableTask key={ev.task.id} ev={ev} dateKey={dateKey}
                          listColor={ev.task.list_id ? listColorMap.get(ev.task.list_id) : undefined} />
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="text-[10px] text-muted-foreground pl-1 font-medium">
                          +{dayEvents.length - 2} more
                        </span>
                      )}
                    </div>
                  </DroppableDay>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeTask ? (
          <div className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs shadow-lg">
            {activeTask.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
