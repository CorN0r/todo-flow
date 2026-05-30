import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { useCalendarStore } from '../../stores/calendarStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { useUIStore } from '../../stores/uiStore';
import { useUpdateTask } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { startOfWeek, addDays, isToday, format } from '../../lib/date';
import { getHolidayName } from '../../lib/holidays';
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

function DraggableWeekTask({ ev, dateKey, tagColor }: {
  ev: ReturnType<typeof useCalendarEvents>['eventsByDate'][string][0];
  dateKey: string;
  tagColor?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${ev.task.id}`,
    data: { taskId: ev.task.id, fromDate: dateKey },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const color = tagColor || '#6366f1';

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'opacity-40')}>
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedTaskId(ev.task.id);
        }}
        className="w-full text-left text-xs px-2 py-1 rounded truncate block transition-colors cursor-grab active:cursor-grabbing"
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

function DroppableWeekDay({ dateKey, isTodayDate, isWeekend, children }: {
  dateKey: string; isTodayDate: boolean; isWeekend: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `date-${dateKey}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-full border-r border-[#E5E7EB] dark:border-white/[0.06] last:border-r-0 p-2 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.02] transition-colors flex flex-col',
        isTodayDate && 'bg-[#F3F4F6] dark:bg-white/[0.02]',
        isWeekend && !isTodayDate && 'bg-[#FAFAFA] dark:bg-white/[0.015]',
        isOver && 'bg-[#7C72F6]/[0.08] ring-2 ring-[#7C72F6] relative z-10',
      )}
    >
      {children}
    </div>
  );
}

export function WeekView() {
  const navigate = useNavigate();
  const { currentDate, setCurrentDate, setViewMode } = useCalendarStore();
  const { eventsByDate } = useCalendarEvents(currentDate, 'week');
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

  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="border border-[#E5E7EB] dark:border-white/[0.08] rounded-xl bg-white dark:bg-[#1e1e32] flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
        <div className="grid grid-cols-7 flex-1">
          {days.map((d) => {
            const dateKey = format(d, 'yyyy-MM-dd');
            const dayEvents = eventsByDate[dateKey] || [];
            const isTodayDate = isToday(d);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const holidayName = getHolidayName(dateKey);

            return (
              <DroppableWeekDay key={dateKey} dateKey={dateKey} isTodayDate={isTodayDate} isWeekend={isWeekend}>
                <div onClick={() => goToDay(d)} className="cursor-pointer">
                  <div className="text-center mb-2">
                    <div className="text-xs text-[#6B7280]">{['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]}</div>
                    <div
                      className={cn(
                        'text-sm w-7 h-7 flex items-center justify-center rounded-full mx-auto',
                        isTodayDate && 'bg-[#7C72F6] text-white font-medium',
                      )}
                    >
                      {d.getDate()}
                    </div>
                    {holidayName && (
                      <div className="text-[10px] text-[#9CA3AF] mt-0.5">{holidayName}</div>
                    )}
                    {dayEvents.length > 0 && (
                      <span className={cn(
                        'inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                        isTodayDate ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6]' : 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280]',
                      )}>
                        {dayEvents.length}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1" onClick={(e) => e.stopPropagation()}>
                  {dayEvents.slice(0, 5).map((ev) => (
                    <DraggableWeekTask key={ev.task.id} ev={ev} dateKey={dateKey}
                      tagColor={ev.task.tag_id ? tagColorMap.get(ev.task.tag_id) : undefined} />
                  ))}
                  {dayEvents.length > 5 && (
                    <span className="text-[10px] text-[#6B7280] pl-2 font-medium">
                      +{dayEvents.length - 5} 项
                    </span>
                  )}
                </div>
              </DroppableWeekDay>
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activeDrag ? (
          <div className="px-2 py-1 rounded bg-[#7C72F6] text-white text-xs shadow-lg">
            {activeDrag.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
