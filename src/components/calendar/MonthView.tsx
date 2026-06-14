import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { useCalendarStore } from '../../stores/calendarStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { useUIStore } from '../../stores/uiStore';
import { useUpdateTask } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { getHolidayName } from '../../lib/holidays';
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

function DraggableTask({ ev, dateKey, tagColor }: {
  ev: ReturnType<typeof useCalendarEvents>['eventsByDate'][string][0];
  dateKey: string;
  tagColor?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${ev.task.id}`,
    data: { taskId: ev.task.id, fromDate: dateKey },
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const color = tagColor || '#6366f1';

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
        <span className={cn(ev.task.is_completed && 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] line-through rounded px-0.5')}>
          {ev.title}
        </span>
      </button>
    </div>
  );
}

function DroppableDay({ dateKey, isCurrentMonth, isWeekend, children }: {
  dateKey: string; isCurrentMonth: boolean; isWeekend: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `date-${dateKey}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[80px] border-r border-[#E5E7EB] dark:border-white/[0.06] last:border-r-0 p-1.5 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.02] transition-colors relative',
        !isCurrentMonth && 'bg-[#F3F4F6]/50 dark:bg-white/[0.01]',
        isCurrentMonth && isWeekend && 'bg-[#FAFAFA] dark:bg-white/[0.015]',
        isOver && 'bg-[#7C72F6]/[0.08] z-10',
      )}
    >
      {isOver && (
        <div className="absolute inset-0 ring-2 ring-inset ring-[#7C72F6] pointer-events-none z-10" />
      )}
      {children}
    </div>
  );
}

export function MonthView() {
  const navigate = useNavigate();
  const { currentDate, setCurrentDate, setViewMode } = useCalendarStore();
  const { eventsByDate } = useCalendarEvents(currentDate, 'month');
  const updateTask = useUpdateTask();
  const { data: tags } = useTags();
  const [activeDrag, setActiveDrag] = useState<{ id: string; title: string } | null>(null);

  const tagColorMap = useMemo(() => {
    if (!tags) return new Map<string, string>();
    return new Map(tags.map((t) => [t.id, t.color]));
  }, [tags]);

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

  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
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
      <div className="pb-6">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {dayNames.map((name) => (
            <div key={name} className="text-center text-xs text-[#6B7280] py-1 font-medium">
              {name}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="border border-[#E5E7EB] dark:border-white/[0.08] rounded-xl bg-white dark:bg-[#1e1e32]">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-[#E5E7EB] dark:border-white/[0.06] last:border-b-0">
              {week.map((d, di) => {
                const dateKey = format(d, 'yyyy-MM-dd');
                const dayEvents = eventsByDate[dateKey] || [];
                const isCurrentMonth = d.getMonth() === currentDate.getMonth();
                const isTodayDate = isToday(d);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const holidayName = getHolidayName(dateKey);

                return (
                  <DroppableDay
                    key={di}
                    dateKey={dateKey}
                    isCurrentMonth={isCurrentMonth}
                    isWeekend={isWeekend}
                  >
                    <div onClick={() => goToDay(d)} className="flex items-center justify-between mb-1 cursor-pointer">
                      <div
                        className={cn(
                          'text-xs w-6 h-6 flex items-center justify-center rounded-full',
                          isTodayDate && 'bg-[#7C72F6] text-white font-bold',
                        )}
                      >
                        {d.getDate()}
                      </div>
                      {dayEvents.length > 0 && (
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                          isTodayDate ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6]' : 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280]',
                        )}>
                          {dayEvents.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5" onClick={(e) => e.stopPropagation()}>
                      {dayEvents.slice(0, 2).map((ev) => (
                        <DraggableTask key={ev.task.id} ev={ev} dateKey={dateKey}
                          tagColor={ev.task.tag_id ? tagColorMap.get(ev.task.tag_id) : undefined} />
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="text-[10px] text-[#6B7280] pl-1 font-medium">
                          +{dayEvents.length - 2} 项
                        </span>
                      )}
                    </div>
                    {holidayName && (
                      <div className="text-[10px] text-[#9CA3AF] mt-1 truncate">{holidayName}</div>
                    )}
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
          <div className="px-2 py-1 rounded bg-[#7C72F6] text-white text-xs shadow-lg">
            {activeTask.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
