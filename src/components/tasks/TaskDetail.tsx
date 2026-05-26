import { useState, useEffect, useRef, useCallback } from 'react';
import { useTask, useUpdateTask, useDeleteTask, useCreateTask, useDuplicateTask, useReorderTasks } from '../../hooks/useTasks';
import { useLists } from '../../hooks/useLists';
import { useTags, useCreateTag } from '../../hooks/useTags';
import { useUIStore } from '../../stores/uiStore';
import { isOverdue, todayISO } from '../../lib/date';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/cn';
import type { UpdateTaskInput, Tag } from '../../types/task';
import {
  Trash2, Calendar, Copy, Repeat, List, Flag, ChevronDown, GripVertical, X, TagIcon, Sun, SunDim, Check, Bell, BellOff, Eye, Pencil,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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
import { TaskQuickAdd } from './TaskQuickAdd';
import { AttachmentZone } from '../attachments/AttachmentZone';

const priorityConfig: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: 'None', color: 'text-muted-foreground', bg: 'bg-muted' },
  1: { label: 'Low', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
  2: { label: 'Medium', color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950' },
  3: { label: 'High', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950' },
  4: { label: 'Urgent', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950' },
};

interface LocalState {
  title: string;
  description: string;
  priority: number;
  due_date: string;
  reminder: string;
  list_id: string;
  recurrence: string;
  is_completed: boolean;
  tag_ids: string[];
}

export function TaskDetail() {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const { data: detail, isLoading } = useTask(selectedTaskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const duplicateTask = useDuplicateTask();
  const reorderTasks = useReorderTasks();
  const { data: lists } = useLists();
  const { data: allTags } = useTags();
  const createTag = useCreateTag();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [local, setLocal] = useState<LocalState | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [newTagName, setNewTagName] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [descPreview, setDescPreview] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalRef = useRef<LocalState | null>(null);
  const taskRef = useRef(detail?.task);

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
        list_id: detail.task.list_id || '',
        recurrence: detail.task.recurrence || '',
        is_completed: detail.task.is_completed,
        tag_ids: (detail.task.tags || []).map((t: Tag) => t.id),
      };
      setLocal(next);
      originalRef.current = next;
      setSaveStatus('idle');
    }
  }, [detail?.task.id]);

  const doSave = useCallback((currentLocal: LocalState) => {
    const task = taskRef.current;
    if (!task) return;
    const input: UpdateTaskInput = { id: task.id };
    if (currentLocal.title !== task.title) input.title = currentLocal.title;
    if (currentLocal.description !== task.description) input.description = currentLocal.description;
    if (currentLocal.priority !== task.priority) input.priority = currentLocal.priority;
    if (currentLocal.due_date !== (task.due_date || '')) input.due_date = currentLocal.due_date || undefined;
    if (currentLocal.reminder !== (task.reminder || '')) input.reminder = currentLocal.reminder || undefined;
    if (currentLocal.list_id !== (task.list_id || '')) input.list_id = currentLocal.list_id || undefined;
    if (currentLocal.recurrence !== (task.recurrence || '')) input.recurrence = currentLocal.recurrence || undefined;
    const origTagIds = (task.tags || []).map((t: Tag) => t.id).sort().join(',');
    const newTagIds = [...currentLocal.tag_ids].sort().join(',');
    if (origTagIds !== newTagIds) input.tags = currentLocal.tag_ids.length > 0 ? currentLocal.tag_ids : [];

    if (Object.keys(input).length === 1) {
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('saving');
    updateTask.mutate(input, {
      onSuccess: () => {
        setSaveStatus('saved');
        originalRef.current = currentLocal;
      },
      onError: () => {
        setSaveStatus('idle');
        toast.error('Failed to save changes');
      },
    });
  }, [updateTask]);

  // Auto-save debounce: fires 800ms after last change
  useEffect(() => {
    if (!local || !originalRef.current) return;
    const orig = originalRef.current;
    const hasChanges =
      local.title !== orig.title ||
      local.description !== orig.description ||
      local.priority !== orig.priority ||
      local.due_date !== orig.due_date ||
      local.reminder !== orig.reminder ||
      local.list_id !== orig.list_id ||
      local.recurrence !== orig.recurrence ||
      [...local.tag_ids].sort().join(',') !== [...orig.tag_ids].sort().join(',');

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

  if (!selectedTaskId) return null;
  if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>;
  if (!detail || !local) return <p className="text-sm text-muted-foreground py-8 text-center">Task not found</p>;

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
                list_id: deletedTask.list_id || undefined,
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
  const taskList = lists?.find((l) => l.id === local.list_id);

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
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-muted-foreground hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950',
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
              'w-full text-xl font-bold bg-transparent border-b-2 border-transparent hover:border-muted-foreground focus:border-primary outline-none pb-0.5 transition-colors',
              local.is_completed && 'line-through text-muted-foreground',
            )}
            placeholder="Task title"
          />
        </div>
      </div>

      {/* ---- Description ---- */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Description
          </label>
          {local.description && (
            <button
              onClick={() => setDescPreview(!descPreview)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
            >
              {descPreview ? (
                <><Pencil size={12} /> Edit</>
              ) : (
                <><Eye size={12} /> Preview</>
              )}
            </button>
          )}
        </div>
        {descPreview ? (
          <div className="text-sm bg-muted border border-border rounded-xl p-4 min-h-[80px] prose prose-sm dark:prose-invert max-w-none">
            {local.description ? (
              <ReactMarkdown>{local.description}</ReactMarkdown>
            ) : (
              <span className="text-muted-foreground">Nothing to preview</span>
            )}
          </div>
        ) : (
          <textarea
            value={local.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Add notes, details, or anything helpful... Markdown supported."
            className="w-full text-sm bg-muted border border-border rounded-xl p-4 resize-none outline-none focus:border-primary focus:bg-muted transition-colors min-h-[80px] placeholder:text-muted-foreground"
            rows={3}
          />
        )}
      </div>

      {/* ---- Properties ---- */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
          Properties
        </label>
        <div className="space-y-2">
          {/* Priority */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border hover:border-border transition-colors group">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', priorityInfo.bg)}>
              <Flag size={16} className={priorityInfo.color} />
            </div>
            <span className="text-xs font-medium text-muted-foreground w-16">Priority</span>
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
            <ChevronDown size={14} className="text-muted-foreground" />
          </div>

          {/* List */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border hover:border-border transition-colors">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: taskList?.color || '#888' }}
            >
              <List size={16} style={{ color: '#fff' }} />
            </div>
            <span className="text-xs font-medium text-muted-foreground w-16">List</span>
            <select
              value={local.list_id}
              onChange={(e) => update({ list_id: e.target.value })}
              className="flex-1 text-sm font-medium bg-transparent outline-none cursor-pointer appearance-none"
            >
              <option value="">No list</option>
              {lists?.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="text-muted-foreground" />
          </div>

          {/* Due date */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border hover:border-border transition-colors">
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              isOverdue(local.due_date)
                ? 'bg-red-50 dark:bg-red-950'
                : 'bg-violet-50 dark:bg-violet-950',
            )}>
              <Calendar size={16} className={isOverdue(local.due_date) ? 'text-red-500' : 'text-violet-500'} />
            </div>
            <span className="text-xs font-medium text-muted-foreground w-16">Due date</span>
            <DatePicker
              value={local.due_date}
              onChange={(val) => update({ due_date: val })}
            />
          </div>

          {/* Reminder */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border hover:border-border transition-colors group">
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              local.reminder ? 'bg-blue-50 dark:bg-blue-950' : 'bg-muted',
            )}>
              {local.reminder ? (
                <Bell size={16} className="text-blue-500" />
              ) : (
                <BellOff size={16} className="text-muted-foreground" />
              )}
            </div>
            <span className="text-xs font-medium text-muted-foreground w-16">Reminder</span>
            <input
              type="datetime-local"
              value={local.reminder}
              onChange={(e) => update({ reminder: e.target.value })}
              className="flex-1 text-sm bg-transparent outline-none cursor-pointer"
            />
            {local.reminder && (
              <button
                onClick={() => update({ reminder: '' })}
                className="text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {/* Recurrence */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border hover:border-border transition-colors">
            <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center">
              <Repeat size={16} className="text-teal-500" />
            </div>
            <span className="text-xs font-medium text-muted-foreground w-16">Repeat</span>
            <RecurrencePicker
              value={local.recurrence}
              onChange={(val) => update({ recurrence: val })}
            />
          </div>

          {/* Tags */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted border border-border hover:border-border transition-colors">
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center flex-shrink-0">
              <TagIcon size={16} className="text-amber-500" />
            </div>
            <span className="text-xs font-medium text-muted-foreground w-16 mt-1.5">Tags</span>
            <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
              {local.tag_ids.map((tagId) => {
                const tag = allTags?.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <span key={tag.id} className="text-xs px-2 py-1 rounded-full font-medium inline-flex items-center gap-1.5"
                    style={{ backgroundColor: tag.color, color: 'white' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                    <button onClick={() => update({ tag_ids: local.tag_ids.filter((id) => id !== tagId) })}
                      className="hover:opacity-70 transition-opacity">
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
              {showNewTagInput ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTagName.trim()) {
                        createTag.mutate(
                          { name: newTagName.trim(), color: '#6366f1' },
                          {
                            onSuccess: (newTag) => {
                              update({ tag_ids: [...local.tag_ids, newTag.id] });
                              setNewTagName('');
                              setShowNewTagInput(false);
                            },
                          },
                        );
                      }
                      if (e.key === 'Escape') {
                        setNewTagName('');
                        setShowNewTagInput(false);
                      }
                    }}
                    placeholder="Tag name..."
                    className="text-xs px-1.5 py-0.5 rounded border bg-background outline-none focus:ring-1 focus:ring-primary w-24"
                  />
                  <button onClick={() => { setNewTagName(''); setShowNewTagInput(false); }}
                    className="text-muted-foreground hover:text-foreground">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <select
                  value=""
                  onChange={(e) => {
                    const tagId = e.target.value;
                    if (tagId === '__new__') {
                      setShowNewTagInput(true);
                    } else if (tagId && !local.tag_ids.includes(tagId)) {
                      update({ tag_ids: [...local.tag_ids, tagId] });
                    }
                    e.target.value = '';
                  }}
                  className="text-xs bg-transparent outline-none cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <option value="">+ Add tag</option>
                  {allTags?.filter((t) => !local.tag_ids.includes(t.id)).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                  <option value="__new__">+ Create new tag</option>
                </select>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Subtasks ---- */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          Subtasks
          {children.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
              {children.length}
            </span>
          )}
        </label>
        {children.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskDragEnd}>
            <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1 mb-3 ml-6 border-l-2 border-muted pl-4">
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
        <div className="ml-6">
          <TaskQuickAdd parentTaskId={task.id} placeholder="Add a subtask..." />
        </div>
      </div>

      {/* ---- Attachments ---- */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
          Attachments
        </label>
        <AttachmentZone taskId={task.id} />
      </div>

      {/* ---- Actions bar ---- */}
      <div className="pt-4 border-t border-border space-y-3">
        {/* Auto-save status */}
        <div className="flex items-center justify-center">
          <span className={cn(
            'text-xs transition-all duration-300 flex items-center gap-1.5',
            saveStatus === 'saved' ? 'text-emerald-500 opacity-100' :
            saveStatus === 'saving' ? 'text-muted-foreground opacity-100' :
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
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950"
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
                'flex items-center gap-1.5 text-xs transition-colors px-2 py-1.5 rounded-lg',
                task.my_day_date === todayISO()
                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100'
                  : 'text-muted-foreground hover:text-amber-500 hover:bg-muted',
              )}
            >
              {task.my_day_date === todayISO() ? <SunDim size={14} /> : <Sun size={14} />}
              {task.my_day_date === todayISO() ? 'My Day' : 'My Day'}
            </button>
            <button
              onClick={() => duplicateTask.mutate(task.id)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted"
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
        'flex items-center gap-2 py-1.5 px-2 rounded-md group/subtask',
        isDragging && 'opacity-50 bg-accent',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-0.5 text-muted-foreground opacity-0 group-hover/subtask:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing transition-opacity"
      >
        <GripVertical size={12} />
      </button>
      <button
        onClick={onToggle}
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
          child.is_completed
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground hover:border-primary',
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
          'text-sm flex-1 truncate',
          child.is_completed && 'line-through text-muted-foreground',
        )}
      >
        {child.title}
      </span>
      <button
        onClick={onDelete}
        className="p-1 text-muted-foreground opacity-0 group-hover/subtask:opacity-100 hover:text-red-500 transition-all"
      >
        <Trash2 size={12} />
      </button>
    </motion.div>
  );
}
