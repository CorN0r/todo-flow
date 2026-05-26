import { useQuery } from '@tanstack/react-query';
import { getDashboardStats, type DashboardStats } from '../lib/db';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { BarChart3, CheckCircle2, Clock, Flame, AlertTriangle, TrendingUp } from 'lucide-react';

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="p-4 rounded-xl border bg-card flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color }}>
        <div className="text-white">{icon}</div>
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function CompletionBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">Completion rate</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function WeeklyChart({ data }: { data: DashboardStats['completion_by_date'] }) {
  const maxVal = Math.max(1, ...data.map((d) => d.completed));

  // Fill in missing days
  const days: { date: string; label: string; completed: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const found = data.find((x) => x.date === key);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.push({
      date: key,
      label: i === 0 ? 'Today' : dayNames[d.getDay()],
      completed: found?.completed ?? 0,
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} className="text-violet-500" />
        <span className="text-sm font-medium">Last 7 Days</span>
      </div>
      <div className="flex items-end gap-2 h-24">
        {days.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {d.completed || ''}
            </span>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-violet-400 to-violet-300 transition-all duration-500 min-h-[4px]"
              style={{ height: `${maxVal > 0 ? (d.completed / maxVal) * 80 : 0}px` }}
            />
            <span className="text-[10px] text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListDistribution({ data }: { data: DashboardStats['tasks_by_list'] }) {
  const total = data.reduce((s, l) => s + l.count, 0) || 1;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={16} className="text-blue-500" />
        <span className="text-sm font-medium">By List</span>
      </div>
      <div className="space-y-2">
        {data.map((list) => (
          <div key={list.list_id} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: list.list_color }} />
            <span className="text-sm flex-1 truncate">{list.list_name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{list.count}</span>
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.round((list.count / total) * 100)}%`,
                  backgroundColor: list.list_color,
                }}
              />
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No lists yet</p>
        )}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingSkeleton count={4} />;
  if (!stats) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
          <BarChart3 size={18} className="text-indigo-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Dashboard</h3>
          <p className="text-xs text-muted-foreground">Your productivity at a glance</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<CheckCircle2 size={18} />} label="Completed" value={stats.completed_tasks} color="#10b981" />
        <StatCard icon={<Clock size={18} />} label="Incomplete" value={stats.incomplete_tasks} color="#6366f1" />
        <StatCard icon={<AlertTriangle size={18} />} label="Overdue" value={stats.overdue_tasks} color="#ef4444" />
        <StatCard icon={<Flame size={18} />} label="Day streak" value={stats.streak_days} color="#f59e0b" />
      </div>

      {/* Progress & Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-xl border bg-card space-y-4">
          <CompletionBar completed={stats.completed_tasks} total={stats.total_tasks} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{stats.total_tasks} total tasks</span>
            <span>{stats.today_completed} completed today</span>
          </div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <WeeklyChart data={stats.completion_by_date} />
        </div>
      </div>

      {/* List distribution */}
      <div className="p-4 rounded-xl border bg-card">
        <ListDistribution data={stats.tasks_by_list} />
      </div>
    </div>
  );
}
