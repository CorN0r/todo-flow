import { todayISO } from '../lib/date';
import { useTasks } from '../hooks/useTasks';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { CalendarCheck } from 'lucide-react';

export function TodayPage() {
  const today = todayISO();
  const { data: tasks, isLoading } = useTasks({
    due_date_from: today,
    due_date_to: today,
  });

  if (isLoading) return <LoadingSkeleton count={5} />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
          <CalendarCheck size={18} className="text-violet-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Today</h3>
          <p className="text-xs text-muted-foreground">{today}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4 ml-11">
        {tasks?.length ?? 0} task{(tasks?.length ?? 0) !== 1 ? 's' : ''} due today
      </p>

      <TaskList tasks={tasks || []} />
      <div className="mt-2">
        <TaskQuickAdd showListPicker showDatePicker />
      </div>
      {tasks?.length === 0 && (
        <EmptyState
          icon={<CalendarCheck size={40} />}
          title="No tasks due today"
          description="Add one above or check your scheduled tasks"
        />
      )}
    </div>
  );
}
