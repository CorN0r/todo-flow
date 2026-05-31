import { useMemo, useState, useCallback } from 'react';
import { useTasks, useUpdateTask } from '../hooks/useTasks';
import { useTags } from '../hooks/useTags';
import { useUIStore } from '../stores/uiStore';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { TaskCard } from '../components/tasks/TaskCard';
import { type SortMode } from '../components/shared/PageTitle';
import { Layout, Flag, CheckCircle2, Layers, ArrowUpDown, Calendar, Sun } from 'lucide-react';
import { sortTasks } from '../lib/sortTasks';
import { priorityColors } from '../lib/priority';
import { cn } from '../lib/cn';
import { formatDate, isOverdue, todayISO } from '../lib/date';
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
import type { Task } from '../types/task';

type GroupBy = 'priority' | 'tag' | 'completed';

const PRIORITY_GROUPS = [4, 3, 2, 1, 0];

const sortOptions: { value: SortMode; label: string }[] = [
  { value: 'manual', label: '手动排序' },
  { value: 'priority', label: '优先级' },
  { value: 'date-desc', label: '截止日期' },
  { value: 'alpha-asc', label: '字母' },
  { value: 'created-desc', label: '创建时间' },
];

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
  const taskTag = task.tag_id ? tagMap.get(task.tag_id) : undefined;

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
          {/* Completion checkbox */}
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
              {taskTag && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                  style={{ backgroundColor: taskTag.color + '20', color: taskTag.color }}>
                  {taskTag.name}
                </span>
              )}
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
        'flex-1 min-w-[260px] max-w-[380px] rounded-xl border flex flex-col h-full transition-shadow',
        isGlass
          ? 'glass-card border-white/[0.06]'
          : column.bgClass + ' border-[#F3F4F6] dark:border-white/[0.06]',
        isOver && 'ring-2 ring-inset ring-[#7C72F6] shadow-lg',
      )}
    >
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

      <div className="flex-1 overflow-y-auto overflow-x-hidden rounded-b-xl p-2 space-y-1.5">
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

export function KanbanPage() {
  const { data: tasks, isLoading } = useTasks({ include_children: false });
  const { data: tags } = useTags();
  const updateTask = useUpdateTask();
  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const [groupBy, setGroupBy] = useState<GroupBy>('priority');
  const [sortOpen, setSortOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<Task | null>(null);

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);
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
        tasks: topLevel.filter((t) => t.tag_id === tag.id),
      }));
      const untagged: ColumnDef = {
        id: 'untagged',
        label: '无标签',
        color: '#9CA3AF',
        bgClass: 'bg-gray-50 dark:bg-gray-950/15',
        icon: <Layers size={16} color="#9CA3AF" />,
        tasks: topLevel.filter((t) => !t.tag_id),
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
        tasks: topLevel.filter((t) => !t.is_completed),
      },
      {
        id: 'done',
        label: '已完成',
        color: '#10B981',
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/15',
        icon: <CheckCircle2 size={16} color="#10B981" />,
        tasks: topLevel.filter((t) => t.is_completed),
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
      const tagId = columnId === 'untagged' ? undefined : columnId.replace('tag_', '');
      updateTask.mutate({ id: taskId, tag_id: tagId });
    } else if (groupBy === 'completed') {
      updateTask.mutate({ id: taskId, is_completed: columnId === 'done' });
    }
  }, [groupBy, updateTask]);

  if (isLoading) return <LoadingSkeleton count={8} />;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 100px)' }}>
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
            <Layout size={18} className="text-indigo-500" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-[#111827] dark:text-white/90">看板</h1>
            <p className="text-[13px] text-[#9CA3AF] mt-0.5">拖拽任务卡片到不同列以更改属性</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className="h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md bg-white dark:bg-[#1e1e32] border border-[#E5E7EB] dark:border-white/[0.07] text-[12px] font-medium text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06] transition-colors shrink-0"
            >
              <ArrowUpDown size={13} className="text-[#6B7280]" />
              {sortOptions.find((o) => o.value === sortMode)?.label || '排序'}
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[160px]">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortMode(opt.value); setSortOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-[13px] transition-colors ${
                        sortMode === opt.value
                          ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6] font-medium'
                          : 'text-[#111827] dark:text-white/90 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Group-by toggle */}
          <div className="flex items-center gap-0.5 bg-[#F3F4F6] dark:bg-white/[0.04] rounded-lg p-1 shrink-0">
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
