import { useMemo, useCallback, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTasks } from '../hooks/useTasks';
import { useTags } from '../hooks/useTags';
import { useUIStore } from '../stores/uiStore';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { PageTitle } from '../components/shared/PageTitle';
import { Tag, AlertTriangle } from 'lucide-react';
import { sortTasks, nestChildren } from '../lib/sortTasks';

export function TagPage() {
  const { tagId } = useParams<{ tagId: string }>();
  const { data: tasks, isLoading, isError } = useTasks(
    tagId ? { tag_id: tagId, include_children: true } : { include_children: true },
  );
  const { data: tags } = useTags();
  const tag = tagId ? tags?.find((t) => t.id === tagId) : undefined;
  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const exitSelection = useUIStore((s) => s.exitSelectionMode);
  const [showNewTask, setShowNewTask] = useState(false);

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);
  const topLevel = useMemo(() => nestChildren(sorted), [sorted]);
  const completedCount = useMemo(() => topLevel.filter((t) => t.is_completed).length, [topLevel]);

  const setSelectableIds = useUIStore((s) => s.setSelectableIds);
  useEffect(() => { setSelectableIds(topLevel.map((t) => t.id)); }, [topLevel, setSelectableIds]);

  const handleToggleSelection = useCallback(() => {
    if (selectionMode) { exitSelection(); } else { useUIStore.getState().enterSelectionMode(); }
  }, [selectionMode, exitSelection]);

  if (isLoading) return <LoadingSkeleton count={5} />;
  if (isError) return <EmptyState icon={<AlertTriangle size={40} />} title="加载失败" description="请检查数据库连接后重试" />;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-3 mb-4">
        {tag ? (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: tag.color + '20' }}>
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
            <Tag size={18} className="text-violet-500" />
          </div>
        )}
        <div className="flex-1">
          <PageTitle title={tag?.name || 'Tag'} taskCount={topLevel.length} completedCount={completedCount}
            sortMode={sortMode} onSortChange={setSortMode}
            onNewTask={() => setShowNewTask(true)}
            selectionMode={selectionMode} onToggleSelection={handleToggleSelection} />
        </div>
      </div>

      {showNewTask && (
        <div className="shrink-0 mb-[6px]">
          <TaskQuickAdd tagId={tagId} onCreated={() => setShowNewTask(false)} onCancel={() => setShowNewTask(false)} />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <TaskList tasks={topLevel} />
        {sorted.length === 0 && !showNewTask && (
          <EmptyState icon={<Tag size={40} />} title="此标签下暂无任务"
            description="点击右上角新建任务按钮添加" />
        )}
      </div>
    </div>
  );
}
