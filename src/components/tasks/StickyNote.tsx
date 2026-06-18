import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { cn } from '../../lib/cn';
import { toast } from 'sonner';
import { formatDate, isOverdue, todayISO } from '../../lib/date';
import { Flag, Calendar, Sun, Check, RotateCcw, Trash2, Copy, SunDim, PauseCircle, Play, XCircle, Pin } from 'lucide-react';
import { priorityColors, priorityLabels } from '../../lib/priority';
import { useUpdateTask, useDeleteTask, useCreateTask } from '../../hooks/useTasks';
import { useUIStore } from '../../stores/uiStore';
import { Portal } from '../shared/Portal';
import type { Task } from '../../types/task';
import { stripHtml } from '../../lib/html';

interface StickyNoteProps {
  task: Task;
  colors: { bg: string; border: string; darkBg: string; darkBorder: string };
  rotation: number;
  isExpanded?: boolean;
  onExpand?: () => void;
}

export function StickyNote({ task, colors, rotation, onExpand }: StickyNoteProps) {
  const selectionMode = useUIStore((s) => s.selectionMode);
  const selectedTaskIds = useUIStore((s) => s.selectedTaskIds);
  const toggleTaskSelection = useUIStore((s) => s.toggleTaskSelection);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === 'dark' || theme === 'glass' || theme === 'warm' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const isSelected = selectedTaskIds.has(task.id);
  const overdue = !task.is_suspended && !task.is_abandoned && isOverdue(task.due_date);

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();

  const [isHovered, setIsHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rawX: number; rawY: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const doDelete = () => {
    const deleted = task;
    const deletedChildren = task.children || [];
    if (selectedTaskIds.has(task.id)) setSelectedTaskId(null);
    deleteTask.mutate(task.id);
    toast.success(
      () => (<span>任务已删除 &middot; <button onClick={async () => { const parent = await createTask.mutateAsync({ title: deleted.title, description: deleted.description, priority: deleted.priority, due_date: deleted.due_date || undefined, tag_id: deleted.tag_id || undefined, parent_task_id: deleted.parent_task_id || undefined }); for (const child of deletedChildren) { await createTask.mutateAsync({ title: child.title, parent_task_id: parent.id }); } toast.dismiss(); }} className="font-bold text-[#1B2A4A] hover:text-[#0F1A2E] rounded px-1.5 py-0.5 text-xs">撤销</button></span>),
      { duration: 8000 },
    );
    setContextMenu(null);
  };

  const handleDeleteClick = () => {
    if ((task.children?.length || 0) > 0) {
      setShowDeleteConfirm(true);
      return;
    }
    doDelete();
  };
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  // 测量菜单实际尺寸并调整位置
  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const padding = 8;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let { x, y } = contextMenu;

    if (x + rect.width + padding > viewportW) x = viewportW - rect.width - padding;
    if (x - padding < 0) x = padding;
    if (y + rect.height + padding > viewportH) y = viewportH - rect.height - padding;
    if (y - padding < 0) y = padding;

    if (x !== contextMenu.x || y !== contextMenu.y) {
      setContextMenu(prev => prev ? { ...prev, x, y } : null);
    }
  }, [contextMenu?.x, contextMenu?.y]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, rawX: e.clientX, rawY: e.clientY });
  };

  const bg = isDark ? colors.darkBg : colors.bg;
  const border = isDark ? colors.darkBorder : colors.border;

  // 光感渐变叠加层 — 模拟光线从左上角照射在便签纸上的微光效果
  const glowOverlay = isDark
    ? 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.04) 100%)'
    : 'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 30%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.03) 100%)';

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (selectionMode) { toggleTaskSelection(task.id); return; }
        onExpand?.();
      }}
      onContextMenu={handleContextMenu}
      className={cn(
        'rounded-lg border cursor-pointer transition-all duration-200 select-none',
        'hover:shadow-lg hover:-translate-y-0.5',
        task.is_completed && 'opacity-40',
        task.is_suspended && 'opacity-50 grayscale',
        task.is_abandoned && 'opacity-40 grayscale',
        isSelected && 'ring-2 ring-[#7C72F6] ring-inset ring-offset-0',
      )}
      style={{
        background: `${glowOverlay}, ${task.is_completed ? (isDark ? colors.darkBg + '80' : colors.bg + '60') : bg}`,
        borderColor: task.is_completed ? (isDark ? colors.darkBorder + '60' : colors.border + '50') : border,
        padding: '12px 14px',
        transform: `rotate(${rotation}deg)${isHovered ? ' scale(1.02)' : ''}`,
        boxShadow: isHovered ? '0 4px 16px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <div className="absolute top-2 right-2">
          <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
            isSelected ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] bg-white/80')}>
            {isSelected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
        </div>
      )}

      {/* Title */}
      <div className="flex items-start gap-2 mb-2">
        {task.is_pinned && <span className="text-[#7C72F6] text-[10px]" title="置顶">📌</span>}
        <span className={cn('text-[14px] font-semibold leading-snug flex-1 break-all',
          task.is_completed && 'line-through opacity-70',
          isDark ? 'text-[#e0d5b8]' : 'text-[#333]')}>
          {task.title}
        </span>
      </div>

      {/* Description preview */}
      {task.description && (
        <p className={cn('text-[11px] mb-2 line-clamp-2 leading-relaxed', task.is_completed && 'opacity-60', isDark ? 'text-[#9e947a]' : 'text-[#666]')}>
          {stripHtml(task.description)}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {task.priority > 0 && (
          <span className={cn('text-[11px] flex items-center gap-0.5 font-medium', priorityColors[task.priority])}>
            <Flag size={10} />{priorityLabels[task.priority]}
          </span>
        )}
        {task.my_day_date && (
          <span className="text-amber-500" title="我的一天"><Sun size={11} /></span>
        )}
        {task.due_date && (
          <span className={cn('text-[11px] flex items-center gap-1', overdue ? 'text-red-500' : isDark ? 'text-[#9e947a]' : 'text-[#888]')}>
            <Calendar size={10} />{formatDate(task.due_date)}
          </span>
        )}
        {(task.children_count || 0) > 0 && (
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', isDark ? 'bg-white/10 text-[#9e947a]' : 'bg-black/5 text-[#666]')}>
            {task.children?.filter(c => c.is_completed).length || 0}/{task.children_count} 子任务
          </span>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div ref={menuRef} style={{ left: contextMenu.x, top: contextMenu.y }}
            className="fixed z-[200] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-lg shadow-xl py-1 w-[180px]"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-1.5 text-xs text-[#6B7280] border-b border-[#F3F4F6] dark:border-white/[0.07] mb-1 truncate" title={task.title}>{task.title}</div>
            <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_completed: !task.is_completed }); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {task.is_completed ? <><RotateCcw size={15} className="text-[#6B7280]" /> 标记未完成</> : <><Check size={15} className="text-[#7C72F6]" /> 标记完成</>}
            </button>
            <button onClick={(e) => { e.stopPropagation(); const isMyDay = task.my_day_date === todayISO(); updateTask.mutate({ id: task.id, my_day_date: isMyDay ? '' : todayISO() }); toast.success(isMyDay ? '已移出我的一天' : '已加入我的一天'); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {task.my_day_date === todayISO() ? <><SunDim size={15} className="text-[#6B7280]" /> 移出我的一天</> : <><Sun size={15} className="text-amber-500" /> 加入我的一天</>}
            </button>
            <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_pinned: !task.is_pinned }); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {task.is_pinned ? <><Pin size={15} className="text-[#7C72F6]" /> 取消置顶</> : <><Pin size={15} className="text-[#6B7280]" /> 置顶</>}
            </button>
            <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_suspended: !task.is_suspended, is_abandoned: false }); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {task.is_suspended ? <><Play size={15} className="text-[#6B7280]" /> 恢复</> : <><PauseCircle size={15} className="text-[#6B7280]" /> 挂起</>}
            </button>
            <button onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, is_abandoned: !task.is_abandoned, is_suspended: false }); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              {task.is_abandoned ? <><RotateCcw size={15} className="text-[#6B7280]" /> 重新激活</> : <><XCircle size={15} className="text-[#EF4444]" /> 放弃</>}
            </button>
            <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(task.title); toast.success('已复制标题'); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors">
              <Copy size={15} className="text-[#6B7280]" /> 复制标题
            </button>
            <div className="border-t border-[#F3F4F6] dark:border-white/[0.07] mt-1 pt-1">
              <button onClick={handleDeleteClick}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-red-50 text-red-600 transition-colors">
                <Trash2 size={15} /> 删除
              </button>
            </div>
          </div>
        </Portal>
      )}

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
    </div>
  );
}
