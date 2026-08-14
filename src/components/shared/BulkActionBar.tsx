import { X, CheckCheck, Trash2, FolderInput, CheckSquare, Check } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useUpdateTask, useDeleteTask } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Portal } from './Portal';

export function BulkActionBar() {
  const { selectionMode, selectedTaskIds, selectableIds, exitSelectionMode } = useUIStore();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: tags } = useTags();
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
  const tagBtnRef = useRef<HTMLButtonElement>(null);

  const count = selectedTaskIds.size;
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedTaskIds.has(id));

  const handleCompleteAll = () => {
    selectedTaskIds.forEach((id) => updateTask.mutate({ id, is_completed: true }));
    toast.success(`已完成 ${count} 个任务`);
    exitSelectionMode();
  };

  const handleDeleteAll = () => {
    if (!confirm(`确定删除 ${count} 个任务？`)) return;
    selectedTaskIds.forEach((id) => deleteTask.mutate(id));
    toast.success(`已删除 ${count} 个任务`);
    exitSelectionMode();
  };

  const handleToggleTag = (tagId: string) => {
    setPendingTagIds((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]);
  };

  const handleApplyTags = () => {
    selectedTaskIds.forEach((id) => updateTask.mutate({ id, tag_ids: [...pendingTagIds] }));
    toast.success(`已设置 ${count} 个任务的标签`);
    setShowTagPicker(false);
    setPendingTagIds([]);
    exitSelectionMode();
  };

  const handleClearTags = () => {
    selectedTaskIds.forEach((id) => updateTask.mutate({ id, tag_ids: [] }));
    toast.success(`已清除 ${count} 个任务的标签`);
    setShowTagPicker(false);
    setPendingTagIds([]);
    exitSelectionMode();
  };

  if (!selectionMode) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-2"
      >
        <span className="text-sm font-semibold tabular-nums">已选 {count} 项</span>

        {selectableIds.length > 0 && (
          <button
            onClick={() => useUIStore.getState().selectAllTasks(selectableIds)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors"
          >
            <CheckSquare size={13} className={allSelected ? 'text-[#7C72F6]' : ''} />
            {allSelected ? '取消' : '全选'}
          </button>
        )}

        <button
          onClick={handleCompleteAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm hover:bg-[#7C72F6]/[0.08] dark:hover:bg-[#7C72F6]/[0.12] transition-colors"
        >
          <CheckCheck size={16} className="text-[#7C72F6]" />
          完成
        </button>

        <button
          ref={tagBtnRef}
          onClick={() => setShowTagPicker(!showTagPicker)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors"
        >
          <FolderInput size={16} />
          移动到标签
        </button>

        {showTagPicker && (
          <Portal>
            <div className="fixed inset-0 z-[260]" onClick={() => setShowTagPicker(false)} aria-hidden="true" />
            <div className="fixed z-[270] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] rounded-xl shadow-xl p-1 min-w-[190px]"
              style={(() => {
                const rect = tagBtnRef.current?.getBoundingClientRect();
                if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
                const left = Math.max(4, Math.min(rect.left, window.innerWidth - 198));
                return { bottom: window.innerHeight - rect.top + 8, left };
              })()}>
            {tags?.map((t) => {
              const active = pendingTagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => handleToggleTag(t.id)}
                  className="w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="flex-1 truncate">{t.name}</span>
                  {active && <Check size={14} className="text-[#7C72F6]" />}
                </button>
              );
            })}
            <div className="border-t border-[#F3F4F6] dark:border-white/[0.06] mt-1 pt-1 flex gap-1">
              <button
                onClick={handleClearTags}
                className="px-3 py-1.5 text-sm rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors"
              >
                清除
              </button>
              <button
                onClick={handleApplyTags}
                className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] transition-colors"
              >
                应用
              </button>
            </div>
          </div>
          </Portal>
        )}

        <button
          onClick={handleDeleteAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-950 text-red-500 transition-colors"
        >
          <Trash2 size={16} />
          删除
        </button>

        <div className="w-px h-6 bg-[#F3F4F6] dark:bg-white/[0.06] mx-1" />

        <button
          onClick={exitSelectionMode}
          className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors"
          aria-label="关闭多选"
        >
          <X size={16} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
