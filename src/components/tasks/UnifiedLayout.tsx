import { useState, useRef, useEffect } from 'react';
import { useUpdateTask, useDeleteTask, useCreateTask, useReorderTasks } from '../../hooks/useTasks';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../lib/cn';
import { toast } from 'sonner';
import { priorityColors } from '../../lib/priority';
import { Flag, Pin, Check, RotateCcw, Trash2, PauseCircle, XCircle } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types/task';
import { TaskDetail } from '../tasks/TaskDetail';
import { Portal } from '../shared/Portal';

interface UnifiedLayoutProps {
  tasks: Task[];
}

export function UnifiedLayout({ tasks }: UnifiedLayoutProps) {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const reorderTasks = useReorderTasks();
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    reorderTasks.mutate(reordered.map((t, i) => ({ id: t.id, sort_order: i, parent_task_id: t.parent_task_id })));
  };

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => { if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  const [leftWidth, setLeftWidth] = useState(() => Number(localStorage.getItem('unifiedLeftWidth')) || 260);
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;
    const onMove = (ev: MouseEvent) => {
      setLeftWidth(Math.max(180, Math.min(480, startW + ev.clientX - startX)));
    };
    const onUp = () => {
      localStorage.setItem('unifiedLeftWidth', String(leftWidth));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const idx = tasks.findIndex((t) => t.id === selectedTaskId);
      if (e.key === 'ArrowDown') { e.preventDefault(); const next = Math.min(idx + 1, tasks.length - 1); if (tasks[next]) setSelectedTaskId(tasks[next].id); }
      if (e.key === 'ArrowUp') { e.preventDefault(); const next = Math.max(idx - 1, 0); if (tasks[next]) setSelectedTaskId(tasks[next].id); }
      if (e.key === 'Escape') setSelectedTaskId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tasks, selectedTaskId, setSelectedTaskId]);

  return (
    <>
    <div className="flex-1 min-h-0 flex gap-0 overflow-hidden w-full">
      {/* Left list */}
      <div className="shrink-0 flex flex-col min-h-0" style={{ width: leftWidth }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="flex-1 min-h-0 overflow-y-auto px-2">
              {tasks.map((task) => (
                <SortableItem key={task.id} task={task} isSelected={selectedTaskId === task.id}
                  onSelect={() => setSelectedTaskId(task.id)}
                  onContextMenu={(ctx) => setCtxMenu(ctx)}
                  updateTask={updateTask} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Divider */}
      <div onMouseDown={handleResizeStart}
        className="w-1.5 shrink-0 cursor-col-resize hover:bg-[#7C72F6]/30 transition-colors rounded-full mx-0.5" />

      {/* Right detail */}
      <div className="flex-1 min-w-0 overflow-y-auto px-2">
        {selectedTask ? <TaskDetail key={selectedTask.id} /> : tasks.length > 0 && (
          <div className="flex items-center justify-center h-full text-[#9CA3AF] text-sm">选择左侧任务查看详情</div>
        )}
      </div>
    </div>

    {/* Context menu */}
    {ctxMenu && (
      <Portal>
        <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
        <div ref={ctxMenuRef} style={{ left: ctxMenu.x, top: ctxMenu.y }}
          className="fixed z-[200] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-lg shadow-xl py-1 w-[160px]">
          <div className="px-3 py-1.5 text-xs text-[#6B7280] border-b border-[#F3F4F6] dark:border-white/[0.07] mb-1 truncate">{ctxMenu.task.title}</div>
          <button onClick={() => { updateTask.mutate({ id: ctxMenu.task.id, is_completed: !ctxMenu.task.is_completed }); setCtxMenu(null); }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
            {ctxMenu.task.is_completed ? <><RotateCcw size={15} className="text-[#6B7280]" /> 标记未完成</> : <><Check size={15} className="text-[#7C72F6]" /> 标记完成</>}
          </button>
          <div className="border-t border-[#F3F4F6] dark:border-white/[0.07] mt-1 pt-1">
            <button onClick={() => { const t = ctxMenu.task; setCtxMenu(null); setSelectedTaskId(null); deleteTask.mutate(t.id); toast.success(() => (<span>任务已删除 &middot; <button onClick={() => { createTask.mutate({ title: t.title, description: t.description, priority: t.priority, due_date: t.due_date || undefined, tag_id: t.tag_id || undefined, parent_task_id: t.parent_task_id || undefined }); toast.dismiss(); }} className="font-bold text-[#1B2A4A] hover:text-[#0F1A2E] rounded px-1.5 py-0.5 text-xs">撤销</button></span>), { duration: 8000 }); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-red-50 text-red-600 transition-colors">
              <Trash2 size={15} /> 删除
            </button>
          </div>
        </div>
      </Portal>
    )}
    </>
  );
}

function SortableItem({ task, isSelected, onSelect, onContextMenu, updateTask }: {
  task: Task;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu: (ctx: { x: number; y: number; task: Task }) => void;
  updateTask: ReturnType<typeof useUpdateTask>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !!useUIStore.getState().selectionMode });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const selectionMode = useUIStore((s) => s.selectionMode);
  const selectedTaskIds = useUIStore((s) => s.selectedTaskIds);
  const toggleTaskSelection = useUIStore((s) => s.toggleTaskSelection);
  const isMultiSelected = selectedTaskIds.has(task.id);
  const isSuspended = task.is_suspended;
  const isAbandoned = task.is_abandoned;

  const handleClick = () => {
    if (selectionMode) { toggleTaskSelection(task.id); return; }
    onSelect();
  };

  return (
    <div ref={setNodeRef} {...(selectionMode ? {} : attributes)} {...(selectionMode ? {} : listeners)} style={style}
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu({ x: e.clientX, y: e.clientY, task }); }}
      className={cn('px-3 py-2 rounded-lg cursor-pointer transition-colors mb-0.5 select-none',
        isDragging && 'opacity-50 z-50',
        (isSelected || isMultiSelected) ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6]' : 'hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] text-[#111827] dark:text-white/90')}>
      <div className="flex items-center gap-2">
        {selectionMode ? (
          <button onClick={(e) => { e.stopPropagation(); toggleTaskSelection(task.id); }}
            className={cn('w-[16px] h-[16px] rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
              isMultiSelected ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB]')}>
            {isMultiSelected && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
        ) : isSuspended ? (
          <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_suspended: false }); }}
            className="flex items-center justify-center flex-shrink-0 text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
            <PauseCircle size={16} />
          </button>
        ) : isAbandoned ? (
          <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_abandoned: false }); }}
            className="flex items-center justify-center flex-shrink-0 text-[#EF4444] hover:text-red-500 transition-colors">
            <XCircle size={16} />
          </button>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_completed: !task.is_completed }); }}
            className={cn('w-[16px] h-[16px] rounded-full border-[2px] flex items-center justify-center flex-shrink-0 transition-colors',
              task.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]')}>
            {task.is_completed && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
        )}
        <span className={cn('text-[13px] truncate flex-1', task.is_completed && !isAbandoned && 'line-through text-[#9CA3AF]', isSuspended && 'text-[#9CA3AF]', isAbandoned && 'line-through text-red-400/70')}>
          {task.is_pinned && <Pin size={10} className="inline mr-1 text-[#7C72F6]" />}{task.title}
        </span>
        {task.priority > 0 && <Flag size={10} className={priorityColors[task.priority]} />}
        {(task.children_count || 0) > 0 && <span className="text-[10px] text-[#9CA3AF]">{task.children_count}</span>}
      </div>
    </div>
  );
}
