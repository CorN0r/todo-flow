import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Zap, ArrowRight, LayoutGrid, ArrowUpDown } from 'lucide-react';
import { useTasks, useUpdateTask } from '../hooks/useTasks';
import { useUIStore } from '../stores/uiStore';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { TaskCard } from '../components/tasks/TaskCard';
import { type SortMode } from '../components/shared/PageTitle';
import { sortTasks } from '../lib/sortTasks';
import { todayISO, isOverdue } from '../lib/date';
import type { Task } from '../types/task';
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

interface QuadrantDef {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  bgClass: string;
  urgent: boolean;
  important: boolean;
}

const sortOptions: { value: SortMode; label: string }[] = [
  { value: 'manual', label: '手动排序' },
  { value: 'priority', label: '优先级' },
  { value: 'date-desc', label: '截止日期' },
  { value: 'alpha-asc', label: '字母' },
  { value: 'created-desc', label: '创建时间' },
];

const QUADRANTS: QuadrantDef[] = [
  {
    title: '立即处理',
    subtitle: '紧急且重要',
    icon: <Zap size={16} />,
    color: '#EF4444',
    bgClass: 'bg-red-50 dark:bg-red-950/15',
    urgent: true,
    important: true,
  },
  {
    title: '计划安排',
    subtitle: '不紧急但重要',
    icon: <CheckCircle2 size={16} />,
    color: '#3B82F6',
    bgClass: 'bg-blue-50 dark:bg-blue-950/15',
    urgent: false,
    important: true,
  },
  {
    title: '委派他人',
    subtitle: '紧急但不重要',
    icon: <AlertTriangle size={16} />,
    color: '#F59E0B',
    bgClass: 'bg-amber-50 dark:bg-amber-950/15',
    urgent: true,
    important: false,
  },
  {
    title: '可删除',
    subtitle: '不紧急不重要',
    icon: <ArrowRight size={16} />,
    color: '#9CA3AF',
    bgClass: 'bg-gray-50 dark:bg-gray-950/15',
    urgent: false,
    important: false,
  },
];

function bucketTask(task: Task): number {
  const overdue = task.due_date && isOverdue(task.due_date);
  const dueToday = task.due_date?.slice(0, 10) === todayISO();
  const urgent = !!(overdue || dueToday);
  const important = task.priority >= 3;

  if (important && urgent) return 0;
  if (important && !urgent) return 1;
  if (!important && urgent) return 2;
  return 3;
}

function DraggableMatrixCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style} className={cn(isDragging && 'opacity-0', 'cursor-grab [&_*]:!cursor-grab')}>
      <TaskCard task={task} />
    </div>
  );
}

function QuadrantColumn({ index, q, tasks, isGlass }: {
  index: number;
  q: QuadrantDef;
  tasks: Task[];
  isGlass: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `quadrant-${index}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl border flex flex-col overflow-hidden h-full transition-shadow relative',
        isGlass ? 'glass-card border-white/[0.06]' : q.bgClass + ' border-[#F3F4F6] dark:border-white/[0.06]',
      )}
    >
      {isOver && (
        <div className="absolute inset-0 rounded-xl ring-2 ring-inset ring-[#7C72F6] shadow-[inset_0_0_12px_rgba(124,114,246,0.15)] pointer-events-none z-10" />
      )}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#F3F4F6] dark:border-white/[0.06] shrink-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: q.color + '20', color: q.color }}>
          {q.icon}
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[#111827] dark:text-white/90">{q.title}</div>
          <div className="text-[11px] text-[#9CA3AF]">{q.subtitle}</div>
        </div>
        <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: q.color + '15', color: q.color }}>
          {tasks.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2 px-2 pb-6 space-y-1">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[12px] text-[#D1D5DB]">
            拖拽任务到此处
          </div>
        ) : (
          tasks.map((task) => (
            <DraggableMatrixCard key={task.id} task={task} />
          ))
        )}
      </div>
    </div>
  );
}

export function MatrixPage() {
  const { data: tasks, isLoading } = useTasks({ include_children: false });
  const updateTask = useUpdateTask();
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const [sortOpen, setSortOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<Task | null>(null);

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);

  const buckets = useMemo(() => {
    const result: Task[][] = [[], [], [], []];
    for (const t of sorted) {
      if (t.is_completed || t.is_abandoned) continue;
      result[bucketTask(t)].push(t);
    }
    return result;
  }, [sorted]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task | undefined;
    if (task) setActiveDrag(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const task = (tasks || []).find((t) => t.id === taskId);
    const toQuadrant = parseInt(String(over.id).replace('quadrant-', ''), 10);
    const target = QUADRANTS[toQuadrant];

    updateTask.mutate({
      id: taskId,
      due_date: target.urgent ? (task?.due_date || todayISO()) : '',
      priority: target.important ? 3 : 0,
    });
  };

  if (isLoading) return <LoadingSkeleton count={8} />;

  const allEmpty = buckets.every((b) => b.length === 0);

  const header = (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
          <LayoutGrid size={18} className="text-amber-500" />
        </div>
        <div>
          <h1 className="text-[20px] font-bold text-[#111827] dark:text-white/90">Eisenhower 矩阵</h1>
          <p className="text-[13px] text-[#9CA3AF] mt-0.5">按紧急性和重要性四象限管理任务</p>
        </div>
      </div>

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
    </div>
  );

  if (allEmpty) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<Zap size={40} />}
          title="暂无任务"
          description="创建任务后将自动显示在对应象限中"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col pb-4">
      {header}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
          {QUADRANTS.map((q, i) => (
            <QuadrantColumn key={i} index={i} q={q} tasks={buckets[i]} isGlass={isGlass} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="opacity-90 scale-105 rotate-1 shadow-2xl">
              <TaskCard task={activeDrag} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
