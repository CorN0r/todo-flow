import { useState } from 'react';
import { Plus, Calendar, List } from 'lucide-react';
import { useCreateTask } from '../../hooks/useTasks';
import { useLists } from '../../hooks/useLists';
import { cn } from '../../lib/cn';

interface TaskQuickAddProps {
  listId?: string;
  parentTaskId?: string;
  placeholder?: string;
  showListPicker?: boolean;
  showDatePicker?: boolean;
}

export function TaskQuickAdd({ listId, parentTaskId, placeholder = 'Add a task...', showListPicker, showDatePicker }: TaskQuickAddProps) {
  const [title, setTitle] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [selectedListId, setSelectedListId] = useState(listId || '');
  const createTask = useCreateTask();
  const { data: lists } = useLists();

  const handleSubmit = () => {
    if (title.trim()) {
      createTask.mutate({
        title: title.trim(),
        list_id: selectedListId || listId || undefined,
        parent_task_id: parentTaskId,
        due_date: dueDate || undefined,
      });
      setTitle('');
      setDueDate('');
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg border transition-colors flex-wrap',
        isFocused ? 'border-primary/50 bg-accent/30' : 'border-transparent hover:bg-accent/20'
      )}
    >
      <Plus size={16} className="text-muted-foreground flex-shrink-0 ml-1" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
        }}
        placeholder={placeholder}
        className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {((showDatePicker !== false && isFocused) || (showDatePicker === true)) && (
        <div className="flex items-center gap-1">
          <Calendar size={14} className="text-muted-foreground" />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="text-xs px-1.5 py-0.5 rounded border bg-background outline-none w-[130px]"
          />
        </div>
      )}
      {showListPicker && lists && lists.length > 0 && (
        <div className="flex items-center gap-1">
          <List size={14} className="text-muted-foreground" />
          <select
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
            className="text-xs px-1.5 py-0.5 rounded border bg-background outline-none max-w-[100px]"
          >
            <option value="">All</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
