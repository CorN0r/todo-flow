import { useMemo } from 'react';
import { Clock, Zap, Flame, BarChart3 } from 'lucide-react';
import { cn } from '../lib/cn';
import { usePomodoroStore } from '../stores/pomodoroStore';
import { useUIStore } from '../stores/uiStore';

function getWeekDays() {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export function FocusStatsPage() {
  const dailyFocusMinutes = usePomodoroStore((s) => s.dailyFocusMinutes);
  const config = usePomodoroStore((s) => s.config);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

  const weekDays = useMemo(() => getWeekDays(), []);

  // Compute stats
  const today = new Date().toISOString().split('T')[0];
  const todayMinutes = dailyFocusMinutes[today] || 0;
  const todaySessions = Math.round(todayMinutes / config.focusMinutes);

  const weekMinutes = weekDays.reduce((sum, d) => sum + (dailyFocusMinutes[d] || 0), 0);
  const weekSessions = Math.round(weekMinutes / config.focusMinutes);

  const totalMinutes = Object.values(dailyFocusMinutes).reduce((sum, v) => sum + v, 0);
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
      // Today might not be over yet, skip
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  const maxWeekMin = Math.max(...weekDays.map((d) => dailyFocusMinutes[d] || 0), 1);

  return (
    <div className="max-w-lg">
      <h3 className="text-[20px] font-bold text-[#111827] dark:text-white mb-6">专注统计</h3>

      {/* Today card */}
      <div className={cn(
        'rounded-2xl p-5 mb-4 border',
        isDark ? 'bg-[#1e1e32] border-white/[0.07]' : 'bg-white border-[#F3F4F6] shadow-sm',
      )}>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-[#7C72F6]" />
          <span className="text-[13px] font-semibold text-[#111827] dark:text-white/90">今日专注</span>
        </div>
        <div className="flex items-end gap-6">
          <div>
            <span className="text-[36px] font-bold tabular-nums text-[#111827] dark:text-white leading-none">
              {todayMinutes}
            </span>
            <span className="text-sm text-[#6B7280] ml-1">分钟</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#7C72F6] pb-1">
            <Zap size={14} />
            <span className="text-[13px] font-medium">{todaySessions} 轮</span>
          </div>
        </div>
      </div>

      {/* Week bar chart */}
      <div className={cn(
        'rounded-2xl p-5 mb-4 border',
        isDark ? 'bg-[#1e1e32] border-white/[0.07]' : 'bg-white border-[#F3F4F6] shadow-sm',
      )}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={16} className="text-[#7C72F6]" />
          <span className="text-[13px] font-semibold text-[#111827] dark:text-white/90">本周</span>
          <span className="text-[11px] text-[#6B7280] ml-auto">{weekMinutes} 分钟 · {weekSessions} 轮</span>
        </div>
        <div className="flex items-end gap-2 h-[80px]">
          {weekDays.map((d) => {
            const min = dailyFocusMinutes[d] || 0;
            const h = Math.max(min > 0 ? 8 : 3, (min / maxWeekMin) * 80);
            const isToday = d === today;
            const date = new Date(d);
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-1">
                <span className={cn(
                  'text-[10px] tabular-nums font-medium',
                  isToday ? 'text-[#7C72F6]' : 'text-[#6B7280]',
                )}>{min > 0 ? `${min}min` : ''}</span>
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: h,
                    backgroundColor: isToday ? '#7C72F6' : min > 0 ? '#C4B5FD' : isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
                  }}
                />
                <span className={cn('text-[10px]', isToday ? 'text-[#7C72F6] font-semibold' : 'text-[#9CA3AF]')}>
                  {DAY_LABELS[date.getDay()]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3">
        <div className={cn(
          'rounded-2xl p-4 border',
          isDark ? 'bg-[#1e1e32] border-white/[0.07]' : 'bg-white border-[#F3F4F6] shadow-sm',
        )}>
          <div className="flex items-center gap-1.5 mb-1">
            <Flame size={14} className="text-amber-500" />
            <span className="text-[11px] text-[#6B7280]">连续打卡</span>
          </div>
          <span className="text-[24px] font-bold tabular-nums text-[#111827] dark:text-white">{streak} 天</span>
        </div>
        <div className={cn(
          'rounded-2xl p-4 border',
          isDark ? 'bg-[#1e1e32] border-white/[0.07]' : 'bg-white border-[#F3F4F6] shadow-sm',
        )}>
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 size={14} className="text-[#6B7280]" />
            <span className="text-[11px] text-[#6B7280]">总计</span>
          </div>
          <span className="text-[24px] font-bold tabular-nums text-[#111827] dark:text-white">{totalSessions} 轮</span>
          <span className="text-[11px] text-[#6B7280] ml-1">{totalMinutes}min</span>
        </div>
      </div>
    </div>
  );
}
