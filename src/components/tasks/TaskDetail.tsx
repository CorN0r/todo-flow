import { useState, useEffect, useRef, useCallback } from 'react';
import { useTask, useUpdateTask, useDeleteTask, useCreateTask, useDuplicateTask, useReorderTasks } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';

import { useUIStore } from '../../stores/uiStore';
import { usePomodoroStore } from '../../stores/pomodoroStore';
import { isOverdue, todayISO } from '../../lib/date';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/cn';
import type { UpdateTaskInput } from '../../types/task';
import {
  Trash2, Calendar, Copy, Repeat, Tag, Flag, ChevronDown, GripVertical, Sun, SunDim, Check, Bell, BellOff, Timer,
} from 'lucide-react';
import { RichTextEditor } from '../shared/RichTextEditor';
import { RecurrencePicker } from '../shared/RecurrencePicker';
import { DatePicker } from '../shared/DatePicker';
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
import { toast } from 'sonner';



const priorityConfig: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: 'None', color: 'text-[#6B7280]', bg: 'bg-[#F3F4F6] dark:bg-white/[0.06]' },
  1: { label: 'Low', color: 'text-[#3B82F6]', bg: 'bg-[#EFF6FF] dark:bg-[#172554]' },
  2: { label: 'Medium', color: 'text-[#F59E0B]', bg: 'bg-[#FFFBEB] dark:bg-[#451A03]' },
  3: { label: 'High', color: 'text-[#F97316]', bg: 'bg-[#FFF7ED] dark:bg-[#431407]' },
  4: { label: 'Urgent', color: 'text-[#EF4444]', bg: 'bg-[#FEF2F2] dark:bg-[#450A0A]' },
};

interface LocalState {
  title: string;
  description: string;
  priority: number;
  due_date: string;
  reminder: string;
  tag_id: string;
  recurrence: string;
  is_completed: boolean;
}

export function TaskDetail() {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const { data: detail, isLoading } = useTask(selectedTaskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const startPomodoro = usePomodoroStore((s) => s.startTimer);
  const createTask = useCreateTask();
  const duplicateTask = useDuplicateTask();
  const reorderTasks = useReorderTasks();
  const { data: tags } = useTags();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [local, setLocal] = useState<LocalState | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalRef = useRef<LocalState | null>(null);
  const taskRef = useRef(detail?.task);
  const mutateRef = useRef(updateTask.mutate);
  useEffect(() => { mutateRef.current = updateTask.mutate; });

  // Keep taskRef up to date
  useEffect(() => {
    if (detail) taskRef.current = detail.task;
  });

  // Sync local state when task loads or changes
  useEffect(() => {
    if (detail) {
      const next = {
        title: detail.task.title,
        description: detail.task.description,
        priority: detail.task.priority,
        due_date: detail.task.due_date || '',
        reminder: detail.task.reminder || '',
        tag_id: detail.task.tag_id || '',
        recurrence: detail.task.recurrence || '',
        is_completed: detail.task.is_completed,
      };
      setLocal(next); // eslint-disable-line react-hooks/set-state-in-effect
      originalRef.current = next;
      setSaveStatus('idle');
    }
  }, [detail?.task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSave = useCallback((currentLocal: LocalState) => {
    const task = taskRef.current;
    if (!task) return;
    const input: UpdateTaskInput = { id: task.id };
    if (currentLocal.title !== task.title) input.title = currentLocal.title;
    if (currentLocal.priority !== task.priority) input.priority = currentLocal.priority;
    if (currentLocal.due_date !== (task.due_date || '')) input.due_date = currentLocal.due_date || undefined;
    if (currentLocal.reminder !== (task.reminder || '')) input.reminder = currentLocal.reminder || undefined;
    if (currentLocal.tag_id !== (task.tag_id || '')) input.tag_id = currentLocal.tag_id || undefined;
    if (currentLocal.recurrence !== (task.recurrence || '')) input.recurrence = currentLocal.recurrence || undefined;

    if (Object.keys(input).length === 1) {
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('saving');
    mutateRef.current(input, {
      onSuccess: () => {
        setSaveStatus('saved');
        originalRef.current = currentLocal;
      },
      onError: () => {
        setSaveStatus('idle');
        toast.error('Failed to save changes');
      },
    });
  }, []);

  // Auto-save debounce: fires 800ms after last change
  useEffect(() => {
    if (!local || !originalRef.current) return;
    const orig = originalRef.current;
    const hasChanges =
      local.title !== orig.title ||
      local.priority !== orig.priority ||
      local.due_date !== orig.due_date ||
      local.reminder !== orig.reminder ||
      local.tag_id !== orig.tag_id ||
      local.recurrence !== orig.recurrence;

    if (!hasChanges) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      doSave(local);
    }, 800);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        doSave(local);
      }
    };
  }, [local, doSave]);

  const update = (patch: Partial<LocalState>) => {
    setLocal((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const saveDescription = (html: string) => {
    const task = taskRef.current;
    if (!task) return;
    setSaveStatus('saving');
    mutateRef.current({ id: task.id, description: html }, {
      onSuccess: () => {
        setSaveStatus('saved');
        setLocal((prev) => prev ? { ...prev, description: html } : null);
      },
      onError: () => {
        setSaveStatus('idle');
        toast.error('Failed to save description');
      },
    });
  };

  if (!selectedTaskId) return null;
  if (isLoading) return <p className="text-sm text-[#9CA3AF] py-8 text-center">Loading...</p>;
  if (!detail || !local) return <p className="text-sm text-[#9CA3AF] py-8 text-center">Task not found</p>;

  const { task, children } = detail;

  const handleDelete = () => {
    const deletedTask = task;
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        setSelectedTaskId(null);
        toast('Task deleted', {
          action: {
            label: 'Undo',
            onClick: () => {
              createTask.mutate({
                title: deletedTask.title,
                description: deletedTask.description,
                priority: deletedTask.priority,
                due_date: deletedTask.due_date || undefined,
                tag_id: deletedTask.tag_id || undefined,
                parent_task_id: deletedTask.parent_task_id || undefined,
              });
            },
          },
        });
      },
    });
  };

  const toggleComplete = () => {
    const next = !local.is_completed;
    updateTask.mutate({ id: task.id, is_completed: next });
    setLocal((prev) => (prev ? { ...prev, is_completed: next } : null));
  };

  const priorityInfo = priorityConfig[local.priority] || priorityConfig[0];
  const taskTag = tags?.find((t) => t.id === local.tag_id);

  const handleSubtaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = children.findIndex((c) => c.id === active.id);
    const newIndex = children.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(children, oldIndex, newIndex);
    reorderTasks.mutate(reordered.map((c, i) => ({ id: c.id, sort_order: i, parent_task_id: c.parent_task_id })));
  };

  return (
    <div className="space-y-6">
      {/* ---- Completion toggle + Title ---- */}
      <div className="flex items-start gap-4">
        <button
          onClick={toggleComplete}
          className={cn(
            'w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-all duration-200',
            local.is_completed
              ? 'bg-[#7C72F6] border-[#7C72F6] text-white'
              : 'border-[#D1D5DB] hover:border-[#7C72F6] hover:bg-[#7C72F6]/[0.06]',
          )}
        >
          {local.is_completed && (
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <input
            value={local.title}
            onChange={(e) => update({ title: e.target.value })}
            className={cn(
              'w-full text-xl font-bold bg-transparent border-b-2 border-transparent hover:border-[#D1D5DB] focus:border-[#7C72F6] outline-none pb-0.5 transition-colors',
              local.is_completed && 'line-through text-[#9CA3AF]',
            )}
            placeholder="Task title"
          />
        </div>
      </div>

      {/* ---- Description ---- */}
      <div>
        <label className="section-label mb-3 block">Description</label>
        <RichTextEditor
          value={local.description}
          onChange={(html) => setLocal((prev) => prev ? { ...prev, description: html } : null)}
          onSave={saveDescription}
          placeholder="输入内容，支持粘贴图片..."
        />
      </div>

      {/* ---- Properties ---- */}
      <div>
        <label className="section-label mb-3 block">
          Properties
        </label>
        <div className="space-y-1.5">
          {/* Priority */}
          <div className="flex items-center gap-3 p-3 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] transition-colors group">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', priorityInfo.bg)}>
              <Flag size={16} className={priorityInfo.color} />
            </div>
            <span className="text-xs font-medium text-[#6B7280] w-16">Priority</span>
            <select
              value={local.priority}
              onChange={(e) => update({ priority: Number(e.target.value) })}
              className={cn(
                'flex-1 text-sm font-medium bg-transparent outline-none cursor-pointer appearance-none',
                local.priority > 0 && priorityInfo.color,
              )}
            >
              {Object.entries(priorityConfig).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="text-[#6B7280]" />
          </div>

          {/* Tag */}
          <div className="flex items-center gap-3 p-3 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] transition-colors">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: taskTag?.color || '#888' }}
            >
              <Tag size={16} style={{ color: '#fff' }} />
            </div>
            <span className="text-xs font-medium text-[#6B7280] w-16">Tag</span>
            <select
              value={local.tag_id}
              onChange={(e) => update({ tag_id: e.target.value })}
              className="flex-1 text-sm font-medium bg-transparent outline-none cursor-pointer appearance-none"
            >
              <option value="">No tag</option>
              {tags?.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="text-[#6B7280]" />
          </div>

          {/* Due date */}
          <div className="flex items-center gap-3 p-3 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] transition-colors">
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              isOverdue(local.due_date)
                ? 'bg-red-50 dark:bg-red-950'
                : 'bg-violet-50 dark:bg-violet-950',
            )}>
              <Calendar size={16} className={isOverdue(local.due_date) ? 'text-red-500' : 'text-violet-500'} />
            </div>
            <span className="text-xs font-medium text-[#6B7280] w-16">Due date</span>
            <DatePicker
              value={local.due_date}
              onChange={(val) => update({ due_date: val })}
            />
          </div>

          {/* Reminder */}
          <div className="flex items-center gap-3 p-3 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] transition-colors group">
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              local.reminder ? 'bg-blue-50 dark:bg-blue-950' : 'bg-[#F3F4F6] dark:bg-white/[0.06]',
            )}>
              {local.reminder ? (
                <Bell size={16} className="text-blue-500" />
              ) : (
                <BellOff size={16} className="text-[#6B7280]" />
              )}
            </div>
            <span className="text-xs font-medium text-[#6B7280] w-16">Reminder</span>
            <input
              type="datetime-local"
              value={local.reminder}
              onChange={(e) => update({ reminder: e.target.value })}
              className="flex-1 text-sm bg-transparent outline-none cursor-pointer"
            />
            {local.reminder && (
              <button
                onClick={() => update({ reminder: '' })}
                className="text-[#6B7280] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {/* Recurrence */}
          <div className="flex items-center gap-3 p-3 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] transition-colors">
            <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center">
              <Repeat size={16} className="text-violet-500" />
            </div>
            <span className="text-xs font-medium text-[#6B7280] w-16">Repeat</span>
            <RecurrencePicker
              value={local.recurrence}
              onChange={(val) => update({ recurrence: val })}
            />
          </div>
        </div>
      </div>

      {/* ---- Subtasks ---- */}
      <div>
        <label className="section-label mb-3 flex items-center gap-2">
          Subtasks
          {children.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.08] text-[10px] font-bold text-[#6B7280] px-1.5">
              {children.length}
            </span>
          )}
        </label>
        {children.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskDragEnd}>
            <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1 mb-3 ml-6 border-l-2 border-[#F3F4F6] dark:border-white/[0.06] pl-4">
                <AnimatePresence>
                  {children.map((child) => (
                    <SortableSubtask
                      key={child.id}
                      child={child}
                      onToggle={() => updateTask.mutate({ id: child.id, is_completed: !child.is_completed })}
                      onDelete={() => deleteTask.mutate(child.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* ---- Actions bar ---- */}
      <div className="pt-4 border-t border-[#F3F4F6] dark:border-white/[0.06] space-y-3">
        {/* Auto-save status */}
        <div className="flex items-center justify-center">
          <span className={cn(
            'text-[11px] transition-all duration-300 flex items-center gap-1.5',
            saveStatus === 'saved' ? 'text-[#7C72F6] opacity-100' :
            saveStatus === 'saving' ? 'text-[#6B7280] opacity-100' :
            'opacity-0',
          )}>
            {saveStatus === 'saved' ? (
              <><Check size={12} /> Saved</>
            ) : saveStatus === 'saving' ? (
              'Saving...'
            ) : null}
          </span>
        </div>

        {/* Secondary actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#EF4444] transition-colors px-2 py-1.5 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-red-950/30"
          >
            <Trash2 size={14} />
            Delete
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const isMyDay = task.my_day_date === todayISO();
                updateTask.mutate({ id: task.id, my_day_date: isMyDay ? null : todayISO() });
              }}
              className={cn(
                'flex items-center gap-1.5 text-[12px] transition-colors px-2 py-1.5 rounded-lg',
                task.my_day_date === todayISO()
                  ? 'text-[#F59E0B] bg-[#FFFBEB] dark:bg-amber-950/30'
                  : 'text-[#6B7280] hover:text-[#F59E0B] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]',
              )}
            >
              {task.my_day_date === todayISO() ? <SunDim size={14} /> : <Sun size={14} />}
              My Day
            </button>
            <button
              onClick={() => startPomodoro(task.id, task.title)}
              className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#7C72F6] transition-colors px-2 py-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]"
            >
              <Timer size={14} />
              Focus
            </button>
            <button
              onClick={() => duplicateTask.mutate(task.id)}
              className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#374151] dark:hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]"
            >
              <Copy size={14} />
              Duplicate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableSubtask({ child, onToggle, onDelete }: {
  child: { id: string; title: string; is_completed: boolean };
  onToggle: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: child.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        'flex items-center gap-2 py-1.5 px-2 rounded-[8px] group/subtask',
        isDragging && 'opacity-50 bg-[#F3F4F6] dark:bg-white/[0.06]',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-0.5 text-[#D1D5DB] opacity-0 group-hover/subtask:opacity-100 hover:text-[#6B7280] dark:hover:text-white cursor-grab active:cursor-grabbing transition-opacity"
      >
        <GripVertical size={12} />
      </button>
      <button
        onClick={onToggle}
        className={cn(
          'w-[18px] h-[18px] rounded-full border-[2px] flex items-center justify-center flex-shrink-0 transition-colors',
          child.is_completed
            ? 'bg-[#7C72F6] border-[#7C72F6] text-white'
            : 'border-[#D1D5DB] hover:border-[#7C72F6]',
        )}
      >
        {child.is_completed && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span
        className={cn(
          'text-[13px] flex-1 truncate',
          child.is_completed && 'line-through text-[#9CA3AF]',
          !child.is_completed && 'text-[#111827] dark:text-white/90',
        )}
      >
        {child.title}
      </span>
      <button
        onClick={onDelete}
        className="p-1 text-[#D1D5DB] opacity-0 group-hover/subtask:opacity-100 hover:text-[#EF4444] transition-all"
      >
        <Trash2 size={12} />
      </button>
    </motion.div>
  );
}
