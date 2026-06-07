import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTasks, useUpdateTask, useDeleteTask, useCreateTask } from '../hooks/useTasks';
import { useTags } from '../hooks/useTags';
import { useUIStore } from '../stores/uiStore';
import { useQueryClient } from '@tanstack/react-query';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { PageTitle, type FilterMode } from '../components/shared/PageTitle';
import { CalendarCheck, AlertTriangle, Trash2, Copy, Tag, Flag, Check, RotateCcw, Sun, SunDim, Pin, PauseCircle, Play, XCircle, X, Bell, Repeat, Plus } from 'lucide-react';
import { cn } from '../lib/cn';
import { toast } from 'sonner';
import { todayISO, formatDate, isOverdue, addDays, format } from '../lib/date';
import { priorityColors, priorityLabels, PRIORITY_HEX, hexToRgba } from '../lib/priority';
import { sortTasks, nestChildren } from '../lib/sortTasks';
import { DatePicker } from '../components/shared/DatePicker';
import { RecurrencePicker } from '../components/shared/RecurrencePicker';
import { ReminderList } from '../components/shared/ReminderList';
import { Portal } from '../components/shared/Portal';
import type { Task, UpdateTaskInput } from '../types/task';

interface LocalState {
  title: string;
  description: string;
  priority: number;
  due_date: string;
  tag_id: string;
  recurrence: string;
  is_completed: boolean;
}

const priorityConfig: Record<number, { label: string; color: string }> = {
  0: { label: '无', color: 'text-[#6B7280]' },
  1: { label: '低', color: 'text-[#3B82F6]' },
  2: { label: '中', color: 'text-[#F59E0B]' },
  3: { label: '高', color: 'text-[#F97316]' },
  4: { label: '紧急', color: 'text-[#EF4444]' },
};

export function UnifiedPage() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const today = todayISO();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const taskFilters = useMemo(() => {
    const path = location.pathname;
    const base: Record<string, unknown> = { include_children: true };
    if (path.startsWith('/unified/tag/') && params.tagId) { base.tag_id = params.tagId; }
    else if (path === '/unified/today') { base.due_date_from = today; base.due_date_to = today; }
    else if (path === '/unified/myday') { base.my_day_date = today; base.is_completed = false; }
    else if (path === '/unified/calendar') { return {}; }
    return base;
  }, [today, params.tagId]);

  const { data: tasks, isLoading, isError } = useTasks(taskFilters as Parameters<typeof useTasks>[0]);
  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const taskViewMode = useUIStore((s) => s.taskViewMode);
  const setTaskViewMode = useUIStore((s) => s.setTaskViewMode);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const exitSelection = useUIStore((s) => s.exitSelectionMode);
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const { data: tags } = useTags();
  const queryClient = useQueryClient();

  const [leftWidth, setLeftWidth] = useState(() => Number(localStorage.getItem('unifiedLeftWidth')) || 240);
  const resizingRef = useRef(false);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startW = leftWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(180, Math.min(480, startW + ev.clientX - startX));
      setLeftWidth(w);
      localStorage.setItem('unifiedLeftWidth', String(w));
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleCreateTask = () => {
    createTask.mutate({ title: '新建任务', due_date: today }, {
      onSuccess: (task) => { setSelectedTaskId(task.id); },
    });
  };

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);
  const topLevel = useMemo(() => nestChildren(sorted), [sorted]);
  const filtered = useMemo(() => {
    if (filterMode === 'incomplete') return topLevel.filter((t) => !t.is_completed && !t.is_abandoned);
    if (filterMode === 'completed') return topLevel.filter((t) => t.is_completed || t.is_abandoned);
    if (filterMode === 'overdue') return topLevel.filter((t) => !t.is_completed && !t.is_abandoned && t.due_date && t.due_date < today);
    return topLevel;
  }, [topLevel, filterMode, today]);

  const completedCount = topLevel.filter((t) => t.is_completed || t.is_abandoned).length;
  const overdueCount = topLevel.filter((t) => !t.is_completed && !t.is_abandoned && t.due_date && t.due_date < today).length;

  const selectedTask = filtered.find((t) => t.id === selectedTaskId);

  const handleToggleSelection = () => {
    if (selectionMode) exitSelection(); else useUIStore.getState().enterSelectionMode();
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (selectionMode) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filtered.findIndex((t) => t.id === selectedTaskId);
        const next = e.key === 'ArrowDown' ? Math.min(idx + 1, filtered.length - 1) : Math.max(idx - 1, 0);
        if (filtered[next]) setSelectedTaskId(filtered[next].id);
      }
      if (e.key === 'Escape') setSelectedTaskId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, selectedTaskId, selectionMode, setSelectedTaskId]);

  if (isLoading) return <LoadingSkeleton count={8} />;
  if (isError) return <EmptyState icon={<AlertTriangle size={40} />} title="加载失败" description="请检查数据库连接后重试" />;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
          <CalendarCheck size={18} className="text-emerald-500" />
        </div>
        <div className="flex-1">
          <PageTitle title={location.pathname === '/unified/today' ? '今天' : location.pathname === '/unified/myday' ? '我的一天' : '全部任务'}
            taskCount={topLevel.length} completedCount={completedCount}
            overdueCount={overdueCount} filterMode={filterMode} onFilterChange={setFilterMode}
            sortMode={sortMode} onSortChange={setSortMode}
            onNewTask={handleCreateTask}
            selectionMode={selectionMode} onToggleSelection={handleToggleSelection}
            taskViewMode="unified" onToggleViewMode={() => {
              setSelectedTaskId(null);
              setTaskViewMode('list');
              navigate('/date/all');
            }} />
        </div>
      </div>

      {/* Main split */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* Left: Task list sidebar */}
        <div className="shrink-0 flex flex-col border-r border-[#F3F4F6] dark:border-white/[0.06]" style={{ width: leftWidth }}>
          <div className="flex-1 overflow-hidden flex flex-col">
          <div className="shrink-0 px-3 py-2">
            <button onClick={handleCreateTask}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] border border-dashed border-[#D1D5DB] dark:border-white/[0.10] transition-colors">
              <Plus size={13} />新建任务
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2">
            {filtered.map((task) => (
              <div key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className={cn('px-3 py-2 rounded-lg cursor-pointer transition-colors mb-0.5 group',
                  selectedTaskId === task.id
                    ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6]'
                    : 'hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] text-[#111827] dark:text-white/90')}>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_completed: !task.is_completed }); }}
                    className={cn('w-[16px] h-[16px] rounded-full border-[2px] flex items-center justify-center flex-shrink-0 transition-colors',
                      task.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]')}>
                    {task.is_completed && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>
                  <span className={cn('text-[13px] truncate flex-1', task.is_completed && 'line-through text-[#9CA3AF]', task.is_abandoned && 'line-through text-red-400/70')}>
                    {task.is_pinned && <Pin size={10} className="inline mr-1 text-[#7C72F6]" />}
                    {task.title}
                  </span>
                  {task.priority > 0 && <Flag size={10} className={priorityColors[task.priority]} />}
                  {(task.children_count || 0) > 0 && <span className="text-[10px] text-[#9CA3AF]">{task.children_count}</span>}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-[12px] text-[#9CA3AF] text-center py-8">暂无任务</p>
            )}
          </div>
          </div>
        </div>

        {/* Draggable divider */}
        <div
          onMouseDown={handleResizeStart}
          className="w-1.5 shrink-0 cursor-col-resize hover:bg-[#7C72F6]/30 transition-colors rounded-full mx-0.5"
          style={{ userSelect: 'none' }}
        />

        {/* Right: Task detail */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selectedTask ? (
            <UnifiedDetail
              task={selectedTask}
              tags={tags || []}
              updateTask={updateTask}
              deleteTask={deleteTask}
              createTask={createTask}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <CalendarCheck size={48} className="text-[#D1D5DB] mx-auto mb-4" />
                <p className="text-[#9CA3AF] text-sm">选择左侧任务查看详情</p>
                <p className="text-[#9CA3AF] text-xs mt-1">或点击「新建任务」开始</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UnifiedDetail({ task, tags, updateTask, deleteTask, createTask }: {
  task: Task;
  tags: { id: string; name: string; color: string }[];
  updateTask: ReturnType<typeof useUpdateTask>;
  deleteTask: ReturnType<typeof useDeleteTask>;
  createTask: ReturnType<typeof useCreateTask>;
}) {
  const [local, setLocal] = useState<LocalState>({
    title: task.title, description: task.description, priority: task.priority,
    due_date: task.due_date || '', tag_id: task.tag_id || '', recurrence: task.recurrence || '', is_completed: task.is_completed,
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);

  useEffect(() => {
    setLocal({
      title: task.title, description: task.description, priority: task.priority,
      due_date: task.due_date || '', tag_id: task.tag_id || '', recurrence: task.recurrence || '', is_completed: task.is_completed,
    });
  }, [task.id]);

  const doSave = (patch: Partial<LocalState>) => {
    setLocal((prev) => ({ ...prev, ...patch }));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const input: UpdateTaskInput = { id: task.id };
      if (patch.title !== undefined && patch.title !== task.title) input.title = patch.title;
      if (patch.priority !== undefined && patch.priority !== task.priority) input.priority = patch.priority;
      if (patch.due_date !== undefined && patch.due_date !== (task.due_date || '')) input.due_date = patch.due_date || '';
      if (patch.tag_id !== undefined && patch.tag_id !== (task.tag_id || '')) input.tag_id = patch.tag_id || '';
      if (patch.recurrence !== undefined && patch.recurrence !== (task.recurrence || '')) input.recurrence = patch.recurrence || '';
      if (Object.keys(input).length === 1) return;
      updateTask.mutate(input);
    }, 800);
  };

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const handleDelete = () => {
    setSelectedTaskId(null);
    deleteTask.mutate(task.id, {
      onSuccess: () => toast.success(() => (
        <span>任务已删除 &middot; <button onClick={() => { createTask.mutate({ title: task.title, description: task.description, priority: task.priority, due_date: task.due_date || undefined, tag_id: task.tag_id || undefined, parent_task_id: task.parent_task_id || undefined }); toast.dismiss(); }} className="font-bold text-[#1B2A4A] hover:text-[#0F1A2E] rounded px-1.5 py-0.5 text-xs">撤销</button></span>
      ), { duration: 8000 }),
    });
  };

  const taskTag = tags.find((t) => t.id === local.tag_id);
  const children = task.children || [];
  const completedCount = children.filter((c) => c.is_completed).length;

  const [openPriority, setOpenPriority] = useState(false);
  const [openTag, setOpenTag] = useState(false);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const tagBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="space-y-5 px-2">
      {/* Title */}
      <div className="flex items-start gap-3">
        <button onClick={() => { doSave({ is_completed: !local.is_completed }); updateTask.mutate({ id: task.id, is_completed: !local.is_completed }); }}
          className={cn('w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all',
            local.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]')}>
          {local.is_completed && <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
        <input value={local.title} onChange={(e) => doSave({ title: e.target.value })}
          className={cn('w-full text-[18px] font-bold bg-transparent border-b-2 border-transparent hover:border-[#D1D5DB] focus:border-[#7C72F6] outline-none pb-0.5', local.is_completed && 'line-through text-[#9CA3AF]')}
          placeholder="任务标题" />
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2">
        <button onClick={() => updateTask.mutate({ id: task.id, my_day_date: task.my_day_date === todayISO() ? '' : todayISO() })}
          className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-full transition-colors',
            task.my_day_date === todayISO() ? 'text-[#F59E0B] bg-[#FFFBEB] dark:bg-amber-950/30' : 'text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04]')}>
          {task.my_day_date === todayISO() ? <SunDim size={13} /> : <Sun size={13} />}我的一天
        </button>
        <button onClick={() => updateTask.mutate({ id: task.id, is_pinned: !task.is_pinned })}
          className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-full transition-colors',
            task.is_pinned ? 'text-[#7C72F6] bg-[#7C72F6]/[0.06]' : 'text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04]')}>
          <Pin size={13} />{task.is_pinned ? '已置顶' : '置顶'}
        </button>
      </div>

      {/* Attributes */}
      <div className="flex flex-wrap items-center gap-2">
        <button ref={priorityBtnRef} onClick={() => setOpenPriority(!openPriority)}
          className={cn('inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium', local.priority > 0 ? '' : 'text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04]')}
          style={local.priority > 0 ? { backgroundColor: hexToRgba(PRIORITY_HEX[local.priority], 0.12), color: PRIORITY_HEX[local.priority] } : undefined}>
          <Flag size={12} />{local.priority > 0 ? priorityLabels[local.priority] : '优先级'}
        </button>
        {openPriority && (
          <Portal>
            <div className="fixed inset-0 z-40" onClick={() => setOpenPriority(false)} />
            <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[140px]"
              style={{ top: (priorityBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: priorityBtnRef.current?.getBoundingClientRect().left ?? 0 }}>
              {Object.entries(priorityConfig).map(([k, v]) => (
                <button key={k} onClick={() => { doSave({ priority: Number(k) }); setOpenPriority(false); }}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] flex items-center gap-2">
                  <Flag size={13} className={v.color} /><span>{v.label}</span></button>
              ))}
            </div>
          </Portal>
        )}

        <button ref={tagBtnRef} onClick={() => setOpenTag(!openTag)}
          className={cn('inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium', local.tag_id && taskTag ? '' : 'text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04]')}
          style={local.tag_id && taskTag ? { backgroundColor: hexToRgba(taskTag.color, 0.15), color: taskTag.color } : undefined}>
          {local.tag_id && taskTag ? taskTag.name : '标签'}
        </button>
        {openTag && (
          <Portal>
            <div className="fixed inset-0 z-40" onClick={() => setOpenTag(false)} />
            <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[160px]"
              style={{ top: (tagBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: tagBtnRef.current?.getBoundingClientRect().left ?? 0 }}>
              <button onClick={() => { doSave({ tag_id: '' }); setOpenTag(false); }}
                className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]">无标签</button>
              {tags.map((t) => (
                <button key={t.id} onClick={() => { doSave({ tag_id: t.id }); setOpenTag(false); }}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />{t.name}</button>
              ))}
            </div>
          </Portal>
        )}

        <DatePicker value={local.due_date} onChange={(val) => doSave({ due_date: val })} showTime />

        <RecurrencePicker value={local.recurrence} onChange={(val) => doSave({ recurrence: val })} />
      </div>

      {/* Reminders */}
      {local.due_date && <ReminderList taskId={task.id} dueDate={local.due_date} />}

      {/* Description */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[11px] font-semibold text-[#6B7280] tracking-wide">描述</span>
        </div>
        <textarea value={local.description}
          onChange={(e) => doSave({ description: e.target.value })}
          placeholder="添加描述..." rows={3}
          className="w-full text-sm px-3 py-2.5 rounded-[10px] border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 resize-y placeholder:text-[#9CA3AF] min-h-[60px]" />
      </div>

      {/* Subtasks */}
      {children.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[#6B7280] tracking-wide">子任务</span>
            <span className="text-[11px] text-[#6B7280]">{completedCount}/{children.length}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] mb-3 overflow-hidden">
            <div className="h-full rounded-full bg-[#7C72F6] transition-all" style={{ width: `${(completedCount / children.length) * 100}%` }} />
          </div>
          {children.map((child) => (
            <div key={child.id} className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.04] mb-1">
              <button onClick={() => updateTask.mutate({ id: child.id, is_completed: !child.is_completed })}
                className={cn('w-[18px] h-[18px] rounded-full border-[2px] flex items-center justify-center flex-shrink-0',
                  child.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]')}>
                {child.is_completed && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </button>
              <span className={cn('text-[13px] flex-1', child.is_completed && 'line-through text-[#9CA3AF]')}>{child.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-[#F3F4F6] dark:border-white/[0.06]">
        <span className="text-[11px] text-[#9CA3AF]">创建于 {new Date(task.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <button onClick={handleDelete}
          className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#EF4444] transition-colors px-2 py-1.5 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-red-950/30">
          <Trash2 size={14} />删除</button>
      </div>
    </div>
  );
}
