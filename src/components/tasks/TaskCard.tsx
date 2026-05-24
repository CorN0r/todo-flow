import { motion } from 'motion/react';
import { cn } from '../../lib/cn';
import type { Task } from '../../types/task';
import { formatDate, isOverdue } from '../../lib/date';
import { Calendar, Flag } from 'lucide-react';
import { useUpdateTask } from '../../hooks/useTasks';
import { useUIStore } from '../../stores/uiStore';

const priorityColors: Record<number, string> = {
  0: 'text-muted-foreground',
  1: 'text-blue-500',
  2: 'text-yellow-500',
  3: 'text-orange-500',
  4: 'text-red-500',
};

const priorityLabels: Record<number, string> = {
  0: '',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Urgent',
};

export function TaskCard({ task }: { task: Task }) {
  const updateTask = useUpdateTask();
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const overdue = isOverdue(task.due_date);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      onClick={() => setSelectedTaskId(task.id)}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer group',
        task.is_completed && 'opacity-60'
      )}
    >
      {/* Checkbox */}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          updateTask.mutate({ id: task.id, is_completed: !task.is_completed });
        }}
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150',
          task.is_completed
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground/50 hover:border-primary hover:bg-primary/10'
        )}
        aria-label={task.is_completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {task.is_completed && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'text-sm block truncate',
            task.is_completed && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </span>
        {task.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {task.description}
          </p>
        )}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {task.priority > 0 && (
          <span className={cn('text-xs', priorityColors[task.priority])} title={priorityLabels[task.priority]}>
            <Flag size={14} />
          </span>
        )}
        {task.due_date && (
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded',
              overdue
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Calendar size={12} className="inline mr-1" />
            {formatDate(task.due_date)}
          </span>
        )}
      </div>
    </motion.div>
  );
}
