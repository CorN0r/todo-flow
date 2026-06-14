import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Clock, Coffee, Minimize2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { hidePomodoroWindow, showPomodoroWindow } from '../../lib/db';
import { usePomodoroStore } from '../../stores/pomodoroStore';
import type { PomodoroMode } from '../../types/pomodoro';

const MODE_META: Record<PomodoroMode, { label: string; icon: typeof Clock; ring: string }> = {
  focus:      { label: '专注中', icon: Clock,  ring: '#7C72F6' },
  shortBreak: { label: '短休息', icon: Coffee, ring: '#10B981' },
  longBreak:  { label: '长休息', icon: Coffee, ring: '#3B82F6' },
};

export function PomodoroFullscreen() {
  const navigate = useNavigate();
  const {
    taskTitle, mode, minutes, seconds, isPaused,
    sessionsInCycle, config, sessionStartTime,
  } = usePomodoroStore();
  const [showUI, setShowUI] = useState(false);

  // Enter/exit fullscreen — hide standalone window while fullscreen
  useEffect(() => {
    const win = getCurrentWindow();
    win.setFullscreen(true).catch(() => {});
    hidePomodoroWindow().catch(() => {});
    return () => {
      win.setFullscreen(false).catch(() => {});
      if (usePomodoroStore.getState().sessionStartTime) {
        showPomodoroWindow().catch(() => {});
      }
    };
  }, []);

  const handleExit = () => {
    getCurrentWindow().setFullscreen(false).catch(() => {});
    navigate(-1);
  };

  if (!sessionStartTime) {
    handleExit();
    return null;
  }

  const meta = MODE_META[mode];
  const totalSeconds = mode === 'focus'
    ? config.focusMinutes * 60
    : mode === 'shortBreak' ? config.shortBreakMinutes * 60 : config.longBreakMinutes * 60;
  const progress = totalSeconds > 0 ? (totalSeconds - (minutes * 60 + seconds)) / totalSeconds : 0;
  const circumference = 2 * Math.PI * 180;
  const strokeDashoffset = circumference * (1 - progress);

  const isFocus = mode === 'focus';

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center select-none"
      style={{ background: isFocus ? 'linear-gradient(135deg, #0f0f1a 0%, #1a1030 35%, #0f1525 70%, #0f0f1a 100%)' : 'linear-gradient(135deg, #0a1515 0%, #0d1a18 50%, #0a1515 100%)' }}
      onMouseMove={() => { setShowUI(true); }}
      onMouseLeave={() => { setShowUI(false); }}
    >
      {/* Top bar */}
      <div className={cn('absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 transition-opacity duration-500', showUI ? 'opacity-100' : 'opacity-0')}>
        <div className="flex items-center gap-3">
          <meta.icon size={18} style={{ color: meta.ring }} />
          <span className="text-sm font-medium text-white/70">{meta.label}</span>
          {taskTitle && <span className="text-xs text-white/30 ml-2">{taskTitle}</span>}
        </div>
        <button onClick={handleExit}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="退出全屏">
          <Minimize2 size={16} />
        </button>
      </div>

      {/* Timer */}
      <div className="relative">
        {/* Glow effect */}
        <div
          className="absolute inset-0 rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: meta.ring }}
        />
        <svg viewBox="0 0 400 400" className="w-[320px] h-[320px] relative -rotate-90">
          <circle cx="200" cy="200" r="180" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="4" />
          <circle cx="200" cy="200" r="180" fill="none" stroke={meta.ring} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            filter="drop-shadow(0 0 8px currentColor)"
            style={{ transition: 'stroke-dashoffset 1s linear', color: meta.ring }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[96px] font-bold tabular-nums text-white leading-none tracking-tighter">
            {String(minutes).padStart(2, '0')}
            <span className="text-white/20 mx-2">:</span>
            {String(seconds).padStart(2, '0')}
          </span>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-sm text-white/30">
              第 {Math.min(sessionsInCycle + 1, config.sessionsUntilLongBreak)}/{config.sessionsUntilLongBreak} 轮
            </span>
            {isPaused && (
              <span className="text-xs text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded-full">已暂停</span>
            )}
          </div>
        </div>
      </div>

      {/* Task info at bottom */}
      <div className={cn('absolute bottom-0 left-0 right-0 pb-8 text-center transition-opacity duration-500', showUI ? 'opacity-100' : 'opacity-0')}>
        {taskTitle ? (
          <p className="text-white/25 text-sm">{taskTitle}</p>
        ) : (
          <p className="text-white/15 text-sm">番茄钟</p>
        )}
        <p className="text-white/10 text-xs mt-1">移动鼠标显示控制，操作请到桌面悬浮窗</p>
      </div>
    </div>
  );
}
