import { useMemo } from 'react';
import { todayISO } from '../lib/date';
import { useTasks } from '../hooks/useTasks';
import { useUIStore } from '../stores/uiStore';
import { cn } from '../lib/cn';
import { TaskList } from '../components/tasks/TaskList';
import { StickyWall } from '../components/tasks/StickyWall';
import { UnifiedLayout } from '../components/tasks/UnifiedLayout';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { PageTitle } from '../components/shared/PageTitle';
import { FilteredTaskEmptyState } from '../components/shared/FilteredTaskEmptyState';
import { CalendarCheck, AlertTriangle, Sun } from 'lucide-react';
import { sortTasks, nestChildren } from '../lib/sortTasks';
import { useDesktopTaskStatusFilter } from '../hooks/useDesktopTaskStatusFilter';

export function TodayPage() {
  const today = todayISO();
  const { data: tasks, isLoading, isError } = useTasks({ due_date_from: today, due_date_to: today, include_children: true });
  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const exitSelection = useUIStore((s) => s.exitSelectionMode);
  const taskViewMode = useUIStore((s) => s.taskViewMode);
  const setTaskViewMode = useUIStore((s) => s.setTaskViewMode);
  const showNewTask = useUIStore((s) => s.showQuickAdd);
  const setShowNewTask = useUIStore((s) => s.setShowQuickAdd);

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);
  const topLevel = useMemo(() => nestChildren(sorted), [sorted]);
  const { filteredTasks, statusCounts, statusFilter, setStatusFilter } = useDesktopTaskStatusFilter(topLevel, today);

  const handleToggleSelection = () => {
    if (selectionMode) exitSelection(); else useUIStore.getState().enterSelectionMode();
  };

  if (isLoading) return <LoadingSkeleton count={5} />;
  if (isError) return <EmptyState icon={<AlertTriangle size={40} />} title="加载失败" description="请检查数据库连接后重试" />;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
          <Sun size={18} className="text-emerald-500" />
        </div>
        <div className="flex-1">
          <PageTitle title="今天" taskCount={topLevel.length} statusCounts={statusCounts}
            statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
            sortMode={sortMode} onSortChange={setSortMode}
            onNewTask={() => setShowNewTask(true)}
            selectionMode={selectionMode} onToggleSelection={handleToggleSelection}
            taskViewMode={taskViewMode} onToggleViewMode={() => {
              if (taskViewMode === 'unified') useUIStore.getState().setSelectedTaskId(null);
              setTaskViewMode(taskViewMode === 'wall' ? 'unified' : taskViewMode === 'unified' ? 'list' : 'wall');
            }} />
        </div>
      </div>

      {showNewTask && (
        <div className="shrink-0 mb-[6px]">
          <TaskQuickAdd defaultDueDate={today} onCreated={() => setShowNewTask(false)} onCancel={() => setShowNewTask(false)} />
        </div>
      )}

      <div className={cn('flex-1 min-h-0', taskViewMode === 'unified' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto pb-6')}>
        {filteredTasks.length > 0 && (taskViewMode === 'wall' ? <StickyWall tasks={filteredTasks} /> : taskViewMode === 'unified' ? <UnifiedLayout tasks={filteredTasks} reorderScope={topLevel} /> : <TaskList tasks={filteredTasks} reorderScope={topLevel} />)}
        {topLevel.length > 0 && filteredTasks.length === 0 && statusFilter !== 'all' && (
          <FilteredTaskEmptyState filter={statusFilter} onShowAll={() => setStatusFilter('all')} />
        )}
        {topLevel.length === 0 && !showNewTask && taskViewMode !== 'unified' && (
          <EmptyState icon={<CalendarCheck size={40} />} title="今天没有到期任务" description="点击右上角「新建任务」开始添加" />
        )}
      </div>
    </div>
  );
}
