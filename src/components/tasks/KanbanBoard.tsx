import { useMemo, useState, useCallback } from 'react';
import { useUpdateTask } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { useUIStore } from '../../stores/uiStore';
import { TaskCard } from './TaskCard';
import { Flag, CheckCircle2, Layers, Calendar, Sun, PauseCircle, XCircle } from 'lucide-react';
import { sortTasks } from '../../lib/sortTasks';
import { priorityColors } from '../../lib/priority';
import { cn } from '../../lib/cn';
import { formatDate, isOverdue, todayISO } from '../../lib/date';
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
import type { Task } from '../../types/task';
import type { Tag } from '../../types/tag';

type GroupBy = 'priority' | 'tag' | 'completed';

const PRIORITY_GROUPS = [4, 3, 2, 1, 0];

const PRIORITY_THEMES: Record<number, { color: string; bgClass: string; icon: React.ReactNode }> = {
  4: { color: '#EF4444', bgClass: 'bg-red-50 dark:bg-red-950/15', icon: <Flag size={16} color="#EF4444" /> },
  3: { color: '#F59E0B', bgClass: 'bg-amber-50 dark:bg-amber-950/15', icon: <Flag size={16} color="#F59E0B" /> },
  2: { color: '#3B82F6', bgClass: 'bg-blue-50 dark:bg-blue-950/15', icon: <Flag size={16} color="#3B82F6" /> },
  1: { color: '#6B7280', bgClass: 'bg-gray-50 dark:bg-gray-950/15', icon: <Flag size={16} color="#6B7280" /> },
  0: { color: '#9CA3AF', bgClass: 'bg-gray-50 dark:bg-gray-950/15', icon: <Flag size={16} color="#9CA3AF" /> },
};

interface ColumnDef {
  id: string;
  label: string;
  color: string;
  bgClass: string;
  icon: React.ReactNode;
  tasks: Task[];
}

function DraggableKanbanCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const updateTask = useUpdateTask();
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const { data: tags } = useTags();
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const overdue = isOverdue(task.due_date);

  const tagMap = useMemo(() => {
    if (!tags) return new Map();
    return new Map(tags.map((t) => [t.id, t]));
  }, [tags]);
  const taskTags = (task.tag_ids || []).map((id) => tagMap.get(id)).filter((t): t is Tag => !!t);

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style} className={cn(isDragging && 'opacity-0', 'cursor-grab [&_*]:!cursor-grab')}>
      <div
        className={cn(
          'rounded-[10px] p-3 cursor-grab active:cursor-grabbing select-none transition-colors group',
          !isGlass && 'bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06]',
          !isGlass && task.is_completed && 'opacity-60',
          isGlass && 'glass-card',
          overdue && !task.is_completed && 'border-l-[3px] border-l-red-400 hover:border-l-red-400',
          !overdue && 'hover:border-[#7C72F6]/30',
        )}
        onClick={() => setSelectedTaskId(task.id)}
      >
        <div className="flex items-start gap-2">
          {/* Status indicator */}
          {task.is_suspended ? (
            <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_suspended: false }); }}
              className="shrink-0 mt-0.5 text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              title="恢复">
              <PauseCircle size={18} />
            </button>
          ) : task.is_abandoned ? (
            <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_abandoned: false }); }}
              className="shrink-0 mt-0.5 text-[#EF4444] hover:text-red-500 transition-colors"
              title="重新激活">
              <XCircle size={18} />
            </button>
          ) : (
          <button
            onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_completed: !task.is_completed }); }}
            className={cn(
              'w-[18px] h-[18px] rounded-full border-2 shrink-0 mt-0.5 transition-colors',
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
          )}

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <span className={cn(
              'text-[13px] leading-snug block',
              task.is_completed && 'line-through text-[#9CA3AF]',
              !task.is_completed && 'text-[#111827] dark:text-white/90',
            )} style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {task.title}
            </span>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {taskTags.map((t) => (
                <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                  style={{ backgroundColor: t.color + '20', color: t.color }}>
                  {t.name}
                </span>
              ))}
              {task.priority > 0 && (
                <span className={cn('text-[11px] flex items-center gap-0.5 shrink-0', priorityColors[task.priority])}>
                  <Flag size={10} />
                </span>
              )}
              {task.due_date && (
                <span className={cn('text-[11px] flex items-center gap-1 shrink-0', overdue && !task.is_completed ? 'text-red-500' : 'text-[#9CA3AF]')}>
                  <Calendar size={10} />
                  {formatDate(task.due_date)}
                </span>
              )}
              {task.my_day_date === todayISO() && (
                <Sun size={12} className="text-amber-500 shrink-0" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ column, isGlass }: { column: ColumnDef; isGlass: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-w-[260px] max-w-[380px] rounded-xl border flex flex-col h-full transition-shadow relative',
        isGlass
          ? 'glass-card border-white/[0.06]'
          : column.bgClass + ' border-[#F3F4F6] dark:border-white/[0.06]',
      )}
    >
      {isOver && (
        <div className="absolute inset-0 rounded-xl ring-2 ring-inset ring-[#7C72F6] shadow-[inset_0_0_12px_rgba(124,114,246,0.15)] pointer-events-none z-10" />
      )}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#F3F4F6] dark:border-white/[0.06] shrink-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: column.color + '20' }}>
          {column.icon}
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[#111827] dark:text-white/90">{column.label}</div>
        </div>
        <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: column.color + '15', color: column.color }}>
          {column.tasks.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden rounded-b-xl pt-2 px-2 pb-6 space-y-1.5">
        {column.tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[12px] text-[#D1D5DB] dark:text-white/[0.08]">
            拖拽任务到此处
          </div>
        ) : (
          column.tasks.map((task) => (
            <DraggableKanbanCard key={task.id} task={task} />
          ))
        )}
      </div>
    </div>
  );
}

// 看板视图:接收当前范围的任务集合,拖拽卡片到另一列即修改对应的属性。
// 排序跟随页头的排序;分组是看板自己的设置,放在看板顶部
export function KanbanBoard({ tasks }: { tasks: Task[] }) {
  const { data: tags } = useTags();
  const updateTask = useUpdateTask();
  const sortMode = useUIStore((s) => s.sortMode);
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const [groupBy, setGroupBy] = useState<GroupBy>('priority');
  const [activeDrag, setActiveDrag] = useState<Task | null>(null);

  const sorted = useMemo(() => sortTasks(tasks, sortMode), [tasks, sortMode]);
  const topLevel = useMemo(() => sorted.filter((t) => !t.parent_task_id), [sorted]);

  const columns = useMemo((): ColumnDef[] => {
    if (groupBy === 'priority') {
      return PRIORITY_GROUPS.map((p) => ({
        id: `p${p}`,
        label: priorityColors[p] ? (p === 4 ? '最高' : p === 3 ? '高' : p === 2 ? '中' : p === 1 ? '低' : '无') : '无',
        color: PRIORITY_THEMES[p].color,
        bgClass: PRIORITY_THEMES[p].bgClass,
        icon: PRIORITY_THEMES[p].icon,
        tasks: topLevel.filter((t) => t.priority === p),
      }));
    }
    if (groupBy === 'tag') {
      const tagCols = (tags || []).map((tag) => ({
        id: `tag_${tag.id}`,
        label: tag.name,
        color: tag.color,
        bgClass: 'bg-gray-50 dark:bg-gray-950/15',
        icon: <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />,
        tasks: topLevel.filter((t) => (t.tag_ids || []).includes(tag.id)),
      }));
      const untagged: ColumnDef = {
        id: 'untagged',
        label: '无标签',
        color: '#9CA3AF',
        bgClass: 'bg-gray-50 dark:bg-gray-950/15',
        icon: <Layers size={16} color="#9CA3AF" />,
        tasks: topLevel.filter((t) => !t.tag_ids || t.tag_ids.length === 0),
      };
      return [...tagCols, untagged];
    }
    return [
      {
        id: 'todo',
        label: '待完成',
        color: '#F59E0B',
        bgClass: 'bg-amber-50 dark:bg-amber-950/15',
        icon: <CheckCircle2 size={16} color="#F59E0B" />,
        tasks: topLevel.filter((t) => !t.is_completed && !t.is_abandoned),
      },
      {
        id: 'done',
        label: '已完成',
        color: '#10B981',
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/15',
        icon: <CheckCircle2 size={16} color="#10B981" />,
        tasks: topLevel.filter((t) => t.is_completed || t.is_abandoned),
      },
    ];
  }, [topLevel, groupBy, tags]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task | undefined;
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
      if (columnId === 'untagged') {
        updateTask.mutate({ id: taskId, tag_ids: [] });
      } else {
        const tagId = columnId.replace('tag_', '');
        const task = event.active.data.current?.task as Task | undefined;
        const current = task?.tag_ids || [];
        const next = current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId];
        updateTask.mutate({ id: taskId, tag_ids: next });
      }
    } else if (groupBy === 'completed') {
      updateTask.mutate({ id: taskId, is_completed: columnId === 'done', is_abandoned: false });
    }
  }, [groupBy, updateTask]);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex justify-end mb-2">
        <div role="group" aria-label="看板分组" className="flex items-center gap-0.5 bg-[#F3F4F6] dark:bg-white/[0.04] rounded-lg p-1">
          {([
            ['priority', '优先级'],
            ['tag', '标签'],
            ['completed', '完成'],
          ] as [GroupBy, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setGroupBy(k)}
              aria-pressed={groupBy === k}
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
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4 min-h-0 p-1">
          {columns.map((col) => (
            <KanbanColumn key={col.id} column={col} isGlass={isGlass} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="opacity-90 scale-105 rotate-1 shadow-2xl rounded-[10px]">
              <TaskCard task={activeDrag} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
