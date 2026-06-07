import { useState, useEffect, useRef, useCallback } from 'react';
import { useTask, useUpdateTask, useDeleteTask, useCreateTask, useDuplicateTask } from '../../hooks/useTasks';
import { useQueryClient } from '@tanstack/react-query';
import { useTags } from '../../hooks/useTags';
import { useUIStore } from '../../stores/uiStore';
import { todayISO } from '../../lib/date';
import { cn } from '../../lib/cn';
import type { UpdateTaskInput } from '../../types/task';
import { Trash2, Copy, Tag, Flag, ChevronDown, Sun, SunDim, Pin, X } from 'lucide-react';
import { RecurrencePicker } from '../shared/RecurrencePicker';
import { DatePicker } from '../shared/DatePicker';
import { ReminderList } from '../shared/ReminderList';
import { Portal } from '../shared/Portal';
import { toast } from 'sonner';
import { hexToRgba, PRIORITY_HEX, priorityLabels } from '../../lib/priority';


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
  const queryClient = useQueryClient();
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
    if (selectedTaskId) {
      queryClient.refetchQueries({ queryKey: ['task', selectedTaskId] });
    }
  }, [selectedTaskId, queryClient]);
  useEffect(() => {
    if (detail && selectedTaskId) {
      const next = { title: detail.task.title, description: detail.task.description, priority: detail.task.priority,
        due_date: detail.task.due_date || '', tag_id: detail.task.tag_id || '',
        recurrence: detail.task.recurrence || '', is_completed: detail.task.is_completed };
      setLocal(next); originalRef.current = next;
    }
  }, [detail?.task.id, detail?.task.updated_at, selectedTaskId]);

  const doSave = useCallback((currentLocal: LocalState) => {
    const task = taskRef.current;
    if (!task) return;
    const input: UpdateTaskInput = { id: task.id };
    if (currentLocal.title !== task.title) input.title = currentLocal.title;
    if (currentLocal.priority !== task.priority) input.priority = currentLocal.priority;
    if (currentLocal.due_date !== (task.due_date || '')) input.due_date = currentLocal.due_date || '';
    if (currentLocal.tag_id !== (task.tag_id || '')) input.tag_id = currentLocal.tag_id || '';
    if (currentLocal.recurrence !== (task.recurrence || '')) input.recurrence = currentLocal.recurrence || '';
    if (Object.keys(input).length === 1) return;
    mutateRef.current(input, { onSuccess: () => { originalRef.current = currentLocal; }, onError: () => { toast.error('保存失败'); } });
  }, []);

  useEffect(() => {
    if (!local || !originalRef.current) return;
    const orig = originalRef.current;
    const hasChanges = local.title !== orig.title || local.priority !== orig.priority || local.due_date !== orig.due_date ||
      local.tag_id !== orig.tag_id || local.recurrence !== orig.recurrence;
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
    setSelectedTaskId(null);
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        toast.success(
          () => (
            <span>任务已删除 &middot; <button onClick={() => { createTask.mutate({ title: deletedTask.title, description: deletedTask.description, priority: deletedTask.priority, due_date: deletedTask.due_date || undefined, tag_id: deletedTask.tag_id || undefined, parent_task_id: deletedTask.parent_task_id || undefined }); toast.dismiss(); }} className="font-bold text-[#1B2A4A] hover:text-[#0F1A2E] rounded px-1.5 py-0.5 text-xs">撤销</button></span>
          ),
          { duration: 8000 },
        );
      },
    });
  };

  const toggleComplete = () => { const next = !local.is_completed; updateTask.mutate({ id: task.id, is_completed: next }); setLocal((prev) => (prev ? { ...prev, is_completed: next } : null)); };
  const priorityInfo = priorityConfig[local.priority] || priorityConfig[0];
  const taskTag = tags?.find((t) => t.id === local.tag_id);

  const completedCount = children.filter((c) => c.is_completed).length;

  return (
    <div className="space-y-5">
      {/* ── Title + Quick Actions ── */}
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <button onClick={toggleComplete} className={cn('w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200',
            local.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6] hover:bg-[#7C72F6]/[0.06]')}>
            {local.is_completed && <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
          <div className="flex-1 min-w-0">
            <input value={local.title} onChange={(e) => update({ title: e.target.value })}
              className={cn('w-full text-[18px] font-bold bg-transparent border-b-2 border-transparent hover:border-[#D1D5DB] focus:border-[#7C72F6] outline-none pb-0.5 transition-colors', local.is_completed && 'line-through text-[#9CA3AF]')}
              placeholder="任务标题" />
          </div>
        </div>
        <div className="flex items-center gap-2 pl-10">
          <button onClick={() => { const isMyDay = task.my_day_date === todayISO(); updateTask.mutate({ id: task.id, my_day_date: isMyDay ? '' : todayISO() }); }}
            className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-lg transition-colors',
              task.my_day_date === todayISO() ? 'text-[#F59E0B] bg-[#FFFBEB] dark:bg-amber-950/30' : 'text-[#6B7280] hover:text-[#F59E0B] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]')}>
            {task.my_day_date === todayISO() ? <SunDim size={13} /> : <Sun size={13} />}
            我的一天
          </button>
          <button onClick={() => { updateTask.mutate({ id: task.id, is_pinned: !task.is_pinned }); }}
            className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-lg transition-colors',
              task.is_pinned ? 'text-[#7C72F6] bg-[#7C72F6]/[0.06] dark:bg-[#7C72F6]/[0.12]' : 'text-[#6B7280] hover:text-[#7C72F6] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]')}>
            <Pin size={13} />
            置顶
          </button>
        </div>
      </div>

      {/* ── Attributes ── */}
      <div>
        <label className="section-label mb-2 block">属性</label>
        <div className="flex flex-wrap items-center gap-2">
          {/* Due Date */}
          <DatePicker value={local.due_date} onChange={(val) => update({ due_date: val })} showTime iconOnly="label" />

          {/* Priority */}
          {local.priority > 0 ? (
            <span ref={priorityBtnRef as any} onClick={() => { setOpenPriority(true); setOpenTag(false); }}
              className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: hexToRgba(PRIORITY_HEX[local.priority], 0.12), color: PRIORITY_HEX[local.priority] }}>
              <Flag size={12} />{priorityLabels[local.priority]}
              <span onClick={(e) => { e.stopPropagation(); update({ priority: 0 }); }}
                className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer"><X size={12} /></span>
            </span>
          ) : (
            <button ref={priorityBtnRef} onClick={() => { setOpenPriority(!openPriority); setOpenTag(false); }}
              className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] transition-colors">
              <Flag size={12} />优先级
            </button>
          )}
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

          {/* Tag */}
          {local.tag_id && taskTag ? (
            <span ref={tagBtnRef as any} onClick={() => { setOpenTag(true); setOpenPriority(false); }}
              className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: hexToRgba(taskTag.color, 0.15), color: taskTag.color }}>
              {taskTag.name}
              <span onClick={(e) => { e.stopPropagation(); update({ tag_id: '' }); }}
                className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer"><X size={12} /></span>
            </span>
          ) : (
            <button ref={tagBtnRef} onClick={() => { setOpenTag(!openTag); setOpenPriority(false); }}
              className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] transition-colors">
              <Tag size={12} />标签
            </button>
          )}
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

          {/* Recurrence */}
          <RecurrencePicker value={local.recurrence} onChange={(val) => update({ recurrence: val })} iconOnly="label" />
        </div>
      </div>

      {/* ── Reminders ── */}
      {local.due_date && <ReminderList taskId={task.id} dueDate={local.due_date} />}

      {/* ── Description ── */}
      <div>
        <label className="section-label mb-2 block">描述</label>
        <textarea value={local.description}
          onChange={(e) => setLocal((prev) => prev ? { ...prev, description: e.target.value } : null)}
          onBlur={() => { const t = taskRef.current; if (t) { mutateRef.current({ id: t.id, description: local.description }, { onSuccess: () => {}, onError: () => {} }); } }}
          placeholder="添加描述..." rows={4}
          className="w-full text-sm px-3 py-2.5 rounded-[10px] border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6] resize-y placeholder:text-[#9CA3AF] min-h-[60px]" />
      </div>

      {/* ── Subtasks with Progress Bar ── */}
      {children.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="section-label">子任务</label>
            <span className="text-[11px] font-medium text-[#6B7280]">{completedCount}/{children.length}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] mb-3 overflow-hidden">
            <div className="h-full rounded-full bg-[#7C72F6] transition-all duration-500 ease-out"
              style={{ width: `${(completedCount / children.length) * 100}%` }} />
          </div>
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

      {/* ── Bottom Actions ── */}
      <div className="pt-4 border-t border-[#F3F4F6] dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <button onClick={handleDelete}
            className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#EF4444] transition-colors px-2 py-1.5 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-red-950/30">
            <Trash2 size={14} />删除</button>
          <button onClick={() => duplicateTask.mutate(task.id)}
            className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#374151] dark:hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]">
            <Copy size={14} />复制</button>
        </div>
      </div>
    </div>
  );
}
