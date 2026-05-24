import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { TaskDetail } from '../tasks/TaskDetail';

export function TaskDetailPanel() {
  const { selectedTaskId, setSelectedTaskId } = useUIStore();
  const isOpen = !!selectedTaskId;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/50 z-30"
            onClick={() => setSelectedTaskId(null)}
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-96 bg-background border-l z-40 overflow-y-auto"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-sm font-medium">Task Details</h3>
              <button
                onClick={() => setSelectedTaskId(null)}
                className="p-1 rounded-md hover:bg-accent transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4">
              <TaskDetail />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
