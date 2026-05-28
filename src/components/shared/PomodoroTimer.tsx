import { useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Clock, Coffee } from 'lucide-react';
import { usePomodoroStore } from '../../stores/pomodoroStore';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* audio not available */ }
}

export function PomodoroTimer() {
  const { taskId, taskTitle, mode, minutes, seconds, isRunning, isPaused, sessionsCompleted,
    focusMinutes, breakMinutes, pauseTimer, resumeTimer, resetTimer, skipTimer,
    tick, } = usePomodoroStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(tick, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, tick]);

  // Notification on completion
  useEffect(() => {
    if (minutes === 0 && seconds === 0 && !notifiedRef.current) {
      notifiedRef.current = true;
      playBeep();
      const isBreak = mode === 'break';
      toast(isBreak ? '休息时间到！' : '专注时间结束！', {
        description: isBreak ? '开始新的专注时段' : '休息一下吧',
      });
      setTimeout(() => { notifiedRef.current = false; }, 2000);
    }
  }, [minutes, seconds, mode]);

  const handleToggle = useCallback(() => {
    if (isRunning) { pauseTimer(); } else if (isPaused) { resumeTimer(); }
  }, [isRunning, isPaused, pauseTimer, resumeTimer]);

  if (!taskId) return null;

  const totalSeconds = mode === 'focus' ? focusMinutes * 60 : breakMinutes * 60;
  const elapsed = totalSeconds - (minutes * 60 + seconds);
  const progress = totalSeconds > 0 ? elapsed / totalSeconds : 0;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference * (1 - progress);

  const isBreak = mode === 'break';

  return (
    <div className="fixed bottom-20 right-6 z-[100]">
      <div className={cn(
        'rounded-2xl shadow-2xl border backdrop-blur-md p-4 w-[240px]',
        isBreak
          ? 'bg-green-50/95 dark:bg-green-950/80 border-green-200 dark:border-green-800'
          : 'bg-white/95 dark:bg-[#1e1e32]/95 border-[#F3F4F6] dark:border-white/[0.08]',
      )}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          {isBreak ? (
            <Coffee size={14} className="text-green-500" />
          ) : (
            <Clock size={14} className="text-[#7C72F6]" />
          )}
          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.5px]', isBreak ? 'text-green-600 dark:text-green-400' : 'text-[#7C72F6]')}>
            {isBreak ? '休息' : '专注'} · {mode === 'focus' ? focusMinutes : breakMinutes}min
          </span>
          <span className="ml-auto text-[10px] text-[#9CA3AF] tabular-nums">
            {sessionsCompleted > 0 && `${sessionsCompleted} 轮`}
          </span>
        </div>

        {/* Timer ring */}
        <div className="flex items-center justify-center mb-3">
          <svg width="110" height="110" className="-rotate-90">
            <circle cx="55" cy="55" r="45" fill="none" stroke="currentColor"
              className={isBreak ? 'text-green-200 dark:text-green-900' : 'text-[#F3F4F6] dark:text-white/[0.06]'}
              strokeWidth="6" />
            <circle cx="55" cy="55" r="45" fill="none"
              stroke={isBreak ? '#10B981' : '#7C72F6'}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-linear" />
          </svg>
          <div className="absolute text-center">
            <div className={cn('text-[28px] font-bold tabular-nums leading-none', isBreak ? 'text-green-700 dark:text-green-300' : 'text-[#111827] dark:text-white/90')}>
              {String(minutes).padStart(2, '0')}<span className="text-lg">:</span>{String(seconds).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5 truncate max-w-[80px]">
              {taskTitle}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2">
          <button onClick={resetTimer}
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors"
            aria-label="重置">
            <RotateCcw size={16} />
          </button>
          <button onClick={handleToggle}
            className={cn(
              'p-2.5 rounded-full text-white transition-colors',
              isBreak
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-[#7C72F6] hover:bg-[#6D63E6]',
            )}
            aria-label={isRunning ? '暂停' : '开始'}>
            {isRunning ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <button onClick={skipTimer}
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors"
            aria-label="跳过">
            <SkipForward size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
