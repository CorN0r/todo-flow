import { useMemo, useState, useCallback } from 'react';
import { useTasks, useUpdateTask } from '../hooks/useTasks';
import { useTags } from '../hooks/useTags';
import { useUIStore } from '../stores/uiStore';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { PageTitle } from '../components/shared/PageTitle';
import { Layout, AlertTriangle } from 'lucide-react';
import { sortTasks } from '../lib/sortTasks';
import { priorityColors, priorityLabels } from '../lib/priority';
import { cn } from '../lib/cn';
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

type GroupBy = 'priority' | 'tag' | 'completed';

const PRIORITY_GROUPS = [4, 3, 2, 1, 0];

interface ColumnDef {
  id: string;
  label: string;
  color: string;
  tagColor?: string;
  tasks: import('../types/task').Task[];
}

function DraggableKanbanCard({ task, updateTask, setSelectedTaskId }: {
  task: import('../types/task').Task;
  updateTask: ReturnType<typeof useUpdateTask>;
  setSelectedTaskId: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={cn(
        'group rounded-lg bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] p-3 cursor-grab active:cursor-grabbing hover:border-[#7C72F6]/30 transition-colors shadow-sm select-none',
        isDragging && 'opacity-0',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_completed: !task.is_completed }); }}
          className={cn(
            'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 transition-colors',
            task.is_completed
              ? 'bg-[#7C72F6] border-[#7C72F6]'
              : 'border-[#D1D5DB] dark:border-white/20 hover:border-[#7C72F6]',
          )}
        >
          {task.is_completed && (
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3 m-auto">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedTaskId(task.id)}>
          <span className={cn('text-[13px] leading-snug', task.is_completed && 'line-through text-[#9CA3AF]')}>
            {task.title}
          </span>
          {task.due_date && (
            <div className="text-[11px] text-[#9CA3AF] mt-0.5">{task.due_date}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ column, updateTask, setSelectedTaskId }: {
  column: ColumnDef;
  updateTask: ReturnType<typeof useUpdateTask>;
  setSelectedTaskId: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-w-[220px] max-w-[360px] rounded-xl bg-[#F9FAFB] dark:bg-white/[0.02] border border-[#F3F4F6] dark:border-white/[0.06] flex flex-col',
        isOver && 'ring-2 ring-[#7C72F6] border-[#7C72F6]',
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#F3F4F6] dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          {column.tagColor ? (
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: column.tagColor }} />
          ) : (
            <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', column.color.replace('text-', 'bg-'))} />
          )}
          <span className="text-[13px] font-semibold text-[#111827] dark:text-white/90">{column.label}</span>
        </div>
        <span className="text-[11px] font-medium text-[#9CA3AF] tabular-nums">{column.tasks.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
        {column.tasks.map((task) => (
          <DraggableKanbanCard
            key={task.id}
            task={task}
            updateTask={updateTask}
            setSelectedTaskId={setSelectedTaskId}
          />
        ))}
        {column.tasks.length === 0 && (
          <div className="text-center py-6 text-[12px] text-[#D1D5DB] dark:text-white/[0.12]">
            拖拽任务到此处
          </div>
        )}
      </div>
    </div>
  );
}

export function KanbanPage() {
  const { data: tasks, isLoading, isError } = useTasks({ include_children: true });
  const { data: tags } = useTags();
  const updateTask = useUpdateTask();
  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const exitSelection = useUIStore((s) => s.exitSelectionMode);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);

  const [groupBy, setGroupBy] = useState<GroupBy>('priority');
  const [activeDrag, setActiveDrag] = useState<import('../types/task').Task | null>(null);

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);
  const topLevel = useMemo(() => sorted.filter((t) => !t.parent_task_id), [sorted]);

  const columns = useMemo(() => {
    if (groupBy === 'priority') {
      return PRIORITY_GROUPS.map((p) => ({
        id: `p${p}`,
        label: priorityLabels[p],
        color: priorityColors[p],
        tagColor: undefined as string | undefined,
        tasks: topLevel.filter((t) => t.priority === p && !t.is_completed),
      }));
    }
    if (groupBy === 'tag') {
      const tagCols = (tags || []).map((tag) => ({
        id: `tag_${tag.id}`,
        label: tag.name,
        color: `text-[${tag.color}]`,
        tagColor: tag.color,
        tasks: topLevel.filter((t) => t.tag_id === tag.id && !t.is_completed),
      }));
      const untagged = {
        id: 'untagged',
        label: '无标签',
        color: 'text-[#9CA3AF]',
        tagColor: '#9CA3AF',
        tasks: topLevel.filter((t) => !t.tag_id && !t.is_completed),
      };
      return [...tagCols, untagged];
    }
    // completed
    return [
      { id: 'todo', label: '待完成', color: 'text-[#F59E0B]', tagColor: undefined as string | undefined, tasks: topLevel.filter((t) => !t.is_completed) },
      { id: 'done', label: '已完成', color: 'text-[#10B981]', tagColor: undefined as string | undefined, tasks: topLevel.filter((t) => t.is_completed) },
    ];
  }, [topLevel, groupBy, tags]);

  const handleToggleSelection = useCallback(() => {
    if (selectionMode) { exitSelection(); } else { useUIStore.getState().enterSelectionMode(); }
  }, [selectionMode, exitSelection]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task as import('../types/task').Task | undefined;
    if (task) setActiveDrag(task);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const columnId = String(over.id);

    if (groupBy === 'priority') {
      const priority = parseInt(columnId.replace('p', ''), 10);
      updateTask.mutate({ id: taskId, priority });
    } else if (groupBy === 'tag') {
      const tagId = columnId === 'untagged' ? null : columnId.replace('tag_', '');
      updateTask.mutate({ id: taskId, tag_id: tagId ?? undefined });
    } else if (groupBy === 'completed') {
      updateTask.mutate({ id: taskId, is_completed: columnId === 'done' });
    }
  }, [groupBy, updateTask]);

  if (isLoading) return <LoadingSkeleton count={5} />;
  if (isError) return <EmptyState icon={<AlertTriangle size={40} />} title="加载失败" description="请检查数据库连接后重试" />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
            <Layout size={18} className="text-indigo-500" />
          </div>
          <PageTitle title="看板" taskCount={topLevel.length}
            sortMode={sortMode} onSortChange={setSortMode}
            selectionMode={selectionMode} onToggleSelection={handleToggleSelection} />
        </div>
        <div className="flex items-center gap-1 bg-[#F3F4F6] dark:bg-white/[0.04] rounded-lg p-1">
          {([
            ['priority', '优先级'],
            ['tag', '标签'],
            ['completed', '完成'],
          ] as [GroupBy, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setGroupBy(k)}
              className={cn(
                'px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors',
                groupBy === k
                  ? 'bg-white dark:bg-[#7C72F6] text-[#111827] dark:text-white shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <KanbanColumn key={col.id} column={col} updateTask={updateTask} setSelectedTaskId={setSelectedTaskId} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="opacity-90 scale-105 rotate-1 shadow-2xl rounded-lg bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] p-3">
              <span className="text-[13px] leading-snug">{activeDrag.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
