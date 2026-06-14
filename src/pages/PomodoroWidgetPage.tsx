import { useEffect, useState, useRef } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Play, Pause, SkipForward, RotateCcw, X, Clock, Coffee, Maximize2, Minimize2 } from 'lucide-react';

interface PomodoroState {
  mode: string; minutes: number; seconds: number; isRunning: boolean;
  taskTitle: string; sessionStartTime: string | null; sessionsInCycle: number;
  config: { focusMinutes: number; sessionsUntilLongBreak: number };
}

const MODE_META: Record<string, { label: string; icon: typeof Clock; ring: string }> = {
  focus:      { label: '专注中', icon: Clock,  ring: '#7C72F6' },
  shortBreak: { label: '短休息', icon: Coffee, ring: '#10B981' },
  longBreak:  { label: '长休息', icon: Coffee, ring: '#3B82F6' },
};

function sendControl(action: string) {
  emit('pomodoro-control', { action }).catch(() => {});
}

export function PomodoroWidgetPage() {
  const [pomo, setPomo] = useState<PomodoroState | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowHover = useRef(false);
  const dragging = useRef(false);

  const toggleFullscreen = () => {
    const win = getCurrentWindow();
    const next = !isFullscreen;
    win.setFullscreen(next).catch(() => {});
    setIsFullscreen(next);
    setShowControls(false);
    allowHover.current = false;
    setTimeout(() => { allowHover.current = true; }, 600);
    document.body.style.backgroundColor = next ? '#0f0f1a' : 'transparent';
  };

  const handleMouseMove = () => {
    if (!allowHover.current) return;
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 1500);
  };

  // Escape to exit fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        getCurrentWindow().setFullscreen(false).catch(() => {});
        setIsFullscreen(false);
        document.body.style.backgroundColor = 'transparent';
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen]);

  // Block browser shortcuts (Ctrl+P / Ctrl+Shift+P = print, etc.)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    document.body.style.backgroundColor = 'transparent';
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';

    let cancelled = false;
    let unlean: (() => void) | null = null;
    listen<PomodoroState>('pomodoro-state', (event) => {
      if (cancelled) return;
      setPomo(event.payload);
    }).then((u) => {
      if (cancelled) { u(); return; }
      unlean = u;
    }).catch(() => {});

    return () => { cancelled = true; unlean?.(); };
  }, []);

  useEffect(() => {
    if (pomo && !pomo.sessionStartTime) {
      getCurrentWindow().hide().catch(() => {});
    }
  }, [pomo]);

  const handleDragStart = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('button')) return;
    dragging.current = true;
    getCurrentWindow().startDragging().catch(() => {});
  };

  if (!pomo || !pomo.sessionStartTime) {
    return <div className="h-screen w-screen bg-transparent" />;
  }

  const meta = MODE_META[pomo.mode] || MODE_META.focus;
  const totalSeconds = pomo.mode === 'focus'
    ? pomo.config.focusMinutes * 60
    : pomo.mode === 'longBreak' ? 15 * 60 : 5 * 60;
  const elapsed = totalSeconds - (pomo.minutes * 60 + pomo.seconds);
  const progress = totalSeconds > 0 ? elapsed / totalSeconds : 0;

  const ringSize = isFullscreen ? 400 : 110;
  const ringRadius = isFullscreen ? 190 : 49;
  const ringStroke = isFullscreen ? 5 : 5;
  const textSize = isFullscreen ? 'text-[100px]' : 'text-[28px]';
  const subTextSize = isFullscreen ? 'text-base' : 'text-[9px]';
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference * (1 - progress);

  const headerRow = isFullscreen ? (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-3">
        <meta.icon size={24} style={{ color: meta.ring }} />
        <span className="text-lg font-medium text-white/70">{meta.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-white/25">
          第 {Math.min(pomo.sessionsInCycle + 1, pomo.config.sessionsUntilLongBreak)}/{pomo.config.sessionsUntilLongBreak} 轮
        </span>
        {!pomo.isRunning && <span className="text-[13px] text-amber-400/60">· 已暂停</span>}
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <meta.icon size={10} style={{ color: meta.ring }} />
        <span className="text-[9px] font-semibold text-white/70">{meta.label}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <span className="text-[8px] text-white/30 tabular-nums">
          第 {Math.min(pomo.sessionsInCycle + 1, pomo.config.sessionsUntilLongBreak)}/{pomo.config.sessionsUntilLongBreak} 轮
        </span>
        <button onClick={toggleFullscreen}
          className="w-4 h-4 rounded-full flex items-center justify-center text-white/30 hover:text-white/80 hover:bg-white/[0.08] transition-colors ml-0.5"
          title="全屏沉浸模式">
          <Maximize2 size={8} />
        </button>
        <button onClick={() => sendControl('stop')}
          className="w-4 h-4 rounded-full flex items-center justify-center text-white/30 hover:text-white/80 hover:bg-white/[0.08] transition-colors ml-0.5"
          title="关闭">
          <X size={8} />
        </button>
      </div>
    </div>
  );

  const timerRing = (
    <div className="relative" style={{ width: ringSize, height: ringSize }}>
      {isFullscreen && (
        <div className="absolute inset-0 rounded-full blur-2xl opacity-15"
          style={{ backgroundColor: meta.ring, transform: 'scale(1.3)' }} />
      )}
      <svg viewBox={`0 0 ${ringSize} ${ringSize}`} className="w-full h-full -rotate-90">
        <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={ringStroke} />
        <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} fill="none" stroke={meta.ring} strokeWidth={ringStroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          filter={isFullscreen ? 'drop-shadow(0 0 12px currentColor)' : undefined}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${textSize} font-bold tabular-nums text-white leading-none tracking-tighter`}>
          {String(pomo.minutes).padStart(2, '0')}:{String(pomo.seconds).padStart(2, '0')}
        </span>
        {pomo.taskTitle && (
          <span className={`${subTextSize} text-white/30 mt-0.5 truncate`} style={{ maxWidth: ringSize * 0.6 }}>{pomo.taskTitle}</span>
        )}
      </div>

      {/* Controls overlay */}
      <div className={`absolute inset-0 flex items-center justify-center rounded-full transition-opacity duration-200 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(15,15,25,0.75)', gap: isFullscreen ? '1rem' : '0.375rem' }}>
        <button onClick={() => sendControl('reset')}
          className={`rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.12] transition-colors ${isFullscreen ? 'w-14 h-14' : 'w-7 h-7'}`}
          title="重新开始本轮">
          <RotateCcw size={isFullscreen ? 24 : 13} />
        </button>
        <button onClick={() => sendControl(pomo.isRunning ? 'pause' : 'resume')}
          className={`rounded-full flex items-center justify-center text-white shadow-sm hover:opacity-90 transition-opacity ${isFullscreen ? 'w-20 h-20' : 'w-9 h-9'}`}
          style={{ backgroundColor: meta.ring }}
          title={pomo.isRunning ? '暂停' : '继续'}>
          {pomo.isRunning ? <Pause size={isFullscreen ? 32 : 16} /> : <Play size={isFullscreen ? 32 : 16} className="ml-0.5" />}
        </button>
        <button onClick={() => sendControl('skip')}
          className={`rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.12] transition-colors ${isFullscreen ? 'w-14 h-14' : 'w-7 h-7'}`}
          title="跳过">
          <SkipForward size={isFullscreen ? 24 : 13} />
        </button>
      </div>
    </div>
  );

  return isFullscreen ? (
    <div className="h-screen w-screen select-none flex flex-col items-center justify-center gap-8"
      style={{ background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f1a 100%)' }}>
      {headerRow}
      <div onMouseMove={handleMouseMove}
        onMouseLeave={() => { setShowControls(false); if (hideTimer.current) clearTimeout(hideTimer.current); }}>
        {timerRing}
      </div>
      <div className="flex items-center gap-4">
        <button onClick={toggleFullscreen}
          className="px-5 py-2.5 rounded-full text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors text-sm flex items-center gap-2">
          <Minimize2 size={16} /> 退出全屏
        </button>
        <button onClick={() => { toggleFullscreen(); sendControl('stop'); }}
          className="px-5 py-2.5 rounded-full text-white/25 hover:text-red-400/70 hover:bg-red-400/[0.06] transition-colors text-sm flex items-center gap-2">
          <X size={16} /> 关闭番茄钟
        </button>
      </div>
    </div>
  ) : (
    <div className="h-screen w-screen bg-transparent select-none" onMouseDown={handleDragStart}>
      <div className="h-full flex items-center justify-center">
        <div
          className="bg-[#1e1e32]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-xl w-[170px]"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { setShowControls(false); if (hideTimer.current) clearTimeout(hideTimer.current); }}
        >
          <div className="px-3 pt-2 pb-0">{headerRow}</div>
          <div className="flex justify-center pt-1.5 pb-2.5">{timerRing}</div>
        </div>
      </div>
    </div>
  );
}
