import { useMemo, useState, useEffect } from 'react';
import { todayISO } from '../lib/date';
import { useTasks } from '../hooks/useTasks';
import { useUIStore } from '../stores/uiStore';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { PageTitle, type FilterMode } from '../components/shared/PageTitle';
import { CalendarCheck, AlertTriangle, Sun } from 'lucide-react';
import { sortTasks, nestChildren } from '../lib/sortTasks';

export function TodayPage() {
  const today = todayISO();
  const { data: tasks, isLoading, isError } = useTasks({ due_date_from: today, due_date_to: today, include_children: true });
  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const exitSelection = useUIStore((s) => s.exitSelectionMode);
  const [showNewTask, setShowNewTask] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);
  const topLevel = useMemo(() => nestChildren(sorted), [sorted]);

  const filtered = useMemo(() => {
    if (filterMode === 'incomplete') return topLevel.filter((t) => !t.is_completed);
    if (filterMode === 'completed') return topLevel.filter((t) => t.is_completed);
    if (filterMode === 'overdue') return topLevel.filter((t) => !t.is_completed && t.due_date && t.due_date < today);
    return topLevel;
  }, [topLevel, filterMode, today]);

  const completedCount = topLevel.filter((t) => t.is_completed).length;
  const overdueCount = topLevel.filter((t) => !t.is_completed && t.due_date && t.due_date < today).length;

  const setSelectableIds = useUIStore((s) => s.setSelectableIds);
  useEffect(() => { setSelectableIds(filtered.map((t) => t.id)); }, [filtered, setSelectableIds]);

  const handleToggleSelection = () => {
    if (selectionMode) exitSelection(); else useUIStore.getState().enterSelectionMode();
  };

  if (isLoading) return <LoadingSkeleton count={5} />;
  if (isError) return <EmptyState icon={<AlertTriangle size={40} />} title="加载失败" description="请检查数据库连接后重试" />;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
          <Sun size={18} className="text-emerald-500" />
        </div>
        <div className="flex-1">
          <PageTitle title="今天" taskCount={topLevel.length} completedCount={completedCount}
            overdueCount={overdueCount} filterMode={filterMode} onFilterChange={setFilterMode}
            sortMode={sortMode} onSortChange={setSortMode}
            onNewTask={() => setShowNewTask(true)}
            selectionMode={selectionMode} onToggleSelection={handleToggleSelection} />
        </div>
      </div>

      {showNewTask && (
        <div className="shrink-0 mb-[6px]">
          <TaskQuickAdd defaultDueDate={today} onCreated={() => setShowNewTask(false)} onCancel={() => setShowNewTask(false)} />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <TaskList tasks={filtered} />
        {sorted.length === 0 && !showNewTask && (
          <EmptyState icon={<CalendarCheck size={40} />} title="今天没有到期任务" description="点击右上角「新建任务」开始添加" />
        )}
      </div>
    </div>
  );
}
