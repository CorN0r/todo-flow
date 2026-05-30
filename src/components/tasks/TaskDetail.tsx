import { useState, useEffect, useRef, useCallback } from 'react';
import { useTask, useUpdateTask, useDeleteTask, useCreateTask, useDuplicateTask } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { useUIStore } from '../../stores/uiStore';
import { isOverdue, todayISO } from '../../lib/date';
import { cn } from '../../lib/cn';
import type { UpdateTaskInput } from '../../types/task';
import { Trash2, Calendar, Copy, Repeat, Tag, Flag, ChevronDown, Sun, SunDim, Check, Bell, BellOff } from 'lucide-react';
import { RecurrencePicker } from '../shared/RecurrencePicker';
import { DatePicker } from '../shared/DatePicker';
import { ReminderPicker } from '../shared/ReminderPicker';
import { Portal } from '../shared/Portal';
import { toast } from 'sonner';

const priorityConfig: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: '无', color: 'text-[#6B7280]', bg: 'bg-[#F3F4F6] dark:bg-white/[0.06]' },
  1: { label: '低', color: 'text-[#3B82F6]', bg: 'bg-[#EFF6FF] dark:bg-[#172554]' },
  2: { label: '中', color: 'text-[#F59E0B]', bg: 'bg-[#FFFBEB] dark:bg-[#451A03]' },
  3: { label: '高', color: 'text-[#F97316]', bg: 'bg-[#FFF7ED] dark:bg-[#431407]' },
  4: { label: '紧急', color: 'text-[#EF4444]', bg: 'bg-[#FEF2F2] dark:bg-[#450A0A]' },
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

function EditableSubtaskTitle({ child }: { child: { id: string; title: string; is_completed: boolean } }) {
  const updateTask = useUpdateTask();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(child.title);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 0); } }, [editing]);
  if (editing) return (
    <input ref={ref} value={val} onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { const t = val.trim(); if (t && t !== child.title) updateTask.mutate({ id: child.id, title: t }); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
      onBlur={() => setEditing(false)}
      className="flex-1 text-[13px] px-1 py-0.5 rounded bg-[#F3F4F6] dark:bg-white/[0.08] outline-none ring-1 ring-[#7C72F6]/40 text-[#111827] dark:text-white/90" />
  );
  return (
    <span className={cn('text-[13px] flex-1 truncate cursor-text', child.is_completed && 'line-through text-[#9CA3AF]', !child.is_completed && 'text-[#111827] dark:text-white/90')}
      onClick={() => { setVal(child.title); setEditing(true); }} title="点击编辑标题">{child.title}</span>
  );
}

export function TaskDetail() {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const { data: detail, isLoading } = useTask(selectedTaskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const duplicateTask = useDuplicateTask();
  const { data: tags } = useTags();

  const [local, setLocal] = useState<LocalState | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalRef = useRef<LocalState | null>(null);
  const taskRef = useRef(detail?.task);
  const mutateRef = useRef(updateTask.mutate);
  useEffect(() => { mutateRef.current = updateTask.mutate; });

  const [openPriority, setOpenPriority] = useState(false);
  const [openTag, setOpenTag] = useState(false);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const tagBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (detail) taskRef.current = detail.task; });
  useEffect(() => {
    if (detail) {
      const next = { title: detail.task.title, description: detail.task.description, priority: detail.task.priority,
        due_date: detail.task.due_date || '', reminder: detail.task.reminder || '', tag_id: detail.task.tag_id || '',
        recurrence: detail.task.recurrence || '', is_completed: detail.task.is_completed };
      setLocal(next); originalRef.current = next;
    }
  }, [detail?.task.id]);

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
    if (Object.keys(input).length === 1) return;
    mutateRef.current(input, { onSuccess: () => { originalRef.current = currentLocal; }, onError: () => { toast.error('保存失败'); } });
  }, []);

  useEffect(() => {
    if (!local || !originalRef.current) return;
    const orig = originalRef.current;
    const hasChanges = local.title !== orig.title || local.priority !== orig.priority || local.due_date !== orig.due_date ||
      local.reminder !== orig.reminder || local.tag_id !== orig.tag_id || local.recurrence !== orig.recurrence;
    if (!hasChanges) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveTimerRef.current = null; doSave(local); }, 800);
    return () => { if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; doSave(local); } };
  }, [local, doSave]);

  const update = (patch: Partial<LocalState>) => { setLocal((prev) => (prev ? { ...prev, ...patch } : null)); };

  if (!selectedTaskId) return null;
  if (isLoading) return <p className="text-sm text-[#9CA3AF] py-8 text-center">加载中...</p>;
  if (!detail || !local) return <p className="text-sm text-[#9CA3AF] py-8 text-center">未找到任务</p>;

  const { task, children } = detail;

  const handleDelete = () => {
    const deletedTask = task;
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        setSelectedTaskId(null);
        toast('任务已删除', { action: { label: '撤销', onClick: () => { createTask.mutate({ title: deletedTask.title, description: deletedTask.description, priority: deletedTask.priority, due_date: deletedTask.due_date || undefined, tag_id: deletedTask.tag_id || undefined, parent_task_id: deletedTask.parent_task_id || undefined }); } } });
      },
    });
  };

  const toggleComplete = () => { const next = !local.is_completed; updateTask.mutate({ id: task.id, is_completed: next }); setLocal((prev) => (prev ? { ...prev, is_completed: next } : null)); };
  const priorityInfo = priorityConfig[local.priority] || priorityConfig[0];
  const taskTag = tags?.find((t) => t.id === local.tag_id);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <button onClick={toggleComplete} className={cn('w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-all duration-200',
          local.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6] hover:bg-[#7C72F6]/[0.06]')}>
          {local.is_completed && <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <div className="flex-1 min-w-0">
          <input value={local.title} onChange={(e) => update({ title: e.target.value })}
            className={cn('w-full text-xl font-bold bg-transparent border-b-2 border-transparent hover:border-[#D1D5DB] focus:border-[#7C72F6] outline-none pb-0.5 transition-colors', local.is_completed && 'line-through text-[#9CA3AF]')}
            placeholder="任务标题" />
        </div>
      </div>

      <div>
        <label className="section-label mb-3 block">描述</label>
        <textarea value={local.description} onChange={(e) => setLocal((prev) => prev ? { ...prev, description: e.target.value } : null)}
          onBlur={() => { const t = taskRef.current; if (t) { mutateRef.current({ id: t.id, description: local.description }, { onSuccess: () => {}, onError: () => {} }); } }}
          placeholder="输入内容..." rows={4}
          className="w-full text-sm px-3 py-2 rounded-[10px] border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6] resize-y placeholder:text-[#9CA3AF]" />
      </div>

      <div>
        <label className="section-label mb-3 block">属性</label>
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] transition-colors group">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', priorityInfo.bg)}><Flag size={15} className={priorityInfo.color} /></div>
            <span className="text-xs font-medium text-[#6B7280] w-16">优先级</span>
            <button ref={priorityBtnRef} onClick={() => { setOpenPriority(!openPriority); setOpenTag(false); }}
              className={cn('flex-1 flex items-center justify-between text-sm font-medium', local.priority > 0 && priorityInfo.color)}>
              <span>{priorityInfo.label}</span><ChevronDown size={14} className="text-[#6B7280]" />
            </button>
            {openPriority && (
              <Portal>
                <div className="fixed inset-0 z-40" onClick={() => setOpenPriority(false)} />
                <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[140px]"
                  style={{ top: (priorityBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: priorityBtnRef.current?.getBoundingClientRect().left ?? 0 }}>
                  {Object.entries(priorityConfig).map(([k, v]) => (
                    <button key={k} onClick={() => { update({ priority: Number(k) }); setOpenPriority(false); }}
                      className={`w-full text-left px-3 py-2 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] flex items-center gap-2 ${local.priority === Number(k) ? 'text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90'}`}>
                      <Flag size={13} className={v.color} /><span>{v.label}</span></button>
                  ))}
                </div>
              </Portal>
            )}
          </div>

          <div className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] transition-colors">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: taskTag?.color || '#888' }}><Tag size={15} style={{ color: '#fff' }} /></div>
            <span className="text-xs font-medium text-[#6B7280] w-16">标签</span>
            <button ref={tagBtnRef} onClick={() => { setOpenTag(!openTag); setOpenPriority(false); }}
              className="flex-1 flex items-center justify-between text-sm font-medium">
              <span className={!taskTag ? 'text-[#9CA3AF]' : ''} style={taskTag ? { color: taskTag.color } : undefined}>{taskTag?.name || '无标签'}</span>
              <ChevronDown size={14} className="text-[#6B7280]" />
            </button>
            {openTag && (
              <Portal>
                <div className="fixed inset-0 z-40" onClick={() => setOpenTag(false)} />
                <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[160px]"
                  style={{ top: (tagBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: tagBtnRef.current?.getBoundingClientRect().left ?? 0 }}>
                  <button onClick={() => { update({ tag_id: '' }); setOpenTag(false); }}
                    className={`w-full text-left px-3 py-2 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] ${!local.tag_id ? 'text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90'}`}>无标签</button>
                  {tags?.map((t) => (<button key={t.id} onClick={() => { update({ tag_id: t.id }); setOpenTag(false); }}
                    className={`w-full text-left px-3 py-2 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] flex items-center gap-2 ${local.tag_id === t.id ? 'text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90'}`}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />{t.name}</button>))}
                </div>
              </Portal>
            )}
          </div>

          <div className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] transition-colors">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', isOverdue(local.due_date) ? 'bg-red-50 dark:bg-red-950' : 'bg-violet-50 dark:bg-violet-950')}>
              <Calendar size={15} className={isOverdue(local.due_date) ? 'text-red-500' : 'text-violet-500'} /></div>
            <span className="text-xs font-medium text-[#6B7280] w-16">截止日期</span>
            <DatePicker value={local.due_date} onChange={(val) => update({ due_date: val })} />
          </div>

          <div className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] transition-colors group">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', local.reminder ? 'bg-blue-50 dark:bg-blue-950' : 'bg-[#F3F4F6] dark:bg-white/[0.06]')}>
              {local.reminder ? <Bell size={15} className="text-blue-500" /> : <BellOff size={15} className="text-[#6B7280]" />}</div>
            <span className="text-xs font-medium text-[#6B7280] w-16">提醒</span>
            <ReminderPicker value={local.reminder} onChange={(val) => update({ reminder: val })} />
          </div>

          <div className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] transition-colors">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center"><Repeat size={15} className="text-violet-500" /></div>
            <span className="text-xs font-medium text-[#6B7280] w-16">重复</span>
            <RecurrencePicker value={local.recurrence} onChange={(val) => update({ recurrence: val })} />
          </div>
        </div>
      </div>

      {children.length > 0 && (
        <div>
          <label className="section-label mb-3 flex items-center gap-2">子任务
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.08] text-[10px] font-bold text-[#6B7280] px-1.5">{children.length}</span>
          </label>
          <div className="space-y-1 mb-3 ml-6 border-l-2 border-[#F3F4F6] dark:border-white/[0.06] pl-4">
            {children.map((child) => (
              <div key={child.id} className="flex items-center gap-2 py-1.5 px-2 rounded-[8px]">
                <button onClick={() => updateTask.mutate({ id: child.id, is_completed: !child.is_completed })}
                  className={cn('w-[18px] h-[18px] rounded-full border-[2px] flex items-center justify-center flex-shrink-0 transition-colors',
                    child.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]')}>
                  {child.is_completed && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
                <EditableSubtaskTitle child={child} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-[#F3F4F6] dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <button onClick={handleDelete} className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#EF4444] transition-colors px-2 py-1.5 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-red-950/30">
            <Trash2 size={14} />删除</button>
          <div className="flex items-center gap-1">
            <button onClick={() => { const isMyDay = task.my_day_date === todayISO(); updateTask.mutate({ id: task.id, my_day_date: isMyDay ? '' : todayISO() }); }}
              className={cn('flex items-center gap-1.5 text-[12px] transition-colors px-2 py-1.5 rounded-lg',
                task.my_day_date === todayISO() ? 'text-[#F59E0B] bg-[#FFFBEB] dark:bg-amber-950/30' : 'text-[#6B7280] hover:text-[#F59E0B] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]')}>
              {task.my_day_date === todayISO() ? <SunDim size={14} /> : <Sun size={14} />}我的一天</button>
            <button onClick={() => duplicateTask.mutate(task.id)}
              className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#374151] dark:hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]">
              <Copy size={14} />复制</button>
          </div>
        </div>
      </div>
    </div>
  );
}
