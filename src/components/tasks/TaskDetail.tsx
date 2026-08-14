import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTask, useUpdateTask, useDeleteTask, useCreateTask } from '../../hooks/useTasks';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTags } from '../../hooks/useTags';
import { useTaskNotes, useToggleTaskNote } from '../../hooks/useTaskNotes';
import { useUIStore } from '../../stores/uiStore';
import { todayISO, isOverdue, formatLocalTime } from '../../lib/date';
import { cn } from '../../lib/cn';
import type { UpdateTaskInput } from '../../types/task';
import type { Tag as TagType } from '../../types/tag';
import { Trash2, Tag, Flag, Sun, SunDim, Pin, X, Check, SlidersHorizontal, AlignLeft, ListChecks, Activity, Plus, Timer, Sparkles } from 'lucide-react';
import { usePomodoroStore } from '../../stores/pomodoroStore';
import { RecurrencePicker } from '../shared/RecurrencePicker';
import { DatePicker } from '../shared/DatePicker';
import { ReminderList } from '../shared/ReminderList';
import { RichTextEditor } from '../shared/RichTextEditor';
import { Portal } from '../shared/Portal';
import { SubtaskReminderButton } from './SubtaskReminderButton';
import { SubtaskDateChip } from './SubtaskDateChip';
import { toast } from 'sonner';
import { hexToRgba, PRIORITY_HEX, priorityLabels } from '../../lib/priority';


const priorityConfig: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: '无', color: 'text-[#6B7280]', bg: 'bg-[#F3F4F6] dark:bg-white/[0.06]' },
  1: { label: '低', color: 'text-[#3B82F6]', bg: 'bg-[#EFF6FF] dark:bg-[#172554]' },
  2: { label: '中', color: 'text-[#F59E0B]', bg: 'bg-[#FFFBEB] dark:bg-[#451A03]' },
  3: { label: '高', color: 'text-[#F97316]', bg: 'bg-[#FFF7ED] dark:bg-[#431407]' },
  4: { label: '紧急', color: 'text-[#EF4444]', bg: 'bg-[#FEF2F2] dark:bg-[#450A0A]' },
};

const tagsEqual = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t));

interface LocalState {
  title: string;
  description: string;
  priority: number;
  due_date: string;
  tag_ids: string[];
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

function SubtasksAddForm({ taskId, parentTaskId }: { taskId: string; parentTaskId: string }) {
  const createTask = useCreateTask();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const t = title.trim();
    if (!t) return;
    createTask.mutate({ title: t, parent_task_id: taskId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['task', parentTaskId || taskId] });
        setTitle('');
        inputRef.current?.focus();
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        placeholder="添加子任务..."
        className="flex-1 text-[13px] px-3 py-1.5 rounded-lg border border-dashed border-[#D1D5DB] dark:border-white/[0.10] bg-transparent outline-none focus:border-[#7C72F6] text-[#111827] dark:text-white/90 placeholder:text-[#9CA3AF]" />
      <button onClick={handleAdd} disabled={!title.trim()}
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
        <Plus size={14} style={{ strokeWidth: 2.5 }} />
      </button>
    </div>
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
  const { data: tags } = useTags();
  const { data: taskNotes } = useTaskNotes();
  const toggleTaskNote = useToggleTaskNote();
  const { t: _t } = useTranslation();

  const [local, setLocal] = useState<LocalState | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalRef = useRef<LocalState | null>(null);
  const taskRef = useRef(detail?.task);
  const mutateRef = useRef(updateTask.mutate);
  const localRef = useRef<LocalState | null>(null);
  useEffect(() => { mutateRef.current = updateTask.mutate; });
  useEffect(() => { localRef.current = local; });

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
      const server = { title: detail.task.title, description: detail.task.description, priority: detail.task.priority,
        due_date: detail.task.due_date || '', tag_ids: detail.task.tag_ids || [],
        recurrence: detail.task.recurrence || '', is_completed: detail.task.is_completed };
      // 使用函数式更新，在运行时保留本地已修改但尚未保存的字段，
      // 防止异步 doSave 返回后旧服务器数据覆盖用户新输入（快速连续选择时的回弹问题）
      setLocal((prev) => {
        if (!prev) return server;
        const orig = originalRef.current;
        if (!orig) return server;
        const merged = { ...server };
        for (const key of Object.keys(merged) as (keyof LocalState)[]) {
          if (key === 'tag_ids') {
            if (!tagsEqual(prev[key] as string[], orig[key] as string[])) {
              (merged as any)[key] = prev[key];
            }
          } else if (prev[key] !== orig[key]) {
            (merged as any)[key] = prev[key];
          }
        }
        return merged;
      });
      // 🔍 诊断：记录服务器返回的描述
      const hasImg = /<img[^>]+src="data:/.test(server.description);
      console.log(`[LOAD] server desc len=${server.description.length} hasImg=${hasImg} content="${server.description.slice(0, 80)}"`);
      originalRef.current = server;
    }
  }, [detail?.task.id, detail?.task.updated_at, selectedTaskId]);

  const doSave = useCallback((currentLocal: LocalState) => {
    const task = taskRef.current;
    if (!task) return;
    const input: UpdateTaskInput = { id: task.id };
    if (currentLocal.title !== task.title) input.title = currentLocal.title;
    if (currentLocal.description !== task.description) input.description = currentLocal.description;
    if (currentLocal.priority !== task.priority) input.priority = currentLocal.priority;
    if (currentLocal.due_date !== (task.due_date || '')) input.due_date = currentLocal.due_date || '';
    if (!tagsEqual(currentLocal.tag_ids, task.tag_ids || [])) input.tag_ids = currentLocal.tag_ids;
    if (currentLocal.recurrence !== (task.recurrence || '')) input.recurrence = currentLocal.recurrence || '';
    if (Object.keys(input).length === 1) return;
    // 🔍 诊断：记录描述长度
    if (input.description !== undefined) {
      const hasImg = /<img[^>]+src="data:/.test(input.description);
      console.log(`[SAVE] desc len=${input.description.length} hasImg=${hasImg} changed=${currentLocal.description !== task.description}`);
    }
    mutateRef.current(input, { onSuccess: () => { originalRef.current = currentLocal; }, onError: () => { toast.error('保存失败'); } });
  }, []);

  useEffect(() => {
    if (!local || !originalRef.current) return;
    const orig = originalRef.current;
    const hasChanges = local.title !== orig.title || local.description !== orig.description || local.priority !== orig.priority || local.due_date !== orig.due_date ||
      !tagsEqual(local.tag_ids, orig.tag_ids) || local.recurrence !== orig.recurrence;
    if (!hasChanges) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveTimerRef.current = null; doSave(local); }, 800);
    return () => { if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; doSave(local); } };
  }, [local, doSave]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const update = (patch: Partial<LocalState>) => { setLocal((prev) => (prev ? { ...prev, ...patch } : null)); };

  // Hooks 必须在所有条件 return 之前调用
  const tagMap = useMemo(() => {
    if (!tags) return new Map();
    return new Map(tags.map((t) => [t.id, t]));
  }, [tags]);

  if (!selectedTaskId) return null;
  if (isLoading) return <p className="text-sm text-[#9CA3AF] py-8 text-center">加载中...</p>;
  if (!detail || !local) return <p className="text-sm text-[#9CA3AF] py-8 text-center">未找到任务</p>;

  const { task, children } = detail;

  const handleDelete = () => {
    if (children.length > 0) {
      setShowDeleteConfirm(true);
      return;
    }
    doDelete();
  };

  const doDelete = () => {
    const deletedTask = task;
    const deletedChildren = children;
    setSelectedTaskId(null);
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        toast.success(
          () => (
            <span>任务已删除 &middot; <button onClick={async () => {
              const parent = await createTask.mutateAsync({
                title: deletedTask.title, description: deletedTask.description,
                priority: deletedTask.priority, due_date: deletedTask.due_date || undefined,
                tag_ids: deletedTask.tag_ids,
                parent_task_id: deletedTask.parent_task_id || undefined,
                recurrence: deletedTask.recurrence || undefined,
              });
              for (const child of deletedChildren) {
                await createTask.mutateAsync({ title: child.title, parent_task_id: parent.id });
              }
              toast.dismiss();
            }} className="font-bold text-[#1B2A4A] hover:text-[#0F1A2E] rounded px-1.5 py-0.5 text-xs">撤销</button></span>
          ),
          { duration: 8000 },
        );
      },
    });
  };

  const toggleComplete = () => { const next = !local.is_completed; updateTask.mutate({ id: task.id, is_completed: next }); setLocal((prev) => (prev ? { ...prev, is_completed: next } : null)); };
  const localTags = (local.tag_ids || []).map((id) => tagMap.get(id)).filter((t): t is TagType => !!t);
  const hasNote = (taskNotes || []).some((n) => n.task_id === task.id);

  const completedCount = children.filter((c) => c.is_completed).length;

  return (
    <>
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
            {task.source === 'agent' && (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-[#7C72F6]">
                <Sparkles size={12} />
                由 Agent 创建
              </div>
            )}
          </div>
        </div>
        <div className="h-px bg-[#F3F4F6] dark:bg-white/[0.06] my-1" />
        <div className="flex items-center gap-1.5 mb-1">
          <Activity size={13} className="text-[#6B7280]" />
          <label className="section-label">状态</label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { const isMyDay = task.my_day_date === todayISO(); updateTask.mutate({ id: task.id, my_day_date: isMyDay ? '' : todayISO() }); }}
            className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-full transition-colors',
              task.my_day_date === todayISO() ? 'text-[#F59E0B] bg-[#FFFBEB] dark:bg-amber-950/30' : 'text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04] hover:text-[#F59E0B] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08]')}>
            {task.my_day_date === todayISO() ? <SunDim size={13} /> : <Sun size={13} />}
            我的一天
          </button>
          <button onClick={() => { updateTask.mutate({ id: task.id, is_pinned: !task.is_pinned }); }}
            className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-full transition-colors',
              task.is_pinned ? 'text-[#7C72F6] bg-[#7C72F6]/[0.06] dark:bg-[#7C72F6]/[0.12]' : 'text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04] hover:text-[#7C72F6] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08]')}>
            <Pin size={13} />
            置顶
          </button>
          <button onClick={() => { usePomodoroStore.getState().startTimer(task.id, task.title); }}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-full transition-colors text-[#7C72F6] bg-[#7C72F6]/[0.06] dark:bg-[#7C72F6]/[0.12] hover:bg-[#7C72F6]/[0.12] dark:hover:bg-[#7C72F6]/[0.2]">
            <Timer size={13} />
            番茄钟
          </button>
          <button onClick={() => toggleTaskNote(task.id, hasNote)}
            className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-full transition-colors',
              hasNote ? 'text-[#7C72F6] bg-[#7C72F6]/[0.06] dark:bg-[#7C72F6]/[0.12]' : 'text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04] hover:text-[#7C72F6] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08]')}>
            <Pin size={13} />
            {hasNote ? '取消固定' : '固定到桌面'}
          </button>
          {isOverdue(task.due_date) && !task.is_completed && !task.is_suspended && !task.is_abandoned && (
            <span className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium text-[#F97316] bg-[#FFF7ED] dark:bg-orange-950/30">超期</span>
          )}
          {task.is_suspended && (
            <button onClick={() => updateTask.mutate({ id: task.id, is_suspended: false })}
              className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04] hover:text-[#6B7280]">
              已挂起
            </button>
          )}
          {task.is_abandoned && (
            <button onClick={() => updateTask.mutate({ id: task.id, is_abandoned: false })}
              className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium text-[#EF4444] bg-[#FEF2F2] dark:bg-red-950/30 hover:text-red-600">
              已放弃
            </button>
          )}
        </div>
      </div>

      {/* ── Attributes ── */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <SlidersHorizontal size={13} className="text-[#6B7280]" />
          <label className="section-label">属性</label>
        </div>
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
          {localTags.map((t) => (
            <span key={t.id} onClick={() => { setOpenTag(true); setOpenPriority(false); }}
              className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: hexToRgba(t.color, 0.15), color: t.color }}>
              {t.name}
              <span onClick={(e) => { e.stopPropagation(); update({ tag_ids: local.tag_ids.filter((id) => id !== t.id) }); }}
                className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer"><X size={12} /></span>
            </span>
          ))}
          <button ref={tagBtnRef} onClick={() => { setOpenTag(!openTag); setOpenPriority(false); }}
            className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] transition-colors">
            <Tag size={12} />{localTags.length > 0 ? '添加' : '标签'}
          </button>
          {openTag && (
            <Portal>
              <div className="fixed inset-0 z-40" onClick={() => setOpenTag(false)} />
              <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[160px]"
                style={{ top: (tagBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: tagBtnRef.current?.getBoundingClientRect().left ?? 0 }}>
                {tags?.map((t) => {
                  const active = local.tag_ids.includes(t.id);
                  return (
                    <button key={t.id} onClick={() => { update({ tag_ids: active ? local.tag_ids.filter((id) => id !== t.id) : [...local.tag_ids, t.id] }); }}
                      className={`w-full text-left px-3 py-2 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] flex items-center gap-2 ${active ? 'text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90'}`}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />{t.name}
                      {active && <Check size={13} className="ml-auto" />}
                    </button>
                  );
                })}
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
        <div className="flex items-center gap-1.5 mb-2">
          <AlignLeft size={13} className="text-[#6B7280]" />
          <label className="section-label">描述</label>
        </div>
        <RichTextEditor
          key={selectedTaskId}
          value={local.description}
          onChange={(html) => setLocal((prev) => prev ? { ...prev, description: html } : null)}
          onBlur={() => {
            // 编辑器失焦时立即保存，确保内容不丢失
            if (saveTimerRef.current) {
              clearTimeout(saveTimerRef.current);
              saveTimerRef.current = null;
            }
            if (localRef.current) {
              doSave(localRef.current);
            }
          }}
          placeholder="添加描述..."
        />
      </div>

      {/* ── Subtasks ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <ListChecks size={13} className="text-[#6B7280]" />
            <label className="section-label">子任务</label>
          </div>
          {children.length > 0 && <span className="text-[11px] font-medium text-[#6B7280]">{completedCount}/{children.length}</span>}
        </div>
        {children.length > 0 && (
          <>
            <div className="w-full h-1.5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] mb-3 overflow-hidden">
              <div className="h-full rounded-full bg-[#7C72F6] transition-all duration-500 ease-out"
                style={{ width: `${(completedCount / children.length) * 100}%` }} />
            </div>
            <div className="space-y-1 mb-2">
              {children.map((child) => (
                <div key={child.id} className={cn('flex items-center gap-2.5 px-3 py-2 rounded-[10px] border transition-colors group',
                  child.is_completed
                    ? 'bg-[#FAFAFA] dark:bg-white/[0.02] border-[#F3F4F6] dark:border-white/[0.04]'
                    : 'bg-white dark:bg-[#1e1e32] border-[#F3F4F6] dark:border-white/[0.06] hover:border-[#E5E7EB] dark:hover:border-white/[0.08]')}>
                  <button onClick={() => updateTask.mutate({ id: child.id, is_completed: !child.is_completed })}
                    className={cn('w-[18px] h-[18px] rounded-full border-[2px] flex items-center justify-center flex-shrink-0 transition-colors',
                      child.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]')}>
                    {child.is_completed && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                  <EditableSubtaskTitle child={child} />
                  <SubtaskDateChip child={child} />
                  <SubtaskReminderButton child={child} />
                  <button onClick={() => { const deleted = child; deleteTask.mutate(child.id, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['task', task.id] }); toast.success(() => (<span>子任务已删除 &middot; <button onClick={() => { createTask.mutateAsync({ title: deleted.title, parent_task_id: deleted.parent_task_id || undefined }).then(() => { queryClient.invalidateQueries({ queryKey: ['task', task.id] }); }); toast.dismiss(); }} className="font-bold text-[#1B2A4A] hover:text-[#0F1A2E] rounded px-1.5 py-0.5 text-xs">撤销</button></span>), { duration: 8000 }); } }); }}
                    className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-[#9CA3AF] hover:text-[#EF4444] transition-all ml-auto">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        <SubtasksAddForm taskId={task.id} parentTaskId={task.parent_task_id || ''} />
      </div>

      {/* ── Time Info + Bottom Actions ── */}
      <div className="pt-3 border-t border-[#F3F4F6] dark:border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF]">
          <span>创建于</span>
          <span className="text-[#6B7280]">{formatLocalTime(task.created_at)}</span>
          {task.is_completed && (
            <>
              <span className="mx-1 text-[#E5E7EB]">|</span>
              <span>完成于</span>
              <span className="text-[#6B7280]">{formatLocalTime(task.updated_at)}</span>
            </>
          )}
        </div>
        <button onClick={handleDelete}
          className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#EF4444] transition-colors px-2 py-1.5 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-red-950/30 shrink-0">
          <Trash2 size={14} />删除</button>
      </div>
    </div>

    {/* Delete confirm dialog */}
    {showDeleteConfirm && (
      <Portal>
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-[#1e1e32] rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-[#111827] dark:text-white/90 mb-1 font-medium">确认删除</p>
            <p className="text-[13px] text-[#6B7280] mb-5">此任务包含 {children.length} 个子任务，删除后将一并移除，不可恢复。</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg text-[13px] text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors">取消</button>
              <button onClick={() => { setShowDeleteConfirm(false); doDelete(); }}
                className="px-4 py-2 rounded-lg text-[13px] bg-[#EF4444] text-white hover:bg-red-600 transition-colors font-medium">删除</button>
            </div>
          </div>
        </div>
      </Portal>
    )}
    </>
  );
}
