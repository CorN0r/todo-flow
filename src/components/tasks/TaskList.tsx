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
import { useState, useCallback } from 'react';
import { cn } from '../../lib/cn';
import type { Task } from '../../types/task';
import { TaskCard } from './TaskCard';
import { useReorderTasks } from '../../hooks/useTasks';
import { mergeVisibleTaskOrder } from '../../lib/taskOrder';

function SortableTaskRow({ task }: { task: Task }) {
  const [isEditing, setIsEditing] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: task.parent_task_id !== null || isEditing,
  });

  const handleEditingChange = useCallback((editing: boolean) => {
    setIsEditing(editing);
  }, []);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      {...(isEditing ? {} : attributes)}
      {...(isEditing ? {} : listeners)}
      style={style}
      className={cn('cursor-grab active:cursor-grabbing [&_button]:cursor-pointer', isDragging && 'opacity-50 z-50')}
    >
      <TaskCard task={task} onEditingChange={handleEditingChange} />
    </div>
  );
}

export function TaskList({ tasks, reorderScope = tasks }: { tasks: Task[]; reorderScope?: Task[]; treeMode?: boolean }) {
  const reorderTasks = useReorderTasks();

  const topLevelTasks = tasks;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = topLevelTasks.findIndex((t) => t.id === active.id);
    const newIndex = topLevelTasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(topLevelTasks, oldIndex, newIndex);
    const mergedOrder = mergeVisibleTaskOrder(reorderScope, reordered);
    const items = mergedOrder.map((t, i) => ({
      id: t.id,
      sort_order: i,
      parent_task_id: t.parent_task_id,
    }));
    reorderTasks.mutate(items);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={topLevelTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col" style={{ gap: '6px' }}>
          {topLevelTasks.map((task) => (
            <SortableTaskRow key={task.id} task={task} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
