import { todayISO } from '../lib/date';
import { useTasks } from '../hooks/useTasks';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';

export function TodayPage() {
  const { data: tasks, isLoading } = useTasks({
    due_date_from: todayISO(),
    due_date_to: todayISO(),
  });

  if (isLoading) return <LoadingSkeleton count={5} />;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Today's Tasks</h3>
      <TaskList tasks={tasks || []} />
      <div className="mt-2">
        <TaskQuickAdd showListPicker showDatePicker />
      </div>
      {!isLoading && tasks?.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No tasks for today. Add one above.
        </p>
      )}
    </div>
  );
}
