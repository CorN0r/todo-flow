import { useParams } from 'react-router-dom';
import { useTasks } from '../hooks/useTasks';
import { useTags } from '../hooks/useTags';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { Tag } from 'lucide-react';

export function TagPage() {
  const { tagId } = useParams<{ tagId: string }>();
  const { data: tasks, isLoading } = useTasks(tagId ? { tag_id: tagId } : {});
  const { data: tags } = useTags();
  const tag = tags?.find((t) => t.id === tagId);

  if (isLoading) return <LoadingSkeleton count={5} />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: tag?.color || '#6366f1' }}
        >
          <span
            className="w-3 h-3 rounded-full bg-white"
          />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{tag?.name || 'Tag'}</h3>
          <p className="text-xs text-muted-foreground">
            {tasks?.length ?? 0} task{(tasks?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <TaskList tasks={tasks || []} />
      <div className="mt-2">
        <TaskQuickAdd showListPicker showDatePicker />
      </div>
      {tasks?.length === 0 && (
        <EmptyState
          icon={<Tag size={40} />}
          title="No tasks with this tag"
          description="Add this tag to a task to see it here"
        />
      )}
    </div>
  );
}
