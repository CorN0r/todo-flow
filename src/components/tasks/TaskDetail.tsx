import { useState } from 'react';
import { useTask, useUpdateTask, useDeleteTask, useCreateTask, useDuplicateTask } from '../../hooks/useTasks';
import { useLists } from '../../hooks/useLists';
import { useUIStore } from '../../stores/uiStore';
import { isOverdue } from '../../lib/date';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/cn';
import { Trash2, X, Calendar, Copy, Repeat, List } from 'lucide-react';
import { toast } from 'sonner';
import { TaskQuickAdd } from './TaskQuickAdd';
import { AttachmentZone } from '../attachments/AttachmentZone';

const priorityOptions = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
  { value: 4, label: 'Urgent' },
];

const recurrenceOptions = [
  { value: '', label: 'No repeat' },
  { value: '{"type":"daily","interval":1}', label: 'Daily' },
  { value: '{"type":"weekly","interval":1}', label: 'Weekly' },
  { value: '{"type":"monthly","interval":1}', label: 'Monthly' },
  { value: '{"type":"yearly","interval":1}', label: 'Yearly' },
];

export function TaskDetail() {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const { data: detail, isLoading } = useTask(selectedTaskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const duplicateTask = useDuplicateTask();
  const { data: lists } = useLists();

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  if (!selectedTaskId) return null;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!detail) return <p className="text-sm text-muted-foreground">Task not found</p>;

  const { task, children } = detail;

  const handleDelete = () => {
    const deletedTask = task;
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        setSelectedTaskId(null);
        toast('Task deleted', {
          action: {
            label: 'Undo',
            onClick: () => {
              createTask.mutate({
                title: deletedTask.title,
                description: deletedTask.description,
                priority: deletedTask.priority,
                due_date: deletedTask.due_date || undefined,
                list_id: deletedTask.list_id || undefined,
                parent_task_id: deletedTask.parent_task_id || undefined,
              });
            },
          },
        });
      },
    });
  };

  const startEdit = () => {
    setEditTitle(task.title);
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (editTitle.trim()) {
      updateTask.mutate({ id: task.id, title: editTitle.trim() });
    }
    setIsEditing(false);
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      {isEditing ? (
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') setIsEditing(false);
          }}
          className="w-full text-lg font-semibold bg-transparent border-b outline-none focus:border-primary"
        />
      ) : (
        <h3
          onClick={startEdit}
          className={cn(
            'text-lg font-semibold cursor-pointer hover:text-primary transition-colors',
            task.is_completed && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </h3>
      )}

      {/* Description */}
      <textarea
        value={task.description}
        onChange={(e) => updateTask.mutate({ id: task.id, description: e.target.value })}
        placeholder="Add a description..."
        className="w-full text-sm bg-transparent border rounded-md p-2 resize-none outline-none focus:border-primary min-h-[60px]"
        rows={2}
      />

      {/* Metadata */}
      <div className="flex flex-wrap gap-2">
        {/* Priority */}
        <select
          value={task.priority}
          onChange={(e) => updateTask.mutate({ id: task.id, priority: Number(e.target.value) })}
          className="text-xs px-2 py-1 rounded border bg-background outline-none"
        >
          {priorityOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* List */}
        <div className="flex items-center gap-1">
          <List size={14} className="text-muted-foreground" />
          <select
            value={task.list_id || ''}
            onChange={(e) => updateTask.mutate({ id: task.id, list_id: e.target.value || undefined })}
            className="text-xs px-2 py-1 rounded border bg-background outline-none max-w-[120px]"
          >
            <option value="">No list</option>
            {lists?.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Due date */}
        <div className="flex items-center gap-1">
          <Calendar size={14} className="text-muted-foreground" />
          <input
            type="date"
            value={task.due_date || ''}
            onChange={(e) => updateTask.mutate({ id: task.id, due_date: e.target.value || undefined })}
            className={cn(
              'text-xs px-2 py-1 rounded border bg-background outline-none',
              isOverdue(task.due_date) && 'border-red-500'
            )}
          />
          {task.due_date && (
            <button
              onClick={() => updateTask.mutate({ id: task.id, due_date: '' })}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Recurrence */}
        <div className="flex items-center gap-1">
          <Repeat size={14} className="text-muted-foreground" />
          <select
            value={task.recurrence || ''}
            onChange={(e) => updateTask.mutate({ id: task.id, recurrence: e.target.value || undefined })}
            className="text-xs px-2 py-1 rounded border bg-background outline-none"
          >
            {recurrenceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Subtasks */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Subtasks ({children.length})
        </h4>
        <div className="space-y-1 mb-2 ml-4 border-l-2 border-muted pl-3">
          <AnimatePresence>
            {children.map((child) => (
              <motion.div
                key={child.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 p-2 rounded hover:bg-accent text-sm group"
              >
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  updateTask.mutate({ id: child.id, is_completed: !child.is_completed });
                }}
                className={cn(
                  'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150',
                  child.is_completed
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/50 hover:border-primary hover:bg-primary/10'
                )}
                aria-label={child.is_completed ? 'Mark incomplete' : 'Mark complete'}
              >
                {child.is_completed && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              <span className={cn('flex-1', child.is_completed && 'line-through text-muted-foreground')}>
                {child.title}
              </span>
              <button
                onClick={() => deleteTask.mutate(child.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
        <TaskQuickAdd parentTaskId={task.id} placeholder="Add subtask..." />
      </div>

      {/* Attachments */}
      <AttachmentZone taskId={task.id} />

      {/* Actions */}
      <div className="pt-4 border-t flex items-center justify-between">
        <button
          onClick={handleDelete}
          className="flex items-center gap-2 text-xs text-red-500 hover:text-red-600 transition-colors"
        >
          <Trash2 size={14} />
          Delete task
        </button>
        <button
          onClick={() => duplicateTask.mutate(task.id)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Copy size={14} />
          Duplicate
        </button>
      </div>
    </div>
  );
}
