import { X, CheckCheck, Trash2, FolderInput } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useUpdateTask, useDeleteTask } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { useState } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

export function BulkActionBar() {
  const { selectionMode, selectedTaskIds, exitSelectionMode } = useUIStore();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: tags } = useTags();
  const [showTagPicker, setShowTagPicker] = useState(false);

  const count = selectedTaskIds.size;

  const handleCompleteAll = () => {
    selectedTaskIds.forEach((id) => updateTask.mutate({ id, is_completed: true }));
    toast.success(`${count} task${count > 1 ? 's' : ''} completed`);
    exitSelectionMode();
  };

  const handleDeleteAll = () => {
    if (!confirm(`Delete ${count} task${count > 1 ? 's' : ''}?`)) return;
    selectedTaskIds.forEach((id) => deleteTask.mutate(id));
    toast.success(`${count} task${count > 1 ? 's' : ''} deleted`);
    exitSelectionMode();
  };

  const handleMoveToTag = (tagId: string) => {
    selectedTaskIds.forEach((id) => updateTask.mutate({ id, tag_id: tagId || undefined }));
    toast.success(`Moved ${count} task${count > 1 ? 's' : ''}`);
    setShowTagPicker(false);
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
        <span className="text-sm font-semibold mr-2 tabular-nums">{count} selected</span>

        <button
          onClick={handleCompleteAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm hover:bg-[#7C72F6]/[0.08] dark:hover:bg-[#7C72F6]/[0.12] transition-colors"
        >
          <CheckCheck size={16} className="text-[#7C72F6]" />
          Complete
        </button>

        <button
          onClick={() => setShowTagPicker(!showTagPicker)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors"
        >
          <FolderInput size={16} />
          Move to tag
        </button>

        {showTagPicker && (
          <div className="absolute bottom-full mb-2 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] rounded-xl shadow-xl p-1 min-w-[160px]">
            <button
              onClick={() => handleMoveToTag('')}
              className="w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors"
            >
              No tag
            </button>
            {tags?.map((t) => (
              <button
                key={t.id}
                onClick={() => handleMoveToTag(t.id)}
                className="w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                {t.name}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={handleDeleteAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-950 text-red-500 transition-colors"
        >
          <Trash2 size={16} />
          Delete
        </button>

        <div className="w-px h-6 bg-[#F3F4F6] dark:bg-white/[0.06] mx-1" />

        <button
          onClick={exitSelectionMode}
          className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors"
          aria-label="Close selection mode"
        >
          <X size={16} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
