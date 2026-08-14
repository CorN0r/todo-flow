import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { X, Flag, Trash2, Sun, SunDim, Pin, Repeat, Tag, Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { todayISO, formatLocalTime } from '../../lib/date';
import { PRIORITY_HEX, hexToRgba, priorityLabels } from '../../lib/priority';
import { useUpdateTask, useDeleteTask, useCreateTask } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { toast } from 'sonner';
import { Portal } from '../shared/Portal';
import { RichTextEditor } from '../shared/RichTextEditor';
import type { Task, UpdateTaskInput } from '../../types/task';
import type { Tag as TagType } from '../../types/tag';
import { formatRecurrence, parseRecurrence, serializeRecurrence, type RecurrenceConfig } from '../../lib/recurrence';
import { DatePicker } from '../shared/DatePicker';

const tagsEqual = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t));

// Theme color definitions matching NOTE_COLORS in StickyWall
const NOTE_THEMES = [
  // Yellow — vivid
  { lightTitle: '#3D3520', lightDesc: '#5A4D30', lightAttr: '#5C4E2A', darkTitle: '#F5E8C0', darkDesc: '#D4C8A0', darkAttr: '#B8A880', accent: '#E8C460' },
  // Pink — vivid
  { lightTitle: '#4A2020', lightDesc: '#6B3030', lightAttr: '#6B2020', darkTitle: '#F8D8D8', darkDesc: '#D8B8B8', darkAttr: '#B89898', accent: '#E87560' },
  // Blue — vivid
  { lightTitle: '#203050', lightDesc: '#304060', lightAttr: '#304070', darkTitle: '#D8E0F0', darkDesc: '#B8C0D8', darkAttr: '#98A0B8', accent: '#7090D0' },
  // Green — vivid
  { lightTitle: '#204030', lightDesc: '#305040', lightAttr: '#305040', darkTitle: '#D8F0E0', darkDesc: '#B8D8C8', darkAttr: '#98C8B8', accent: '#60C070' },
  // Orange — vivid
  { lightTitle: '#4A3020', lightDesc: '#6B4030', lightAttr: '#6B4030', darkTitle: '#F8E0D0', darkDesc: '#D8B8A8', darkAttr: '#B89888', accent: '#E0A050' },
  // Purple — vivid
  { lightTitle: '#302040', lightDesc: '#403050', lightAttr: '#403060', darkTitle: '#E8D8F8', darkDesc: '#C8B8D8', darkAttr: '#A898B8', accent: '#A070D0' },
];

interface ExpandedNoteProps {
  task: Task;
  colors: { bg: string; border: string; darkBg: string; darkBorder: string };
  colorIdx: number;
  rotation: number;
  onClose: () => void;
  isDark: boolean;
}

export function ExpandedNote({ task, colors, colorIdx, rotation, onClose, isDark }: ExpandedNoteProps) {
  // Get theme-specific colors
  const theme = NOTE_THEMES[colorIdx] || NOTE_THEMES[0];
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const { data: tags } = useTags();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [localTitle, setLocalTitle] = useState(task.title);
  const [localDescription, setLocalDescription] = useState(task.description);
  const [localPriority, setLocalPriority] = useState(task.priority);
  const [localDueDate, setLocalDueDate] = useState(task.due_date || '');
  const [localTagIds, setLocalTagIds] = useState<string[]>(task.tag_ids || []);
  const [localRecurrence, setLocalRecurrence] = useState(task.recurrence || '');
  const [showTagPicker, setShowTagPicker] = useState(false);
  const tagBtnRef = useRef<HTMLButtonElement>(null);
  // 跟踪上次从服务器同步的值，用于判断本地是否有未保存的修改
  const lastSyncedRef = useRef({ tag_ids: task.tag_ids || [], due_date: task.due_date || '', recurrence: task.recurrence || '' });

  // Sync local state with task changes
  // 使用函数式 setState 保留本地已修改但尚未保存的值，
  // 防止异步 mutation 返回后旧服务器数据覆盖用户新输入（快速连续选择时的回弹问题）
  useEffect(() => {
    const prev = lastSyncedRef.current;
    setLocalTagIds((cur) => tagsEqual(cur, prev.tag_ids) ? [...(task.tag_ids || [])] : cur);
    setLocalDueDate((cur) => cur === prev.due_date ? (task.due_date || '') : cur);
    setLocalRecurrence((cur) => cur === prev.recurrence ? (task.recurrence || '') : cur);
    lastSyncedRef.current = { tag_ids: task.tag_ids || [], due_date: task.due_date || '', recurrence: task.recurrence || '' };
  }, [task.id, task.tag_ids, task.due_date, task.recurrence]);

  const tagMap = useMemo(() => {
    if (!tags) return new Map();
    return new Map(tags.map((t) => [t.id, t]));
  }, [tags]);
  const localTags = (localTagIds || []).map((id) => tagMap.get(id)).filter((t): t is TagType => !!t);
  const priorityInfo = PRIORITY_HEX[localPriority] || '#9CA3AF';
  // overdue computed inline where needed

  const handleUpdate = useCallback((patch: { [K in keyof UpdateTaskInput]?: UpdateTaskInput[K] }) => {
    updateTask.mutate({ id: task.id, ...patch });
  }, [task.id, updateTask]);

  const toggleTag = useCallback((tagId: string) => {
    setLocalTagIds((prev) => {
      const next = prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId];
      handleUpdate({ tag_ids: next });
      return next;
    });
  }, [handleUpdate]);

  // Cycle through recurrence presets
  const cycleRecurrence = useCallback(() => {
    const types: (RecurrenceConfig['type'] | '')[] = ['', 'daily', 'weekly', 'monthly'];
    // Parse current recurrence to get the type
    const config = parseRecurrence(localRecurrence || '');
    const currentType = config?.type || '';
    const currentIndex = types.indexOf(currentType);
    const nextIndex = (currentIndex + 1) % types.length;
    const nextType = types[nextIndex];
    const nextRec = nextType ? serializeRecurrence({ type: nextType, interval: 1 }) : '';
    setLocalRecurrence(nextRec);
    handleUpdate({ recurrence: nextRec }); // pass '' directly, not undefined
  }, [localRecurrence, handleUpdate]);

  const handleDelete = () => {
    if ((task.children?.length || 0) > 0) {
      setShowDeleteConfirm(true);
      return;
    }
    doDelete();
  };

  const doDelete = () => {
    onClose();
    const deleted = task;
    const deletedChildren = task.children || [];
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        toast.success(() => (
          <span>任务已删除 &middot; <button onClick={async () => { const parent = await createTask.mutateAsync({ title: deleted.title, description: deleted.description, priority: deleted.priority, due_date: deleted.due_date || undefined, tag_ids: deleted.tag_ids, parent_task_id: deleted.parent_task_id || undefined }); for (const child of deletedChildren) { await createTask.mutateAsync({ title: child.title, parent_task_id: parent.id }); } toast.dismiss(); }} className="font-bold text-[#1B2A4A] hover:text-[#0F1A2E] rounded px-1.5 py-0.5 text-xs">撤销</button></span>
        ), { duration: 8000 });
      },
    });
  };

  // 光感渐变叠加层 — 展开视图使用更丰富的渐变模拟光照打在便签上的效果
  const glowOverlay = isDark
    ? 'linear-gradient(145deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.06) 100%)'
    : 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 30%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.04) 100%)';

  const baseBg = isDark ? colors.darkBg : colors.bg;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[250] flex items-center justify-center p-6"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Expanded note */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: rotation * 2 }}
        animate={{ scale: 1, opacity: 1, rotate: rotation }}
        exit={{ scale: 0.3, opacity: 0, rotate: rotation * 2 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: `${glowOverlay}, ${baseBg}`, borderColor: isDark ? colors.darkBorder : colors.border, borderWidth: '1px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-4 pb-2"
          style={{
            background: hexToRgba(baseBg, isDark ? 0.85 : 0.82),
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}>
          <div className="flex items-center gap-2">
            <button onClick={() => { handleUpdate({ is_completed: !task.is_completed }); }}
              className={cn('w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors', task.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]')}>
              {task.is_completed && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>
            <span className={cn('text-[10px] font-medium', isDark ? 'text-[#7a7260]' : 'text-[#6B6040]')}>#{task.id.slice(0, 6)}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"><X size={16} className={isDark ? 'text-[#9e947a]' : 'text-[#6B6040]'} /></button>
        </div>

        {/* Title */}
        <div className="px-5 mb-3">
          <input value={localTitle} onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={() => { if (localTitle.trim() !== task.title) handleUpdate({ title: localTitle.trim() }); }}
            className="w-full text-[20px] font-bold bg-transparent border-b-2 border-transparent hover:border-[#D1D5DB] focus:border-[#7C72F6] outline-none pb-1 break-all transition-colors"
            style={{
              color: isDark ? theme.darkTitle : theme.lightTitle,
              opacity: task.is_completed ? 0.5 : 1,
            }}
            placeholder="任务标题" />
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-2 px-5 mb-4">
          <button onClick={() => { handleUpdate({ my_day_date: task.my_day_date === todayISO() ? '' : todayISO() }); }}
            className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity', task.my_day_date === todayISO() ? 'text-[#F59E0B] bg-[#FFFBEB]' : 'text-[#9CA3AF] bg-[#F3F4F6]')}>
            {task.my_day_date === todayISO() ? <SunDim size={11} /> : <Sun size={11} />}我的一天
          </button>
          <button onClick={() => { handleUpdate({ is_pinned: !task.is_pinned }); }}
            className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity', task.is_pinned ? 'text-[#7C72F6] bg-[#7C72F6]/[0.06]' : 'text-[#9CA3AF] bg-[#F3F4F6]')}>
            <Pin size={11} />{task.is_pinned ? '已置顶' : '置顶'}
          </button>
        </div>

        {/* Attributes */}
        <div className="px-5 mb-4">
          <div className="text-[10px] font-semibold tracking-wide mb-2" style={{ color: isDark ? theme.darkAttr : theme.lightAttr }}>属性</div>
          <div className="flex flex-wrap gap-1.5">
            {/* Priority */}
            <button onClick={() => { const next = (localPriority + 1) % 5; setLocalPriority(next); handleUpdate({ priority: next }); }}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium cursor-pointer"
              style={{ backgroundColor: hexToRgba(priorityInfo, 0.12), color: priorityInfo }}>
              <Flag size={10} />{priorityLabels[localPriority]}
            </button>
            {/* Tag - multi-select */}
            {localTags.map((t) => (
              <span key={t.id} onClick={() => setShowTagPicker(true)}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity"
                style={{ backgroundColor: hexToRgba(t.color, 0.15), color: t.color }}>
                {t.name}
                <span onClick={(e) => { e.stopPropagation(); const next = localTagIds.filter((id) => id !== t.id); setLocalTagIds(next); handleUpdate({ tag_ids: next }); }}
                  className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer"><X size={10} /></span>
              </span>
            ))}
            <button ref={tagBtnRef} onClick={() => setShowTagPicker(true)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: hexToRgba('#9CA3AF', 0.12), color: '#9CA3AF' }}>
              <Tag size={10} />{localTags.length > 0 ? '添加' : '标签'}
            </button>
            {showTagPicker && (
              <Portal>
                <div className="fixed inset-0 z-40" onClick={() => setShowTagPicker(false)} />
                <div className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[160px]"
                  style={{ top: (tagBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: tagBtnRef.current?.getBoundingClientRect().left ?? 0 }}>
                  {tags?.map((t) => {
                    const active = localTagIds.includes(t.id);
                    return (
                      <button key={t.id} onClick={() => { toggleTag(t.id); }}
                        className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] flex items-center gap-2 ${active ? 'text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90'}`}>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />{t.name}
                        {active && <Check size={13} className="ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </Portal>
            )}
            {/* Due date - DatePicker */}
            <DatePicker
              value={localDueDate}
              onChange={(val) => { setLocalDueDate(val); handleUpdate({ due_date: val }); }}
              iconOnly="label"
            />
            {/* Recurrence - click to cycle */}
            <button onClick={cycleRecurrence} className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity', localRecurrence ? 'text-[#F59E0B] bg-[#F59E0B]/[0.10]' : 'text-[#9CA3AF] bg-[#F3F4F6]')}>
              <Repeat size={10} />{formatRecurrence(localRecurrence)}
            </button>
          </div>
        </div>

        {/* Description */}
        <div className="px-5 mb-4">
          <div className="text-[10px] font-semibold tracking-wide mb-2" style={{ color: isDark ? theme.darkAttr : theme.lightAttr }}>描述</div>
          <RichTextEditor
            key={task.id}
            value={localDescription}
            onChange={(html) => { setLocalDescription(html); handleUpdate({ description: html }); }}
            placeholder="添加描述..."
            variant="sticky"
          />
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-5 py-3 flex items-center justify-between"
          style={{
            background: hexToRgba(baseBg, isDark ? 0.85 : 0.82),
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          }}>
          <span className="text-[10px]" style={{ color: isDark ? theme.darkAttr : theme.lightAttr }}>创建于 {formatLocalTime(task.created_at)}</span>
          <button onClick={handleDelete}
            className="flex items-center gap-1 text-[11px] transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
            style={{ color: isDark ? theme.darkAttr : theme.lightAttr }}>
            <Trash2 size={12} />删除
          </button>
        </div>
      </motion.div>

    {/* Delete confirm dialog */}
    {showDeleteConfirm && (
      <Portal>
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-[#1e1e32] rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-[#111827] dark:text-white/90 mb-1 font-medium">确认删除</p>
            <p className="text-[13px] text-[#6B7280] mb-5">此任务包含 {task.children?.length || 0} 个子任务，删除后将一并移除，不可恢复。</p>
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
    </motion.div>
  );
}
