import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTasks } from '../hooks/useTasks';
import { useUIStore } from '../stores/uiStore';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { PageTitle, type FilterMode } from '../components/shared/PageTitle';
import { todayISO, addDays, format } from '../lib/date';
import { Inbox, AlertTriangle, Hash, Sunrise, CalendarRange, CalendarDays, CalendarCheck, Globe } from 'lucide-react';
import { sortTasks, nestChildren } from '../lib/sortTasks';

const filterConfig: Record<string, { label: string; days: number; showDates: boolean; fromOffset: number; icon: typeof Hash; iconBg: string; iconColor: string }> = {
  all: { label: '全部任务', days: 0, showDates: false, fromOffset: 0, icon: Hash, iconBg: 'bg-indigo-100 dark:bg-indigo-900/50', iconColor: 'text-indigo-500' },
  today: { label: '今天', days: 0, showDates: false, fromOffset: 0, icon: CalendarCheck, iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', iconColor: 'text-emerald-500' },
  tomorrow: { label: '明天', days: 1, showDates: false, fromOffset: 1, icon: Sunrise, iconBg: 'bg-sky-100 dark:bg-sky-900/50', iconColor: 'text-sky-500' },
  'next-3': { label: '未来 3 天', days: 3, showDates: true, fromOffset: 0, icon: CalendarRange, iconBg: 'bg-blue-100 dark:bg-blue-900/50', iconColor: 'text-blue-500' },
  'next-7': { label: '未来 7 天', days: 7, showDates: true, fromOffset: 0, icon: CalendarDays, iconBg: 'bg-violet-100 dark:bg-violet-900/50', iconColor: 'text-violet-500' },
  'next-year': { label: '今年', days: 365, showDates: false, fromOffset: 0, icon: Globe, iconBg: 'bg-teal-100 dark:bg-teal-900/50', iconColor: 'text-teal-500' },
};

export function DateFilterPage() {
  const { filter = 'all' } = useParams<{ filter: string }>();
  const config = filterConfig[filter] || filterConfig.all;

  const today = todayISO();
  const { dateFrom, dateTo } = useMemo(() => {
    if (filter === 'all') return { dateFrom: undefined, dateTo: undefined };
    const from = format(addDays(new Date(), config.fromOffset), 'yyyy-MM-dd');
    const to = format(addDays(new Date(), config.days), 'yyyy-MM-dd');
    return { dateFrom: from, dateTo: to };
  }, [filter, config.days, config.fromOffset]);

  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const { data: tasks, isLoading, isError } = useTasks(
    filter === 'all' ? { include_children: true } : { due_date_from: dateFrom, due_date_to: dateTo, include_children: true },
  );

  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const exitSelection = useUIStore((s) => s.exitSelectionMode);

  const [showNewTask, setShowNewTask] = useState(false);

  const handleToggleSelection = () => {
    if (selectionMode) { exitSelection(); } else { useUIStore.getState().enterSelectionMode(); }
  };

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);
  const topLevel = useMemo(() => nestChildren(sorted), [sorted]);
  const filtered = useMemo(() => {
    if (filterMode === 'incomplete') return topLevel.filter((t) => !t.is_completed && !t.is_abandoned);
    if (filterMode === 'completed') return topLevel.filter((t) => t.is_completed || t.is_abandoned);
    if (filterMode === 'overdue') return topLevel.filter((t) => !t.is_completed && !t.is_abandoned && t.due_date && t.due_date < today);
    return topLevel;
  }, [topLevel, filterMode, today]);
  const completedCount = topLevel.filter((t) => t.is_completed || t.is_abandoned).length;
  const overdueCount = topLevel.filter((t) => !t.is_completed && !t.is_abandoned && t.due_date && t.due_date < today).length;

  const setSelectableIds = useUIStore((s) => s.setSelectableIds);
  useEffect(() => { setSelectableIds(filtered.map((t) => t.id)); }, [filtered, setSelectableIds]);

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

  const IconComp = config.icon;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-3 mb-2">
        <div className={`w-8 h-8 rounded-lg ${config.iconBg} flex items-center justify-center`}>
          <IconComp size={18} className={config.iconColor} />
        </div>
        <div className="flex-1">
          <PageTitle
            title={config.label}
            taskCount={topLevel.length}
            completedCount={completedCount}
            overdueCount={overdueCount}
            filterMode={filterMode}
            onFilterChange={setFilterMode}
            sortMode={sortMode}
            onSortChange={setSortMode}
            onNewTask={() => setShowNewTask(true)}
            selectionMode={selectionMode}
            onToggleSelection={handleToggleSelection}
          />
        </div>
      </div>

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

      <div className="flex-1 min-h-0 overflow-y-auto">
        <TaskList tasks={filtered} />
        {sorted.length === 0 && !showNewTask && (
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
