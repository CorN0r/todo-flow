import { AnimatePresence } from 'motion/react';
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
import { cn } from '../../lib/cn';
import type { Task } from '../../types/task';
import { TaskCard } from './TaskCard';
import { useReorderTasks } from '../../hooks/useTasks';

function SortableTaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-1 group/task',
        isDragging && 'opacity-50 z-50'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-0.5 text-muted-foreground opacity-0 group-hover/task:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing transition-opacity"
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1">
        <TaskCard task={task} />
      </div>
    </div>
  );
}

interface TaskListProps {
  tasks: Task[];
}

export function TaskList({ tasks }: TaskListProps) {
  const reorderTasks = useReorderTasks();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tasks, oldIndex, newIndex);
    const items = reordered.map((t, i) => ({
      id: t.id,
      sort_order: i,
      parent_task_id: t.parent_task_id,
    }));
    reorderTasks.mutate(items);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          <AnimatePresence>
            {tasks.map((task) => (
              <SortableTaskCard key={task.id} task={task} />
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>
    </DndContext>
  );
}
