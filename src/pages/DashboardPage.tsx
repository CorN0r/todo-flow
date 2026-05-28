import { useQuery } from '@tanstack/react-query';
import { getDashboardStats, type DashboardStats } from '../lib/db';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { BarChart3, CheckCircle2, Clock, Flame, AlertTriangle, TrendingUp } from 'lucide-react';

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] flex items-center gap-3"
      style={{ padding: '14px 16px', boxShadow: 'var(--card-shadow)' }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color }}>
        <div className="text-white">{icon}</div>
      </div>
      <div>
        <p className="text-[22px] font-bold tabular-nums text-[#111827] dark:text-white">{value}</p>
        <p className="text-[11px] text-[#6B7280]">{label}</p>
      </div>
    </div>
  );
}

function CompletionBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[13px] mb-1.5">
        <span className="text-[#6B7280] font-medium">Completion rate</span>
        <span className="font-semibold tabular-nums text-[#111827] dark:text-white/90">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#7C72F6] to-[#A78BFA] transition-all duration-700"
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
        <div className="w-7 h-7 rounded-lg bg-[#F5F3FF] dark:bg-violet-950 flex items-center justify-center">
          <TrendingUp size={14} className="text-[#7C72F6]" />
        </div>
        <span className="text-[13px] font-semibold text-[#111827] dark:text-white/90">Last 7 Days</span>
      </div>
      <div className="flex items-end gap-2 h-24">
        {days.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[11px] font-semibold tabular-nums text-[#6B7280]">
              {d.completed || ''}
            </span>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-[#7C72F6] to-[#A78BFA] transition-all duration-500 min-h-[4px]"
              style={{ height: `${maxVal > 0 ? (d.completed / maxVal) * 80 : 0}px` }}
            />
            <span className="text-[10px] text-[#9CA3AF]">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TagDistribution({ data }: { data: DashboardStats['tasks_by_tag'] }) {
  const total = data.reduce((s, t) => s + t.count, 0) || 1;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] dark:bg-blue-950 flex items-center justify-center">
          <BarChart3 size={14} className="text-[#3B82F6]" />
        </div>
        <span className="text-[13px] font-semibold text-[#111827] dark:text-white/90">By Tag</span>
      </div>
      <div className="space-y-2">
        {data.map((tag) => (
          <div key={tag.tag_id} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.tag_color }} />
            <span className="text-[13px] flex-1 truncate text-[#111827] dark:text-white/90">{tag.tag_name}</span>
            <span className="text-[12px] text-[#6B7280] tabular-nums font-medium">{tag.count}</span>
            <div className="w-20 h-1.5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] overflow-hidden flex-shrink-0">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.round((tag.count / total) * 100)}%`,
                  backgroundColor: tag.tag_color,
                }}
              />
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <p className="text-[13px] text-[#9CA3AF] py-2">No tags yet</p>
        )}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingSkeleton count={4} />;
  if (isError || !stats) return (
    <EmptyState icon={<AlertTriangle size={40} />} title="Failed to load stats" description="Please check your database connection and try again." />
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
          <BarChart3 size={18} className="text-indigo-500" />
        </div>
        <div>
          <h3 className="text-[20px] font-bold text-[#111827] dark:text-white">Dashboard</h3>
          <p className="text-[12px] text-[#9CA3AF]">Your productivity at a glance</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<CheckCircle2 size={18} />} label="Completed" value={stats.completed_tasks} color="#7C72F6" />
        <StatCard icon={<Clock size={18} />} label="Incomplete" value={stats.incomplete_tasks} color="#7C72F6" />
        <StatCard icon={<AlertTriangle size={18} />} label="Overdue" value={stats.overdue_tasks} color="#EF4444" />
        <StatCard icon={<Flame size={18} />} label="Day streak" value={stats.streak_days} color="#F59E0B" />
      </div>

      {/* Progress & Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] space-y-4"
          style={{ padding: '16px', boxShadow: 'var(--card-shadow)' }}>
          <CompletionBar completed={stats.completed_tasks} total={stats.total_tasks} />
          <div className="flex justify-between text-[11px] text-[#9CA3AF]">
            <span>{stats.total_tasks} total tasks</span>
            <span>{stats.today_completed} completed today</span>
          </div>
        </div>
        <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06]"
          style={{ padding: '16px', boxShadow: 'var(--card-shadow)' }}>
          <WeeklyChart data={stats.completion_by_date} />
        </div>
      </div>

      {/* Tag distribution */}
      <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06]"
        style={{ padding: '16px', boxShadow: 'var(--card-shadow)' }}>
        <TagDistribution data={stats.tasks_by_tag} />
      </div>
    </div>
  );
}
