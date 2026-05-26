import { todayISO } from '../lib/date';
import { useTasks } from '../hooks/useTasks';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { Sun } from 'lucide-react';

export function MyDayPage() {
  const today = todayISO();
  const { data: tasks, isLoading } = useTasks({ my_day_date: today });

  if (isLoading) return <LoadingSkeleton count={5} />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
          <Sun size={18} className="text-amber-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">My Day</h3>
          <p className="text-xs text-muted-foreground">{today}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4 ml-11">
        {tasks?.length ?? 0} task{(tasks?.length ?? 0) !== 1 ? 's' : ''} focused today
      </p>

      <TaskList tasks={tasks || []} />
      <div className="mt-2">
        <TaskQuickAdd showListPicker showDatePicker />
      </div>
      {tasks?.length === 0 && (
        <EmptyState
          icon={<Sun size={40} />}
          title="Focus on what matters today"
          description='Open a task and click "Add to My Day" or create one above'
        />
      )}
    </div>
  );
}
