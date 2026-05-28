import { useMemo, useCallback, useState } from 'react';
import { todayISO } from '../lib/date';
import { useTasks } from '../hooks/useTasks';
import { useUIStore } from '../stores/uiStore';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { PageTitle, type FilterMode } from '../components/shared/PageTitle';
import { Sun, AlertTriangle } from 'lucide-react';
import { sortTasks } from '../lib/sortTasks';

export function MyDayPage() {
  const today = todayISO();
  const { data: tasks, isLoading, isError } = useTasks({ my_day_date: today, include_children: true });
  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const exitSelection = useUIStore((s) => s.exitSelectionMode);
  const [showNewTask, setShowNewTask] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);
  const topLevel = useMemo(() => sorted.filter((t) => !t.parent_task_id), [sorted]);
  const filtered = useMemo(() => {
    if (filterMode === 'incomplete') return topLevel.filter((t) => !t.is_completed);
    if (filterMode === 'completed') return topLevel.filter((t) => t.is_completed);
    if (filterMode === 'overdue') return topLevel.filter((t) => !t.is_completed && t.due_date && t.due_date < today);
    return topLevel;
  }, [topLevel, filterMode, today]);
  const completedCount = topLevel.filter((t) => t.is_completed).length;
  const overdueCount = topLevel.filter((t) => !t.is_completed && t.due_date && t.due_date < today).length;

  const handleToggleSelection = useCallback(() => {
    if (selectionMode) { exitSelection(); } else { useUIStore.getState().enterSelectionMode(); }
  }, [selectionMode, exitSelection]);

  if (isLoading) return <LoadingSkeleton count={5} />;
  if (isError) return <EmptyState icon={<AlertTriangle size={40} />} title="加载失败" description="请检查数据库连接后重试" />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
          <Sun size={18} className="text-amber-500" />
        </div>
        <div className="flex-1">
          <PageTitle title="我的一天" taskCount={topLevel.length} completedCount={completedCount}
            overdueCount={overdueCount} filterMode={filterMode} onFilterChange={setFilterMode}
            sortMode={sortMode} onSortChange={setSortMode}
            onNewTask={() => setShowNewTask(true)}
            selectionMode={selectionMode} onToggleSelection={handleToggleSelection} />
          <p className="text-xs text-[#6B7280]">{today}</p>
        </div>
      </div>

      {showNewTask && <TaskQuickAdd defaultDueDate={today} onCreated={() => setShowNewTask(false)} onCancel={() => setShowNewTask(false)} />}

      <TaskList tasks={filtered} />
      {sorted.length === 0 && !showNewTask && (
        <EmptyState icon={<Sun size={40} />} title="Focus on what matters today"
          description='Open a task and click "Add to My Day" or create one above' />
      )}
    </div>
  );
}
