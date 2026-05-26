import { cn } from '../../lib/cn';
import { useCalendarStore } from '../../stores/calendarStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { useUIStore } from '../../stores/uiStore';
import { useReorderTasks } from '../../hooks/useTasks';
import { isToday, format } from '../../lib/date';
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
import { GripVertical } from 'lucide-react';

function SortableDayTask({ event, onClick }: {
  event: { task: { id: string; title: string; is_completed: boolean } };
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
      style={style}
      className={cn(
        'flex items-center gap-1 group/daytask',
        isDragging && 'opacity-50 z-50',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-0.5 text-muted-foreground opacity-0 group-hover/daytask:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing transition-opacity"
      >
        <GripVertical size={14} />
      </button>
      <button
        onClick={onClick}
        className={cn(
          'flex-1 text-left p-3 rounded-lg border bg-card hover:bg-accent transition-colors',
          task.is_completed && 'opacity-80',
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
            task.is_completed
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-muted-foreground',
          )}>
            {task.is_completed && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span className={cn(
            'text-sm',
            task.is_completed && 'line-through text-muted-foreground',
          )}>
            {task.title}
          </span>
        </div>
      </button>
    </div>
  );
}

export function DayView() {
  const { currentDate } = useCalendarStore();
  const { eventsByDate } = useCalendarEvents(currentDate, 'day');
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const reorderTasks = useReorderTasks();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dateKey = format(currentDate, 'yyyy-MM-dd');
  const dayEvents = eventsByDate[dateKey] || [];
  const isTodayDate = isToday(currentDate);

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
      parent_task_id: null,
    })));
  };

  return (
    <div>
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2">
          <div className={cn(
            'text-sm inline-flex items-center justify-center px-3 py-1 rounded-full',
            isTodayDate && 'bg-primary text-primary-foreground',
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

      {dayEvents.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No tasks scheduled for this day.
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={dayEvents.map((e) => e.task.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1 max-w-lg mx-auto">
            {dayEvents.map((ev) => (
              <SortableDayTask
                key={ev.task.id}
                event={ev}
                onClick={() => setSelectedTaskId(ev.task.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
