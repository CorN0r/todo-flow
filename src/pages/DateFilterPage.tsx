import { useMemo, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTasks } from '../hooks/useTasks';
import { useUIStore } from '../stores/uiStore';
import { TaskViewBody } from '../components/tasks/TaskViewBody';
import { taskViewBodyClass } from '../lib/taskView';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { PageTitle } from '../components/shared/PageTitle';
import { FilteredTaskEmptyState } from '../components/shared/FilteredTaskEmptyState';
import { todayISO, addDays, format } from '../lib/date';
import { PLANNED_RANGES, isPlannedRange } from '../lib/dateRanges';
import { Inbox, AlertTriangle, ListTodo, CalendarRange } from 'lucide-react';
import { cn } from '../lib/cn';
import { sortTasks, nestChildren } from '../lib/sortTasks';
import { useDesktopTaskStatusFilter } from '../hooks/useDesktopTaskStatusFilter';
import type { TaskStatusFilter } from '../lib/taskStatusFilter';

// 全部任务之外的四个键是“计划”的日期范围,在页面内切换;图标的配置只有全部任务用得上,
// 计划各范围共用页头的“计划”图标
const filterConfig: Record<string, { label: string; days: number; showDates: boolean; fromOffset: number; icon?: typeof ListTodo; iconBg?: string; iconColor?: string }> = {
  all: { label: '全部任务', days: 0, showDates: false, fromOffset: 0, icon: ListTodo, iconBg: 'bg-indigo-100 dark:bg-indigo-900/50', iconColor: 'text-indigo-500' },
  today: { label: '今天', days: 0, showDates: false, fromOffset: 0 },
  tomorrow: { label: '明天', days: 1, showDates: false, fromOffset: 1 },
  'this-week': { label: '未来7天', days: 7, showDates: true, fromOffset: 0 },
  'this-month': { label: '未来30天', days: 30, showDates: false, fromOffset: 0 },
};

export function DateFilterPage() {
  const { filter = 'all' } = useParams<{ filter: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const config = filterConfig[filter] || filterConfig.all;
  const planned = isPlannedRange(filter);
  const navStatusFilter = (location.state as { statusFilter?: TaskStatusFilter } | null)?.statusFilter;

  const today = todayISO();
  const { dateFrom, dateTo } = useMemo(() => {
    if (filter === 'all') return { dateFrom: undefined, dateTo: undefined };
    const from = format(addDays(new Date(), config.fromOffset), 'yyyy-MM-dd');
    const to = format(addDays(new Date(), config.days), 'yyyy-MM-dd');
    return { dateFrom: from, dateTo: to };
  }, [filter, config.days, config.fromOffset]);

  const { data: tasks, isLoading, isError } = useTasks(
    filter === 'all' ? { include_children: true } : { due_date_from: dateFrom, due_date_to: dateTo, include_children: true },
  );

  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const taskViewMode = useUIStore((s) => s.taskViewMode);
  const setTaskViewMode = useUIStore((s) => s.setTaskViewMode);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const exitSelection = useUIStore((s) => s.exitSelectionMode);
  const setLastPlannedRange = useUIStore((s) => s.setLastPlannedRange);

  const showNewTask = useUIStore((s) => s.showQuickAdd);
  const setShowNewTask = useUIStore((s) => s.setShowQuickAdd);

  const handleToggleSelection = () => {
    if (selectionMode) { exitSelection(); } else { useUIStore.getState().enterSelectionMode(); }
  };

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);
  const topLevel = useMemo(() => nestChildren(sorted), [sorted]);
  const { filteredTasks, statusCounts, statusFilter, setStatusFilter } = useDesktopTaskStatusFilter(topLevel, today);

  useEffect(() => {
    if (navStatusFilter) setStatusFilter(navStatusFilter);
  }, [navStatusFilter, setStatusFilter]);

  // 侧边栏的“计划”记住本次会话里最后查看的范围
  useEffect(() => {
    if (isPlannedRange(filter)) setLastPlannedRange(filter);
  }, [filter, setLastPlannedRange]);

  const dateList = useMemo(() => {
    if (!config.showDates) return [];
    const dates: string[] = [];
    for (let i = 0; i < config.days; i++) {
      dates.push(format(addDays(new Date(), i), 'yyyy-MM-dd'));
    }
    return dates;
  }, [config.showDates, config.days]);

  if (isLoading) return <LoadingSkeleton count={5} />;
  if (isError) return <EmptyState icon={<AlertTriangle size={40} />} title="加载失败" description="请检查数据库连接后重试" />;

  const IconComp = config.icon ?? CalendarRange;
  const iconBg = planned ? 'bg-sky-100 dark:bg-sky-900/50' : config.iconBg;
  const iconColor = planned ? 'text-sky-500' : config.iconColor;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-3 mb-2">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <IconComp size={18} className={iconColor} />
        </div>
        <div className="flex-1">
          <PageTitle
            title={planned ? '计划' : config.label}
            taskCount={topLevel.length}
            statusCounts={statusCounts}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sortMode={sortMode}
            onSortChange={setSortMode}
            onNewTask={() => setShowNewTask(true)}
            selectionMode={selectionMode}
            onToggleSelection={handleToggleSelection}
            taskViewMode={taskViewMode}
            onViewChange={setTaskViewMode}
          />
        </div>
      </div>

      {/* 计划的日期范围:在这里切换,侧边栏只有一个“计划”入口 */}
      {planned && (
        <div className="shrink-0 flex items-center gap-0.5 mb-3 self-start bg-[#F3F4F6] dark:bg-white/[0.06] rounded-lg p-0.5">
          {PLANNED_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => navigate(`/date/${range}`)}
              aria-pressed={range === filter}
              data-testid={`planned-range-${range}`}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-colors',
                range === filter
                  ? 'bg-white dark:bg-[#1e1e32] text-[#111827] dark:text-white/90 shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827] dark:hover:text-white/90',
              )}
            >
              {filterConfig[range].label}
            </button>
          ))}
        </div>
      )}

      {dateList.length > 0 && (
        <div className="shrink-0 flex gap-2 flex-wrap mb-2">
          {dateList.map((d) => {
            const dayName = format(new Date(d + 'T00:00:00'), 'EEE');
            const dayNum = new Date(d + 'T00:00:00').getDate();
            const isToday = d === today;
            return (
              <div
                key={d}
                className={`text-center px-3 py-1.5 rounded-lg border text-xs min-w-[52px] ${
                  isToday
                    ? 'bg-[#7C72F6] text-white border-[#7C72F6]'
                    : 'bg-white dark:bg-[#1e1e32] text-[#6B7280] border-[#F3F4F6] dark:border-white/[0.06]'
                }`}
              >
                <div className="font-medium">{dayName}</div>
                <div className={`text-lg font-bold leading-tight ${isToday ? '' : 'text-[#111827] dark:text-white/90'}`}>
                  {dayNum}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNewTask && (
        <div className="shrink-0 mb-[6px]">
          <TaskQuickAdd defaultDueDate={dateFrom} onCreated={() => setShowNewTask(false)} onCancel={() => setShowNewTask(false)} />
        </div>
      )}

      <div className={cn('flex-1', taskViewBodyClass(taskViewMode))}>
        {filteredTasks.length > 0 && <TaskViewBody mode={taskViewMode} tasks={filteredTasks} topLevel={topLevel} />}
        {topLevel.length > 0 && filteredTasks.length === 0 && statusFilter !== 'all' && (
          <FilteredTaskEmptyState filter={statusFilter} onShowAll={() => setStatusFilter('all')} />
        )}
        {topLevel.length === 0 && !showNewTask && (
          <EmptyState
            icon={<Inbox size={40} />}
            title="此时间段暂无任务"
            description="点击右上角新建任务按钮添加"
          />
        )}
      </div>
    </div>
  );
}
