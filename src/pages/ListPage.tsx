import { useParams } from 'react-router-dom';
import { useTasks } from '../hooks/useTasks';
import { useLists } from '../hooks/useLists';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';

export function ListPage() {
  const { listId } = useParams<{ listId: string }>();
  const { data: tasks, isLoading } = useTasks({ list_id: listId });
  const { data: lists } = useLists();
  const list = lists?.find((l) => l.id === listId);

  if (isLoading) return <LoadingSkeleton count={5} />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {list && (
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: list.color }} />
        )}
        <h3 className="text-lg font-semibold">{list?.name || 'List'}</h3>
      </div>
      <TaskList tasks={tasks || []} />
      <div className="mt-2">
        <TaskQuickAdd listId={listId} />
      </div>
      {tasks?.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No tasks in this list. Add one above.
        </p>
      )}
    </div>
  );
}
