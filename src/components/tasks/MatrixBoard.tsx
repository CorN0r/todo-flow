import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Zap, ArrowRight } from 'lucide-react';
import { useUpdateTask } from '../../hooks/useTasks';
import { useUIStore } from '../../stores/uiStore';
import { EmptyState } from '../shared/EmptyState';
import { TaskCard } from './TaskCard';
import { sortTasks } from '../../lib/sortTasks';
import { todayISO, isOverdue } from '../../lib/date';
import type { Task } from '../../types/task';
import { cn } from '../../lib/cn';
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

// 四象限视图:接收当前范围的任务集合,按紧急性和重要性分四个象限。
// 只放未完成且未放弃的任务(象限是用来安排还要做的事的);排序跟随页头的排序
export function MatrixBoard({ tasks }: { tasks: Task[] }) {
  const updateTask = useUpdateTask();
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const sortMode = useUIStore((s) => s.sortMode);
  const [activeDrag, setActiveDrag] = useState<Task | null>(null);

  const sorted = useMemo(() => sortTasks(tasks, sortMode), [tasks, sortMode]);

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
    const task = tasks.find((t) => t.id === taskId);
    const toQuadrant = parseInt(String(over.id).replace('quadrant-', ''), 10);
    const target = QUADRANTS[toQuadrant];

    updateTask.mutate({
      id: taskId,
      due_date: target.urgent ? (task?.due_date || todayISO()) : '',
      priority: target.important ? 3 : 0,
    });
  };

  const allEmpty = buckets.every((b) => b.length === 0);

  if (allEmpty) {
    return <EmptyState icon={<Zap size={40} />} title="没有可安排的任务" description="四象限只显示未完成的任务" />;
  }

  return (
    <div className="h-full flex flex-col pb-4">
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
