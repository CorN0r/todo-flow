import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, type DashboardStats } from '../lib/db';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { cn } from '../lib/cn';
import { BarChart3, CheckCircle2, Clock, List, AlertTriangle, TrendingUp, Zap, Flame } from 'lucide-react';
import { usePomodoroStore } from '../stores/pomodoroStore';
import { useUIStore } from '../stores/uiStore';

function StatCard({ icon, label, value, color, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick}
      className={cn('rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] flex items-center gap-3 transition-colors',
        onClick && 'cursor-pointer hover:border-[#7C72F6]/30 hover:shadow-md')}
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
        <span className="text-[#6B7280] font-medium">完成率</span>
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
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    days.push({
      date: key,
      label: i === 0 ? '今天' : dayNames[d.getDay()],
      completed: found?.completed ?? 0,
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-[#F5F3FF] dark:bg-violet-950 flex items-center justify-center">
          <TrendingUp size={14} className="text-[#7C72F6]" />
        </div>
        <span className="text-[13px] font-semibold text-[#111827] dark:text-white/90">最近 7 天</span>
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
        <span className="text-[13px] font-semibold text-[#111827] dark:text-white/90">按标签</span>
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
          <p className="text-[13px] text-[#9CA3AF] py-2">暂无标签</p>
        )}
      </div>
    </div>
  );
}

function PomodoroSection() {
  const dailyFocusMinutes = usePomodoroStore((s) => s.dailyFocusMinutes);
  const taskFocusMinutes = usePomodoroStore((s) => s.taskFocusMinutes);
  const config = usePomodoroStore((s) => s.config);
  const isDark = useUIStore((s) => s.resolvedTheme) === 'dark';

  const today = new Date().toISOString().split('T')[0];
  const todayMinutes = dailyFocusMinutes[today] || 0;
  const todaySessions = Math.round(todayMinutes / config.focusMinutes);

  const totalMinutes = Object.values(dailyFocusMinutes).reduce((s, v) => s + v, 0);
  const totalSessions = Math.round(totalMinutes / config.focusMinutes);

  // Streak
  let streak = 0;
  const checkDate = new Date();
  while (true) {
    const d = checkDate.toISOString().split('T')[0];
    if (dailyFocusMinutes[d] && dailyFocusMinutes[d] > 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (d === today) {
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }

  // Week chart
  const weekDays: { date: string; label: string; minutes: number }[] = [];
  const now = new Date();
  const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    weekDays.push({
      date: key,
      label: i === 0 ? '今' : dayLabels[d.getDay()],
      minutes: dailyFocusMinutes[key] || 0,
    });
  }
  const maxMin = Math.max(...weekDays.map((d) => d.minutes), 1);

  if (totalSessions === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-[#F5F3FF] dark:bg-violet-950/50 flex items-center justify-center mb-4">
        <Clock size={28} className="text-[#7C72F6]/50" />
      </div>
      <p className="text-[14px] font-medium text-[#111827] dark:text-white/90 mb-1">暂无专注数据</p>
      <p className="text-[12px] text-[#9CA3AF]">右键任务卡片，选择"开始番茄钟"来启动第一次专注</p>
    </div>
  );

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3 mt-1">
        <div className="w-7 h-7 rounded-lg bg-[#FFF7ED] dark:bg-orange-950 flex items-center justify-center">
          <Flame size={14} className="text-[#F97316]" />
        </div>
        <span className="text-[13px] font-semibold text-[#111827] dark:text-white/90">专注统计</span>
        <span className="text-[11px] text-[#6B7280] ml-auto">
          {streak > 0 && `🔥 连续 ${streak} 天`}
        </span>
      </div>

      {/* Pomodoro stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] flex items-center gap-3"
          style={{ padding: '14px 16px', boxShadow: 'var(--card-shadow)' }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#7C72F6]">
            <Clock className="text-white" size={18} />
          </div>
          <div>
            <p className="text-[22px] font-bold tabular-nums text-[#111827] dark:text-white">{todayMinutes}</p>
            <p className="text-[11px] text-[#6B7280]">今日分钟</p>
          </div>
        </div>
        <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] flex items-center gap-3"
          style={{ padding: '14px 16px', boxShadow: 'var(--card-shadow)' }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#22C55E]">
            <Zap className="text-white" size={18} />
          </div>
          <div>
            <p className="text-[22px] font-bold tabular-nums text-[#111827] dark:text-white">{todaySessions}</p>
            <p className="text-[11px] text-[#6B7280]">今日轮数</p>
          </div>
        </div>
        <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] flex items-center gap-3"
          style={{ padding: '14px 16px', boxShadow: 'var(--card-shadow)' }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#F97316]">
            <Flame className="text-white" size={18} />
          </div>
          <div>
            <p className="text-[22px] font-bold tabular-nums text-[#111827] dark:text-white">{streak}</p>
            <p className="text-[11px] text-[#6B7280]">连续天数</p>
          </div>
        </div>
        <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] flex items-center gap-3"
          style={{ padding: '14px 16px', boxShadow: 'var(--card-shadow)' }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#3B82F6]">
            <BarChart3 className="text-white" size={18} />
          </div>
          <div>
            <p className="text-[22px] font-bold tabular-nums text-[#111827] dark:text-white">{totalSessions}</p>
            <p className="text-[11px] text-[#6B7280]">总计轮数</p>
          </div>
        </div>
      </div>

      {/* Week bar */}
      <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06]"
        style={{ padding: '16px 16px 12px 16px', boxShadow: 'var(--card-shadow)' }}>
        <span className="text-[11px] text-[#6B7280] mb-2 block">本周专注时长</span>
        <div className="flex items-end gap-2 h-[130px]">
          {weekDays.map((d) => {
            const barH = maxMin > 0 ? Math.max(4, (d.minutes / maxMin) * 100) : 4;
            const isToday = d.date === today;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <span className={cn(
                  'text-[11px] font-semibold tabular-nums',
                  isToday ? 'text-[#7C72F6]' : d.minutes > 0 ? 'text-[#111827] dark:text-white/90' : 'text-[#9CA3AF]',
                )}>
                  {d.minutes > 0 ? `${d.minutes}m` : ''}
                </span>
                <div
                  className="w-full rounded-t-lg transition-all duration-500"
                  style={{
                    height: barH,
                    background: isToday
                      ? 'linear-gradient(180deg, #7C72F6 0%, #A78BFA 100%)'
                      : d.minutes > 0
                        ? 'linear-gradient(180deg, #C4B5FD 0%, #DDD6FE 100%)'
                        : isDark ? 'rgba(255,255,255,0.04)' : '#F3F4F6',
                  }}
                />
                <span className={isToday ? 'text-[10px] text-[#7C72F6] font-semibold' : 'text-[10px] text-[#9CA3AF]'}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-task breakdown */}
      {(() => {
        const tasks = Object.entries(taskFocusMinutes)
          .filter(([id]) => id !== '__none__')
          .sort(([, a], [, b]) => b.minutes - a.minutes)
          .slice(0, 5);
        if (tasks.length === 0) return null;
        const maxTaskMin = Math.max(...tasks.map(([, t]) => t.minutes), 1);
        return (
          <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] mt-3"
            style={{ padding: '16px', boxShadow: 'var(--card-shadow)' }}>
            <span className="text-[11px] text-[#6B7280] mb-3 block">按任务排行</span>
            <div className="space-y-2.5">
              {tasks.map(([id, t], i) => (
                <div key={id} className="flex items-center gap-2.5">
                  <span className={cn('text-[11px] font-semibold tabular-nums w-5', i < 3 ? 'text-[#7C72F6]' : 'text-[#9CA3AF]')}>
                    {i + 1}
                  </span>
                  <span className="text-[12px] flex-1 truncate text-[#111827] dark:text-white/90">{t.title}</span>
                  <span className="text-[11px] font-medium tabular-nums text-[#6B7280]">{t.minutes}min</span>
                  <div className="w-16 h-1.5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] overflow-hidden flex-shrink-0">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round((t.minutes / maxTaskMin) * 100)}%`,
                        background: i === 0 ? 'linear-gradient(90deg, #7C72F6, #A78BFA)' : '#DDD6FE',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

type DashboardTab = 'tasks' | 'focus';

export function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>('tasks');
  const navigate = useNavigate();
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingSkeleton count={4} />;
  if (isError || !stats) return (
    <EmptyState icon={<AlertTriangle size={40} />} title="加载失败" description="请检查数据库连接后重试" />
  );

  return (
    <div className="pb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
          <BarChart3 size={18} className="text-indigo-500" />
        </div>
        <div>
          <h3 className="text-[20px] font-bold text-[#111827] dark:text-white">数据看板</h3>
          <p className="text-[12px] text-[#9CA3AF]">效率概览</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-5">
        <button onClick={() => setTab('tasks')}
          className={cn('px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors',
            tab === 'tasks'
              ? 'bg-[#7C72F6] text-white'
              : 'text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]',
          )}>
          任务
        </button>
        <button onClick={() => setTab('focus')}
          className={cn('px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors',
            tab === 'focus'
              ? 'bg-[#7C72F6] text-white'
              : 'text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]',
          )}>
          专注
        </button>
      </div>

      {tab === 'tasks' && (
      <>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<List size={18} />} label="全部任务" value={stats.total_tasks} color="#7C72F6"
          onClick={() => navigate('/date/all')} />
        <StatCard icon={<CheckCircle2 size={18} />} label="已完成" value={stats.completed_tasks} color="#22C55E"
          onClick={() => navigate('/date/all', { state: { filterMode: 'completed' } })} />
        <StatCard icon={<Clock size={18} />} label="未完成" value={stats.incomplete_tasks} color="#7C72F6"
          onClick={() => navigate('/date/all', { state: { filterMode: 'incomplete' } })} />
        <StatCard icon={<AlertTriangle size={18} />} label="超期" value={stats.overdue_tasks} color="#EF4444"
          onClick={() => navigate('/date/all', { state: { filterMode: 'overdue' } })} />
      </div>

      {/* Progress & Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] space-y-4"
          style={{ padding: '16px', boxShadow: 'var(--card-shadow)' }}>
          <CompletionBar completed={stats.completed_tasks} total={stats.total_tasks} />
          <div className="flex justify-between text-[11px] text-[#9CA3AF]">
            <span>{stats.total_tasks} 总任务</span>
            <span>今日完成 {stats.today_completed}</span>
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
      </>
      )}

      {tab === 'focus' && <PomodoroSection />}
    </div>
  );
}
