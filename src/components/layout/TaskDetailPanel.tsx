import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { TaskDetail } from '../tasks/TaskDetail';
import { ErrorBoundary } from '../shared/ErrorBoundary';

export function TaskDetailPanel() {
  const { selectedTaskId, setSelectedTaskId, isDetailDirty } = useUIStore();
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
            className="fixed inset-0 bg-black/40 z-30"
            onClick={() => setSelectedTaskId(null)}
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed right-0 top-0 h-full w-[480px] bg-background border-l border-border z-40 overflow-y-auto shadow-2xl"
          >
            {/* Accent bar */}
            <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                  Task Details
                </h3>
                {isDetailDirty && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 font-medium animate-pulse">
                    Saving...
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedTaskId(null)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <X size={16} className="text-muted-foreground" />
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
