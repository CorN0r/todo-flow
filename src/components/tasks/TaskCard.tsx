import { useState, useRef, useMemo, useEffect } from 'react';
import { cn } from '../../lib/cn';
import type { Task } from '../../types/task';
import { formatDate, isOverdue } from '../../lib/date';
import { Calendar, Flag, ListTree, Check, RotateCcw, Trash2, Copy, Sun, SunDim, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { useUpdateTask, useDeleteTask, useDuplicateTask, useCreateTask } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { useUIStore } from '../../stores/uiStore';
import { todayISO } from '../../lib/date';
import { priorityColors, priorityLabels, hexToRgba } from '../../lib/priority';

export function TaskCard({ task, depth = 0 }: { task: Task; depth?: number }) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const duplicateTask = useDuplicateTask();
  const createTask = useCreateTask();
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const selectedTaskIds = useUIStore((s) => s.selectedTaskIds);
  const toggleTaskSelection = useUIStore((s) => s.toggleTaskSelection);
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const isSelected = selectedTaskIds.has(task.id);
  const overdue = isOverdue(task.due_date);
  const { data: tags } = useTags();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [subtaskExpanded, setSubtaskExpanded] = useState(true);
  const [newSubtitle, setNewSubtitle] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingTitle) {
      setTimeout(() => { editInputRef.current?.focus(); editInputRef.current?.select(); }, 0);
    }
  }, [editingTitle]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
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
    e.preventDefault();
    e.stopPropagation();
    const menuW = 180;
    const menuH = 250;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
    setContextMenu({ x, y });
  };

  const handleToggleComplete = () => {
    updateTask.mutate({ id: task.id, is_completed: !task.is_completed });
    setContextMenu(null);
  };

  const handleAddSubtask = () => {
    if (newSubtitle.trim()) {
      createTask.mutate({ title: newSubtitle.trim(), parent_task_id: task.id, tag_id: task.tag_id || undefined });
      setNewSubtitle('');
    }
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    if (selectionMode) return;
    e.stopPropagation();
    setEditTitleValue(task.title);
    setEditingTitle(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editTitleValue.trim();
    if (trimmed && trimmed !== task.title) {
      updateTask.mutate({ id: task.id, title: trimmed });
    }
    setEditingTitle(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); }
    if (e.key === 'Escape') setEditingTitle(false);
  };

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className={cn(
          'flex flex-col group select-none',
          !isGlass && 'bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06]',
          !isGlass && task.is_completed && 'opacity-75 bg-[#FAFAFA] dark:bg-white/[0.02]',
          isGlass && 'glass-card',
          overdue && !task.is_completed && 'border-l-[3px] border-l-red-400 dark:border-l-red-400',
          isSelected && 'ring-2 ring-[#7C72F6] ring-offset-1',
        )}
        style={isGlass ? { padding: '14px 16px', borderRadius: '10px' } : { padding: '14px 16px', borderRadius: '10px', boxShadow: 'var(--card-shadow)' }}
      >
        {/* Main row */}
        <div className="flex items-center gap-3">
          {/* Selection checkbox */}
          {selectionMode && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleTaskSelection(task.id); }}
              className={cn(
                'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                isSelected ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]',
              )}
              aria-label={isSelected ? `Deselect "${task.title}"` : `Select "${task.title}"`}
            >
              {isSelected && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          )}

          {/* Completion checkbox */}
          <button
            onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_completed: !task.is_completed }); }}
            className={cn(
              'w-5 h-5 rounded-full border-[2px] flex items-center justify-center flex-shrink-0 transition-all duration-200',
              task.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6] hover:bg-[#7C72F6]/[0.06]',
            )}
            aria-label={task.is_completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
          >
            {task.is_completed && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>

          {/* Content */}
          <div className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer select-none"
            onClick={() => { if (selectionMode) { toggleTaskSelection(task.id); } else { setSelectedTaskId(task.id); } }}
            role="button" tabIndex={0}
            draggable={!selectionMode}
            onDragStart={(e) => { if (selectionMode) return; e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; }}
            onKeyDown={(e) => { if (e.key === 'Enter') setSelectedTaskId(task.id); }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {editingTitle ? (
                  <input
                    ref={editInputRef}
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={handleSaveEdit}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-[120px] text-[14px] font-medium px-1.5 py-0.5 rounded-md bg-[#F3F4F6] dark:bg-white/[0.08] outline-none ring-2 ring-[#7C72F6]/40 text-[#111827] dark:text-white/90"
                  />
                ) : (
                  <span
                    className={cn(
                      'text-[14px] font-medium truncate cursor-text',
                      task.is_completed && 'line-through text-[#9CA3AF]',
                      !task.is_completed && 'text-[#111827] dark:text-white/90',
                    )}
                    onDoubleClick={handleStartEdit}
                    title="双击编辑标题"
                  >
                    {task.title}
                  </span>
                )}
                {taskTag && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 inline-flex items-center"
                    style={{ backgroundColor: hexToRgba(taskTag.color, 0.15), color: taskTag.color }}>
                    {taskTag.name}
                  </span>
                )}
              </div>
              {task.description && (
                <p className="text-[12px] text-[#9CA3AF] truncate mt-0.5">{task.description}</p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {hasChildren && (
                <button onClick={(e) => { e.stopPropagation(); setSubtaskExpanded(!subtaskExpanded); }}
                  className="text-xs text-[#6B7280] flex items-center gap-1 font-medium"
                  aria-label={subtaskExpanded ? 'Collapse subtasks' : 'Expand subtasks'}>
                  {subtaskExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <ListTree size={12} />
                  {children.filter((c) => c.is_completed).length}/{children.length}
                </button>
              )}
              {task.priority > 0 && (
                <span className={cn('text-sm', priorityColors[task.priority])} title={priorityLabels[task.priority]}>
                  <Flag size={14} />
                </span>
              )}
              {task.due_date && (
                <span className={cn('text-[12px] flex items-center gap-1 shrink-0', overdue ? 'text-red-500' : 'text-[#9CA3AF]')}>
                  <Calendar size={12} />
                  {formatDate(task.due_date)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Inline children */}
        {hasChildren && subtaskExpanded && (
          <div className="ml-8 mt-2 border-l-2 border-[#F3F4F6] dark:border-white/[0.06] pl-3 space-y-1">
            {children.map((child) => (
              <div key={child.id} className="flex items-center gap-2 py-1 group/sub">
                <button
                  onClick={() => updateTask.mutate({ id: child.id, is_completed: !child.is_completed })}
                  className={cn(
                    'w-[18px] h-[18px] rounded-full border-[2px] flex items-center justify-center flex-shrink-0 transition-colors',
                    child.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]',
                  )}
                  aria-label={child.is_completed ? `Mark "${child.title}" incomplete` : `Mark "${child.title}" complete`}
                >
                  {child.is_completed && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                <span
                  className={cn('text-[13px] flex-1 truncate cursor-pointer', child.is_completed && 'line-through text-[#9CA3AF]', !child.is_completed && 'text-[#111827] dark:text-white/90')}
                  onClick={() => setSelectedTaskId(child.id)}
                >
                  {child.title}
                </span>
                <button
                  onClick={() => deleteTask.mutate(child.id)}
                  className="p-1 text-[#D1D5DB] opacity-0 group-hover/sub:opacity-100 hover:text-[#EF4444] transition-all"
                  aria-label={`Delete "${child.title}"`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {/* Quick add subtask inline */}
            {showSubtaskInput ? (
              <div className="flex items-center gap-2 py-1">
                <Plus size={14} className="text-[#9CA3AF] flex-shrink-0" />
                <input
                  autoFocus
                  value={newSubtitle}
                  onChange={(e) => setNewSubtitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { handleAddSubtask(); setShowSubtaskInput(false); }
                    if (e.key === 'Escape') { setNewSubtitle(''); setShowSubtaskInput(false); }
                  }}
                  placeholder="添加子任务..."
                  className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-[#9CA3AF] text-[#111827] dark:text-white/90"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowSubtaskInput(true)}
                className="flex items-center gap-2 py-1 text-[12px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              >
                <Plus size={14} /> 添加子任务
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-[100] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-lg shadow-xl py-1 min-w-[180px] animate-in fade-in zoom-in-95 origin-top-left"
        >
          <div className="px-3 py-1.5 text-xs text-[#6B7280] border-b border-[#F3F4F6] dark:border-white/[0.07] mb-1 truncate">{task.title}</div>
          <button onClick={handleToggleComplete}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
            {task.is_completed ? <><RotateCcw size={15} className="text-[#6B7280]" /> Mark incomplete</> : <><Check size={15} className="text-[#7C72F6]" /> Mark complete</>}
          </button>
          <button onClick={() => {
            const isMyDay = task.my_day_date === todayISO();
            updateTask.mutate({ id: task.id, my_day_date: isMyDay ? null : todayISO() });
            setContextMenu(null);
          }} className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
            {task.my_day_date === todayISO() ? <><SunDim size={15} className="text-[#6B7280]" /> Remove from My Day</> : <><Sun size={15} className="text-amber-500" /> Add to My Day</>}
          </button>
          {depth === 0 && (
            <button onClick={() => { createTask.mutate({ title: 'New subtask', parent_task_id: task.id, tag_id: task.tag_id || undefined }, { onSuccess: () => setContextMenu(null) }); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              <Plus size={15} className="text-[#6B7280]" /> Add subtask
            </button>
          )}
          <button onClick={() => { duplicateTask.mutate(task.id); setContextMenu(null); }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
            <Copy size={15} className="text-[#6B7280]" /> Duplicate
          </button>
          <div className="border-t mt-1 pt-1">
            <button onClick={() => { deleteTask.mutate(task.id); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-red-50 text-red-600 transition-colors">
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>
      )}
    </>
  );
}
