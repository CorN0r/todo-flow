import { useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { showPomodoroWindow, hidePomodoroWindow } from '../lib/db';
import { usePomodoroStore } from '../stores/pomodoroStore';

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

/** Handles cross-window pomodoro sync: state emit, control receive, window show/hide, notifications */
export function usePomodoroSync() {
  const mode = usePomodoroStore((s) => s.mode);
  const minutes = usePomodoroStore((s) => s.minutes);
  const seconds = usePomodoroStore((s) => s.seconds);
  const isPaused = usePomodoroStore((s) => s.isPaused);
  const taskTitle = usePomodoroStore((s) => s.taskTitle);
  const sessionStartTime = usePomodoroStore((s) => s.sessionStartTime);
  const sessionsInCycle = usePomodoroStore((s) => s.sessionsInCycle);
  const config = usePomodoroStore((s) => s.config);

  const lastCompleted = usePomodoroStore((s) => s.lastCompleted);

  // Show/hide standalone window
  useEffect(() => {
    if (sessionStartTime) showPomodoroWindow().catch(() => {});
    else hidePomodoroWindow().catch(() => {});
  }, [sessionStartTime]);

  // Emit state to standalone window
  useEffect(() => {
    emit('pomodoro-state', {
      mode, minutes, seconds, isRunning: !isPaused,
      taskTitle, sessionStartTime, sessionsInCycle,
      config: { focusMinutes: config.focusMinutes, sessionsUntilLongBreak: config.sessionsUntilLongBreak },
    }).catch(() => {});
  }, [mode, minutes, seconds, isPaused, taskTitle, sessionStartTime, sessionsInCycle, config]);

  // Receive control events from standalone window
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen<{ action: string }>('pomodoro-control', (event) => {
      if (cancelled) return;
      const store = usePomodoroStore.getState();
      switch (event.payload.action) {
        case 'pause': store.pauseTimer(); break;
        case 'resume': store.resumeTimer(); break;
        case 'skip': store.skipTimer(); break;
        case 'reset': store.resetTimer(); break;
        case 'stop': store.stopTimer(); break;
      }
    }).then((u) => {
      if (cancelled) { u(); return; }
      unlisten = u;
    }).catch(() => {});
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  // Completion notification — triggered by lastCompleted signal from store
  useEffect(() => {
    if (!lastCompleted) return;
    playBeep();
    if (lastCompleted === 'focus') {
      toast.success('专注完成！休息一下吧 ☕', { duration: 5000 });
      sendNotification({ title: 'TodoFlow', body: '专注完成！休息一下吧 ☕' });
    } else if (lastCompleted === 'shortBreak' || lastCompleted === 'longBreak') {
      toast('休息结束，开始新的专注', { duration: 4000 });
      sendNotification({ title: 'TodoFlow', body: '休息结束，开始新的专注' });
    }
    // Clear the signal after handling
    usePomodoroStore.setState({ lastCompleted: null });
  }, [lastCompleted]);
}
