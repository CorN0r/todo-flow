import { useMemo } from 'react';
import { cn } from '../../lib/cn';
import { useCalendarStore } from '../../stores/calendarStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { useUIStore } from '../../stores/uiStore';
import { useReorderTasks } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { isToday, format } from '../../lib/date';
import { getHolidayName } from '../../lib/holidays';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableDayTask({ event, tagName, tagColor, onClick }: {
  event: { task: { id: string; title: string; is_completed: boolean; tag_id?: string | null } };
  tagName?: string;
  tagColor?: string;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: event.task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const { task } = event;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={cn(
        'cursor-grab active:cursor-grabbing [&_*]:!cursor-grab',
        isDragging && 'opacity-50 z-50',
      )}
    >
      <div
        onClick={onClick}
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border border-[#F3F4F6] dark:border-white/[0.06] bg-white dark:bg-[#1e1e32] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors',
          task.is_completed && 'opacity-80',
        )}
      >
        <div className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
          task.is_completed
            ? 'bg-[#7C72F6] border-[#7C72F6] text-white'
            : 'border-[#D1D5DB]',
        )}>
          {task.is_completed && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <span className={cn(
          'flex-1 text-sm',
          task.is_completed && 'line-through text-[#6B7280]',
        )}>
          {task.title}
        </span>
        {tagName && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
            style={{ backgroundColor: tagColor + '20', color: tagColor }}>
            {tagName}
          </span>
        )}
      </div>
    </div>
  );
}

export function DayView() {
  const { currentDate } = useCalendarStore();
  const { eventsByDate } = useCalendarEvents(currentDate, 'day');
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const reorderTasks = useReorderTasks();
  const { data: tags } = useTags();

  const tagMap = useMemo(() => {
    if (!tags) return new Map<string, { name: string; color: string }>();
    return new Map(tags.map((t) => [t.id, { name: t.name, color: t.color }]));
  }, [tags]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dateKey = format(currentDate, 'yyyy-MM-dd');
  const dayEvents = eventsByDate[dateKey] || [];
  const isTodayDate = isToday(currentDate);
  const holidayName = getHolidayName(dateKey);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = dayEvents.findIndex((e) => e.task.id === active.id);
    const newIndex = dayEvents.findIndex((e) => e.task.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(dayEvents, oldIndex, newIndex);
    reorderTasks.mutate(reordered.map((e, i) => ({
      id: e.task.id,
      sort_order: i,
      parent_task_id: e.task.parent_task_id,
    })));
  };

  return (
    <div className="pb-6">
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <div className={cn(
            'text-sm inline-flex items-center justify-center px-3 py-1 rounded-full',
            isTodayDate && 'bg-[#7C72F6] text-white',
          )}>
            {(() => { const dn = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六']; return `${dn[currentDate.getDay()]}, ${currentDate.getFullYear()}年${currentDate.getMonth()+1}月${currentDate.getDate()}日`; })()}
          </div>
          {holidayName && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] font-medium">
              {holidayName}
            </span>
          )}
          {dayEvents.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] font-medium">
              {dayEvents.length} task{dayEvents.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {dayEvents.length === 0 && (
        <p className="text-center text-sm text-[#6B7280] py-8">
          当天没有安排任务
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={dayEvents.map((e) => e.task.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1 max-w-lg mx-auto">
            {dayEvents.map((ev) => (
              <SortableDayTask
                key={ev.task.id}
                event={ev}
                tagName={ev.task.tag_id ? tagMap.get(ev.task.tag_id)?.name : undefined}
                tagColor={ev.task.tag_id ? tagMap.get(ev.task.tag_id)?.color : undefined}
                onClick={() => setSelectedTaskId(ev.task.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
