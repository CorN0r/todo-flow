import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, Flag, Trash2, Sun, SunDim, Pin } from 'lucide-react';
import { cn } from '../../lib/cn';
import { todayISO, isOverdue, formatDate } from '../../lib/date';
import { priorityColors, priorityLabels, PRIORITY_HEX, hexToRgba } from '../../lib/priority';
import { useUpdateTask, useDeleteTask, useCreateTask } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { useUIStore } from '../../stores/uiStore';
import { toast } from 'sonner';
import type { Task } from '../../types/task';

interface ExpandedNoteProps {
  task: Task;
  colors: { bg: string; border: string; darkBg: string; darkBorder: string };
  rotation: number;
  onClose: () => void;
  isDark: boolean;
}

export function ExpandedNote({ task, colors, rotation, onClose, isDark }: ExpandedNoteProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const { data: tags } = useTags();
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);

  const [localTitle, setLocalTitle] = useState(task.title);
  const [localDescription, setLocalDescription] = useState(task.description);
  const [localPriority, setLocalPriority] = useState(task.priority);
  const [localDueDate, setLocalDueDate] = useState(task.due_date || '');
  const [localTagId, setLocalTagId] = useState(task.tag_id || '');
  const [localRecurrence, setLocalRecurrence] = useState(task.recurrence || '');

  const taskTag = tags?.find((t) => t.id === localTagId);
  const priorityInfo = PRIORITY_HEX[localPriority] || '#9CA3AF';
  const overdue = isOverdue(localDueDate);

  const saveDebounced = useCallback((patch: Partial<Task>) => {
    updateTask.mutate({ id: task.id, ...patch });
  }, [task.id, updateTask]);

  const handleDelete = () => {
    onClose();
    const deleted = task;
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        toast.success(() => (
          <span>任务已删除 &middot; <button onClick={() => { createTask.mutate({ title: deleted.title, description: deleted.description, priority: deleted.priority, due_date: deleted.due_date || undefined, tag_id: deleted.tag_id || undefined, parent_task_id: deleted.parent_task_id || undefined }); toast.dismiss(); }} className="font-bold text-[#1B2A4A] hover:text-[#0F1A2E] rounded px-1.5 py-0.5 text-xs">撤销</button></span>
        ), { duration: 8000 });
      },
    });
  };

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
        className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ backgroundColor: isDark ? colors.darkBg : colors.bg, borderColor: isDark ? colors.darkBorder : colors.border, borderWidth: '1px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-4 pb-2" style={{ backgroundColor: 'inherit' }}>
          <div className="flex items-center gap-2">
            <button onClick={() => { saveDebounced({ is_completed: !task.is_completed }); }}
              className={cn('w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors', task.is_completed ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]')}>
              {task.is_completed && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>
            <span className={cn('text-[10px] text-[#9CA3AF]', isDark && 'text-[#7a7260]')}>#{task.id.slice(0, 6)}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"><X size={16} className={isDark ? 'text-[#9e947a]' : 'text-[#666]'} /></button>
        </div>

        {/* Title */}
        <div className="px-5 mb-3">
          <input value={localTitle} onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={() => { if (localTitle.trim() !== task.title) saveDebounced({ title: localTitle.trim() }); }}
            className={cn('w-full text-[20px] font-bold bg-transparent border-b-2 border-transparent hover:border-[#D1D5DB] focus:border-[#7C72F6] outline-none pb-1 break-all', task.is_completed && 'line-through', isDark ? 'text-[#e0d5b8]' : 'text-[#333]')}
            placeholder="任务标题" />
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-2 px-5 mb-4">
          <button onClick={() => { saveDebounced({ my_day_date: task.my_day_date === todayISO() ? '' : todayISO() }); }}
            className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium', task.my_day_date === todayISO() ? 'text-[#F59E0B] bg-[#FFFBEB]' : 'text-[#9CA3AF] bg-[#F3F4F6]')}>
            {task.my_day_date === todayISO() ? <SunDim size={11} /> : <Sun size={11} />}我的一天
          </button>
          <button onClick={() => { saveDebounced({ is_pinned: !task.is_pinned }); }}
            className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium', task.is_pinned ? 'text-[#7C72F6] bg-[#7C72F6]/[0.06]' : 'text-[#9CA3AF] bg-[#F3F4F6]')}>
            <Pin size={11} />{task.is_pinned ? '已置顶' : '置顶'}
          </button>
        </div>

        {/* Attributes */}
        <div className="px-5 mb-4">
          <div className="text-[10px] text-[#9CA3AF] font-semibold tracking-wide mb-2">属性</div>
          <div className="flex flex-wrap gap-1.5">
            {/* Priority */}
            <button onClick={() => { const next = (localPriority + 1) % 5; setLocalPriority(next); saveDebounced({ priority: next }); }}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: hexToRgba(priorityInfo, 0.12), color: priorityInfo }}>
              <Flag size={10} />{priorityLabels[localPriority]}
            </button>
            {/* Tag */}
            {taskTag ? (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: hexToRgba(taskTag.color, 0.15), color: taskTag.color }}>
                {taskTag.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium text-[#9CA3AF] bg-[#F3F4F6]">标签</span>
            )}
            {/* Due date */}
            {localDueDate ? (
              <span className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium', overdue ? 'text-red-500 bg-red-50' : 'text-[#7C72F6] bg-[#7C72F6]/[0.08]')}>
                {formatDate(localDueDate)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium text-[#9CA3AF] bg-[#F3F4F6]">截止日期</span>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="px-5 mb-4">
          <div className="text-[10px] text-[#9CA3AF] font-semibold tracking-wide mb-2">描述</div>
          <textarea value={localDescription} onChange={(e) => setLocalDescription(e.target.value)}
            onBlur={() => { if (localDescription !== task.description) saveDebounced({ description: localDescription }); }}
            placeholder="添加描述..." rows={3}
            className={cn('w-full text-[13px] px-3 py-2 rounded-lg border resize-none outline-none focus:ring-1 focus:ring-[#7C72F6]/30', isDark ? 'bg-white/[0.04] border-white/[0.08] text-[#e0d5b8]' : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#333]')} />
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-5 py-3 flex items-center justify-between border-t" style={{ backgroundColor: 'inherit', borderColor: isDark ? 'rgba(201,168,76,0.1)' : '#F3F4F6' }}>
          <span className="text-[10px] text-[#9CA3AF]">创建于 {new Date(task.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          <button onClick={handleDelete}
            className="flex items-center gap-1 text-[11px] text-[#9CA3AF] hover:text-[#EF4444] transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
            <Trash2 size={12} />删除
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
