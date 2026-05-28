import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { TaskDetail } from '../tasks/TaskDetail';
import { ErrorBoundary } from '../shared/ErrorBoundary';

export function TaskDetailPanel() {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const isDetailDirty = useUIStore((s) => s.isDetailDirty);
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const isOpen = !!selectedTaskId;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`fixed inset-0 z-30 ${isGlass ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/40'}`}
            onClick={() => setSelectedTaskId(null)}
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className={`fixed right-0 top-0 h-full w-[480px] border-l z-40 overflow-y-auto shadow-2xl ${isGlass ? 'glass-panel-strong border-white/[0.08]' : 'bg-white dark:bg-[#1e1e32] border-[#F3F4F6] dark:border-white/[0.06]'}`}
          >
            {/* Accent bar */}
            <div className="h-0.5 bg-gradient-to-r from-[#7C72F6] to-[#A78BFA]" />

            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isGlass ? 'border-white/[0.06]' : 'border-[#F3F4F6] dark:border-white/[0.07]'}`}>
              <div className="flex items-center gap-3">
                <h3 className="section-label">
                  Task Details
                </h3>
                {isDetailDirty && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#7C72F6]/[0.12] text-[#7C72F6] font-medium">
                    Saving...
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedTaskId(null)}
                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors"
              >
                <X size={16} className="text-[#6B7280]" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <ErrorBoundary>
                <TaskDetail />
              </ErrorBoundary>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
