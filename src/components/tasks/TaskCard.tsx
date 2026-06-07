import { useState, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { toast } from 'sonner';
import type { Task } from '../../types/task';
import { formatDate, isOverdue } from '../../lib/date';
import { Calendar, Flag, Check, RotateCcw, Trash2, Copy, Sun, SunDim, Plus, ChevronRight, ChevronDown, X, PauseCircle, Play, XCircle, Pin } from 'lucide-react';
import { useUpdateTask, useDeleteTask, useCreateTask, useReorderTasks } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { useUIStore } from '../../stores/uiStore';
import { todayISO } from '../../lib/date';
import { priorityColors, priorityLabels, hexToRgba } from '../../lib/priority';
import { Portal } from '../shared/Portal';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableSubtaskRow({ child, onToggle, onDelete }: {
  child: Task; onToggle: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: child.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={style}
      className={cn(isDragging && 'opacity-50 z-50', 'cursor-grab active:cursor-grabbing [&_button]:cursor-pointer')}>
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
        isDragging ? 'bg-white dark:bg-[#1e1e32] border-[#7C72F6] shadow-lg'
        : 'bg-[#F8F8FB] dark:bg-white/[0.025] border-[#F3F4F6] dark:border-white/[0.04] hover:border-[#E5E7EB] dark:hover:border-white/[0.08]')}>
        <button onClick={onToggle} className={cn('w-[18px] h-[18px] rounded-full border-[2px] flex items-center justify-center flex-shrink-0 transition-colors',
          child.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]')}>
          {child.is_completed && (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        <SubtaskContent child={child} onDelete={onDelete} />
      </div>
    </div>
  );
}

function SubtaskContent({ child, onDelete }: { child: Task; onDelete: () => void }) {
  const updateTask = useUpdateTask();
  const [subMenu, setSubMenu] = useState<{ x: number; y: number } | null>(null);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(child.title);

  useEffect(() => {
    if (editing) setTimeout(() => {
      const el = document.getElementById(`subtask-input-${child.id}`) as HTMLInputElement;
      el?.focus(); el?.select();
    }, 0);
  }, [editing, child.id]);

  useEffect(() => {
    if (!subMenu) return;
    const close = (e: MouseEvent) => { if (subMenuRef.current && !subMenuRef.current.contains(e.target as Node)) setSubMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [subMenu]);

  return (
    <>
      <div className="flex-1 flex items-center gap-1.5 min-w-0"
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSubMenu({ x: e.clientX, y: e.clientY }); }}>
        {editing ? (
          <input id={`subtask-input-${child.id}`} value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { const t = val.trim(); if (t) updateTask.mutate({ id: child.id, title: t }); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
            onBlur={() => setEditing(false)}
            className="flex-1 text-[13px] px-1 py-0.5 rounded bg-[#F3F4F6] dark:bg-white/[0.08] outline-none ring-1 ring-[#7C72F6]/40 text-[#111827] dark:text-white/90" />
        ) : (
          <span className={cn('text-[13px] truncate cursor-text', child.is_completed && 'line-through text-[#9CA3AF]', !child.is_completed && 'text-[#111827] dark:text-white/90')}
            onClick={() => { setVal(child.title); setEditing(true); }}
            title="点击编辑标题">{child.title}</span>
        )}
      </div>
      {subMenu && (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => setSubMenu(null)} />
          <div ref={subMenuRef} style={{ left: subMenu.x, top: subMenu.y }}
            className="fixed z-[200] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-lg shadow-xl py-1 min-w-[160px]">
            <div className="px-3 py-1.5 text-xs text-[#6B7280] border-b border-[#F3F4F6] dark:border-white/[0.07] mb-1 truncate">{child.title}</div>
            <button onClick={() => { updateTask.mutate({ id: child.id, is_completed: !child.is_completed }); setSubMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {child.is_completed ? <><RotateCcw size={15} className="text-[#6B7280]" /> 标记未完成</> : <><Check size={15} className="text-[#7C72F6]" /> 标记完成</>}
            </button>
            <button onClick={() => { updateTask.mutate({ id: child.id, is_suspended: !child.is_suspended, is_abandoned: false }); setSubMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {child.is_suspended ? <><Play size={15} className="text-[#6B7280]" /> 恢复</> : <><PauseCircle size={15} className="text-[#6B7280]" /> 挂起</>}
            </button>
            <button onClick={() => { updateTask.mutate({ id: child.id, is_abandoned: !child.is_abandoned, is_suspended: false }); setSubMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {child.is_abandoned ? <><RotateCcw size={15} className="text-[#6B7280]" /> 重新激活</> : <><XCircle size={15} className="text-[#EF4444]" /> 放弃</>}
            </button>
            <button onClick={() => { navigator.clipboard.writeText(child.title); toast.success('已复制标题'); setSubMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              <Copy size={15} className="text-[#6B7280]" /> 复制标题
            </button>
            <div className="border-t border-[#F3F4F6] dark:border-white/[0.07] mt-1 pt-1">
              <button onClick={() => { onDelete(); setSubMenu(null); }}
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

export function TaskCard({ task, depth = 0 }: { task: Task; depth?: number }) {
  const { t: _t } = useTranslation();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const reorderTasks = useReorderTasks();
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const selectedTaskIds = useUIStore((s) => s.selectedTaskIds);
  const toggleTaskSelection = useUIStore((s) => s.toggleTaskSelection);
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const isSelected = selectedTaskIds.has(task.id);
  const isSuspended = task.is_suspended;
  const isAbandoned = task.is_abandoned;
  const overdue = !isSuspended && !isAbandoned && isOverdue(task.due_date);
  const { data: tags } = useTags();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [subtaskExpanded, setSubtaskExpanded] = useState(false);
  const globalSubtasksExpanded = useUIStore((s) => s.globalSubtasksExpanded);

  useEffect(() => {
    setSubtaskExpanded(globalSubtasksExpanded);
  }, [globalSubtasksExpanded]);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle) setTimeout(() => { editInputRef.current?.focus(); editInputRef.current?.select(); }, 0);
  }, [editingTitle]);

  useEffect(() => {
    if (addingSubtask) { setSubtaskExpanded(true); setTimeout(() => subtaskInputRef.current?.focus(), 0); }
  }, [addingSubtask]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const tagMap = useMemo(() => {
    if (!tags) return new Map();
    return new Map(tags.map((t) => [t.id, t]));
  }, [tags]);
  const taskTag = task.tag_id ? tagMap.get(task.tag_id) : undefined;

  const children = task.children || [];
  const hasChildren = children.length > 0;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const menuW = 180, menuH = 250;
    let x = e.clientX, y = e.clientY;
    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
    setContextMenu({ x, y });
  };

  const handleToggleComplete = () => {
    const next = !task.is_completed;
    updateTask.mutate({ id: task.id, is_completed: next });
    toast.success(next ? '任务已完成' : '已重新打开');
    setContextMenu(null);
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    if (selectionMode) return;
    e.stopPropagation();
    setEditTitleValue(task.title);
    setEditingTitle(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editTitleValue.trim();
    if (trimmed && trimmed !== task.title) updateTask.mutate({ id: task.id, title: trimmed });
    setEditingTitle(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); }
    if (e.key === 'Escape') setEditingTitle(false);
  };

  const subtaskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleSubtaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = children.findIndex((c) => c.id === active.id);
    const newIndex = children.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(children, oldIndex, newIndex);
    reorderTasks.mutate(reordered.map((c, i) => ({ id: c.id, sort_order: i, parent_task_id: task.id })));
  };

  return (
    <>
      <div onContextMenu={handleContextMenu} className={cn(
        'flex flex-col group select-none',
        !isGlass && 'bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06]',
        !isGlass && task.is_completed && 'opacity-75 bg-[#FAFAFA] dark:bg-white/[0.02]',
        !isGlass && isAbandoned && 'bg-[#FEF2F2] dark:bg-red-950/30',
        !isGlass && isSuspended && 'bg-[#F3F4F6] dark:bg-white/[0.05]',
        !isGlass && overdue && !task.is_completed && 'bg-[#FFF7ED] dark:bg-orange-950/20',
        isGlass && 'glass-card',
        isSelected && 'ring-2 ring-[#7C72F6] ring-inset',
      )} style={{
        padding: '14px 16px',
        borderRadius: '10px',
        boxShadow: isGlass ? undefined : 'var(--card-shadow)',
        borderLeftWidth: (isAbandoned || isSuspended || overdue) ? '3px' : undefined,
        borderLeftColor: isAbandoned ? '#EF4444' : isSuspended ? '#9CA3AF' : overdue ? '#F97316' : undefined,
        borderLeftStyle: (isAbandoned || isSuspended || overdue) ? 'solid' : undefined,
      }}>
        <div className="flex items-center gap-3">
          {selectionMode ? (
            <button onClick={(e) => { e.stopPropagation(); toggleTaskSelection(task.id); }}
              className={cn('w-5 h-5 rounded-[5px] border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                isSelected ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]')}
              aria-label={isSelected ? `取消选择 "${task.title}"` : `选择 "${task.title}"`}>
              {isSelected && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          ) : isSuspended ? (
            <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_suspended: false }); }}
              className="flex items-center justify-center flex-shrink-0 text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              aria-label={`恢复 "${task.title}"`}>
              <PauseCircle size={20} />
            </button>
          ) : isAbandoned ? (
            <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_abandoned: false }); }}
              className="flex items-center justify-center flex-shrink-0 text-[#EF4444] hover:text-red-500 transition-colors"
              aria-label={`重新激活 "${task.title}"`}>
              <XCircle size={20} />
            </button>
          ) : (
          <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_completed: !task.is_completed }); }}
            className={cn('w-5 h-5 rounded-full border-[2px] flex items-center justify-center flex-shrink-0 transition-all duration-200',
              task.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6] hover:bg-[#7C72F6]/[0.06]')}
            aria-label={task.is_completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}>
            {task.is_completed && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          )}
          {hasChildren && (
            <button onClick={(e) => { e.stopPropagation(); setSubtaskExpanded(!subtaskExpanded); }}
              className="text-[#6B7280] hover:text-[#111827] dark:hover:text-white/90 transition-colors flex-shrink-0 flex items-center gap-0.5"
              aria-label={subtaskExpanded ? '收起子任务' : '展开子任务'}>
              {subtaskExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="text-[11px] tabular-nums">{children.filter((c) => c.is_completed).length}/{children.length}</span>
            </button>
          )}
          <div className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer select-none"
            onClick={() => { if (selectionMode) { toggleTaskSelection(task.id); } else { setSelectedTaskId(task.id); } }}
            role="button" tabIndex={0} draggable={!selectionMode}
            onDragStart={(e) => { if (selectionMode) return; e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; }}
            onKeyDown={(e) => { if (e.key === 'Enter') setSelectedTaskId(task.id); }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {editingTitle ? (
                  <input ref={editInputRef} value={editTitleValue} onChange={(e) => setEditTitleValue(e.target.value)}
                    onKeyDown={handleEditKeyDown} onBlur={handleSaveEdit} onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-[120px] text-[14px] font-medium px-1.5 py-0.5 rounded-md bg-[#F3F4F6] dark:bg-white/[0.08] outline-none ring-2 ring-[#7C72F6]/40 text-[#111827] dark:text-white/90" />
                ) : (
                  <span className="flex items-center gap-1 min-w-0" onClick={handleStartEdit} title="点击编辑标题">
                    {task.is_pinned && <Pin size={13} className="text-[#7C72F6] flex-shrink-0" />}
                    <span className={cn('text-[14px] font-medium truncate cursor-text',
                        isAbandoned && 'line-through text-red-400/70',
                        isSuspended && 'text-[#9CA3AF]',
                        task.is_completed && !isAbandoned && 'line-through text-[#9CA3AF]',
                        !task.is_completed && !isSuspended && !isAbandoned && 'text-[#111827] dark:text-white/90')}>{task.title}</span>
                  </span>
                )}
                {taskTag && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={{ backgroundColor: hexToRgba(taskTag.color, 0.15), color: taskTag.color }}>{taskTag.name}</span>
                )}
              </div>
              {task.description && <p className="text-[12px] text-[#9CA3AF] truncate mt-0.5">{task.description}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {task.my_day_date === todayISO() && <span className="text-amber-500" title="我的一天"><Sun size={14} /></span>}
              {task.priority > 0 && <span className={cn('text-sm', priorityColors[task.priority])} title={priorityLabels[task.priority]}><Flag size={14} /></span>}
              {task.due_date && (
                <span className={cn('text-[12px] flex items-center gap-1 shrink-0', overdue ? 'text-red-500' : 'text-[#9CA3AF]')}>
                  <Calendar size={12} />{formatDate(task.due_date)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Subtasks */}
        {(hasChildren || addingSubtask) && subtaskExpanded && (
          <div className="ml-8 mt-2 space-y-1.5">
            {children.length > 0 && (
              <DndContext sensors={subtaskSensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskDragEnd}>
                <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {children.map((child) => (
                    <SortableSubtaskRow key={child.id} child={child}
                      onToggle={() => updateTask.mutate({ id: child.id, is_completed: !child.is_completed })}
                      onDelete={() => deleteTask.mutate(child.id)} />
                  ))}
                </SortableContext>
              </DndContext>
            )}
            {addingSubtask && (
              <div className="px-3 py-2 rounded-lg bg-[#F8F8FB] dark:bg-white/[0.025] border border-dashed border-[#7C72F6]/30 dark:border-[#7C72F6]/20">
                <div className="flex items-center gap-2">
                  <div className="w-[18px] h-[18px] rounded-full border-2 border-[#7C72F6] flex-shrink-0" />
                  <input ref={subtaskInputRef} autoFocus value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && newSubtaskTitle.trim()) { createTask.mutate({ title: newSubtaskTitle.trim(), parent_task_id: task.id }); setNewSubtaskTitle(''); setAddingSubtask(false); } if (e.key === 'Escape') { setNewSubtaskTitle(''); setAddingSubtask(false); } }}
                    placeholder="子任务标题..." className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-[#9CA3AF] text-[#111827] dark:text-white/90" />
                  <button onClick={() => { if (!newSubtaskTitle.trim()) return; createTask.mutate({ title: newSubtaskTitle.trim(), parent_task_id: task.id }); setNewSubtaskTitle(''); setAddingSubtask(false); }}
                    disabled={!newSubtaskTitle.trim()}
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    <Plus size={14} style={{ strokeWidth: 2.5 }} />
                  </button>
                  <button onClick={() => { setNewSubtaskTitle(''); setAddingSubtask(false); }}
                    className="shrink-0 p-1 rounded-md hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors">
                    <X size={14} className="text-[#6B7280]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div ref={menuRef} style={{ left: contextMenu.x, top: contextMenu.y }}
            className="fixed z-[200] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-lg shadow-xl py-1 w-[180px]">
            <div className="px-3 py-1.5 text-xs text-[#6B7280] border-b border-[#F3F4F6] dark:border-white/[0.07] mb-1 truncate" title={task.title}>{task.title}</div>
            <button onClick={handleToggleComplete}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {task.is_completed ? <><RotateCcw size={15} className="text-[#6B7280]" /> 标记未完成</> : <><Check size={15} className="text-[#7C72F6]" /> 标记完成</>}
            </button>
            <button onClick={() => { const isMyDay = task.my_day_date === todayISO(); updateTask.mutate({ id: task.id, my_day_date: isMyDay ? '' : todayISO() }); toast.success(isMyDay ? '已移出我的一天' : '已加入我的一天'); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {task.my_day_date === todayISO() ? <><SunDim size={15} className="text-[#6B7280]" /> 移出我的一天</> : <><Sun size={15} className="text-amber-500" /> 加入我的一天</>}
            </button>
            {depth === 0 && (
              <button onClick={() => { setNewSubtaskTitle(''); setAddingSubtask(true); setContextMenu(null); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
                <Plus size={15} className="text-[#6B7280]" /> 添加子任务
              </button>
            )}
            <button onClick={() => { updateTask.mutate({ id: task.id, is_pinned: !task.is_pinned }); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {task.is_pinned ? <><Pin size={15} className="text-[#7C72F6]" /> 取消置顶</> : <><Pin size={15} className="text-[#6B7280]" /> 置顶</>}
            </button>
            <button onClick={() => {
              updateTask.mutate({ id: task.id, is_suspended: !isSuspended, is_abandoned: false });
              setContextMenu(null);
            }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {isSuspended
                ? <><Play size={15} className="text-[#6B7280]" /> 恢复</>
                : <><PauseCircle size={15} className="text-[#6B7280]" /> 挂起</>}
            </button>
            <button onClick={() => {
              updateTask.mutate({ id: task.id, is_abandoned: !isAbandoned, is_suspended: false });
              setContextMenu(null);
            }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {isAbandoned
                ? <><RotateCcw size={15} className="text-[#6B7280]" /> 重新激活</>
                : <><XCircle size={15} className="text-[#EF4444]" /> 放弃</>}
            </button>
            <button onClick={() => { navigator.clipboard.writeText(task.title); toast.success('已复制标题'); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              <Copy size={15} className="text-[#6B7280]" /> 复制标题
            </button>
            {hasChildren && (
              <button onClick={() => {
                const text = task.title + '\n' + children.map((c) => `  - ${c.title}`).join('\n');
                navigator.clipboard.writeText(text);
                toast.success('已复制含子任务');
                setContextMenu(null);
              }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
                <Copy size={15} className="text-[#6B7280]" /> 复制含子任务
              </button>
            )}
            <div className="border-t border-[#F3F4F6] dark:border-white/[0.07] mt-1 pt-1">
              <button onClick={() => { const deleted = task; if (selectedTaskId === task.id) setSelectedTaskId(null); deleteTask.mutate(task.id); toast.success(
                () => (
                  <span>任务已删除 &middot; <button onClick={() => { createTask.mutate({ title: deleted.title, description: deleted.description, priority: deleted.priority, due_date: deleted.due_date || undefined, tag_id: deleted.tag_id || undefined, parent_task_id: deleted.parent_task_id || undefined }); toast.dismiss(); }} className="font-bold text-[#1B2A4A] hover:text-[#0F1A2E] rounded px-1.5 py-0.5 text-xs">撤销</button></span>
                ),
                { duration: 8000 },
              ); setContextMenu(null); }}
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
