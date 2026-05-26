import { useParams } from 'react-router-dom';
import { useTasks } from '../hooks/useTasks';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { todayISO, addDays, format } from '../lib/date';
import { useMemo } from 'react';
import { Inbox } from 'lucide-react';

const filterConfig: Record<string, { label: string; days: number; showDates: boolean; fromOffset: number }> = {
  all: { label: 'All Tasks', days: 0, showDates: false, fromOffset: 0 },
  today: { label: 'Today', days: 0, showDates: false, fromOffset: 0 },
  tomorrow: { label: 'Tomorrow', days: 1, showDates: false, fromOffset: 1 },
  'next-3': { label: 'Next 3 Days', days: 3, showDates: true, fromOffset: 0 },
  'next-7': { label: 'Next 7 Days', days: 7, showDates: true, fromOffset: 0 },
  'next-year': { label: 'This Year', days: 365, showDates: false, fromOffset: 0 },
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

  const { data: tasks, isLoading } = useTasks(
    filter === 'all'
      ? {}
      : { due_date_from: dateFrom, due_date_to: dateTo },
  );

  const dateList = useMemo(() => {
    if (!config.showDates) return [];
    const dates: string[] = [];
    for (let i = 0; i < config.days; i++) {
      dates.push(format(addDays(new Date(), i), 'yyyy-MM-dd'));
    }
    return dates;
  }, [config.showDates, config.days]);

  if (isLoading) return <LoadingSkeleton count={5} />;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">{config.label}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {tasks?.length ?? 0} task{(tasks?.length ?? 0) !== 1 ? 's' : ''}
      </p>

      {dateList.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {dateList.map((d) => {
            const dayName = format(new Date(d + 'T00:00:00'), 'EEE');
            const dayNum = new Date(d + 'T00:00:00').getDate();
            const isToday = d === today;
            return (
              <div
                key={d}
                className={`text-center px-3 py-1.5 rounded-lg border text-xs min-w-[52px] ${
                  isToday
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border'
                }`}
              >
                <div className="font-medium">{dayName}</div>
                <div className={`text-lg font-bold leading-tight ${isToday ? '' : 'text-foreground'}`}>
                  {dayNum}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskList tasks={tasks || []} />
      <div className="mt-2">
        <TaskQuickAdd showListPicker showDatePicker />
      </div>
      {tasks?.length === 0 && (
        <EmptyState
          icon={<Inbox size={40} />}
          title="No tasks in this time range"
          description="Add a task with a due date to see it here"
        />
      )}
    </div>
  );
}
