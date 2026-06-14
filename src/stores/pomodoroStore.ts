import { create } from 'zustand';
import type { PomodoroMode, PomodoroConfig, PomodoroState } from '../types/pomodoro';
import { DEFAULT_POMODORO_CONFIG } from '../types/pomodoro';

function loadConfig(): PomodoroConfig {
  try {
    const raw = localStorage.getItem('pomodoroConfig');
    if (raw) return { ...DEFAULT_POMODORO_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_POMODORO_CONFIG;
}

function saveConfig(config: PomodoroConfig) {
  localStorage.setItem('pomodoroConfig', JSON.stringify(config));
}

function loadHistory(): { daily: Record<string, number>; tasks: Record<string, { title: string; minutes: number }> } {
  try {
    const raw = localStorage.getItem('pomodoroHistory');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { daily: {}, tasks: {} };
}

function saveHistory(daily: Record<string, number>, tasks: Record<string, { title: string; minutes: number }>) {
  localStorage.setItem('pomodoroHistory', JSON.stringify({ daily, tasks }));
}

let _timerInterval: ReturnType<typeof setInterval> | null = null;

function startLoop(tick: () => void) {
  stopLoop();
  _timerInterval = setInterval(tick, 1000);
}

function stopLoop() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  const config = loadConfig();
  const history = loadHistory();

  return {
    taskId: null,
    taskTitle: '',
    mode: 'focus' as PomodoroMode,
    minutes: config.focusMinutes,
    seconds: 0,
    isRunning: false,
    isPaused: false,
    sessionsInCycle: 0,
    totalSessionsToday: 0,
    dailyFocusMinutes: history.daily,
    taskFocusMinutes: history.tasks,
    config,
    sessionStartTime: null,
    lastCompleted: null,

    startTimer(taskId, taskTitle) {
      const { config } = get();
      set({
        taskId,
        taskTitle,
        mode: 'focus',
        minutes: config.focusMinutes,
        seconds: 0,
        isRunning: true,
        isPaused: false,
        sessionsInCycle: get().sessionsInCycle,
        sessionStartTime: new Date().toISOString(),
      });
    },

    pauseTimer() {
      set({ isPaused: true, isRunning: false });
    },

    resumeTimer() {
      set({ isPaused: false, isRunning: true });
    },

    resetTimer() {
      // Restart current phase from full duration
      const { mode, config } = get();
      const mins = mode === 'focus'
        ? config.focusMinutes
        : mode === 'shortBreak' ? config.shortBreakMinutes : config.longBreakMinutes;
      set({
        minutes: mins,
        seconds: 0,
        isRunning: false,
        isPaused: false,
      });
    },

    stopTimer() {
      // Close the pomodoro entirely
      const { config } = get();
      set({
        taskId: null,
        taskTitle: '',
        mode: 'focus',
        minutes: config.focusMinutes,
        seconds: 0,
        isRunning: false,
        isPaused: false,
        sessionsInCycle: 0,
        sessionStartTime: null,
      });
    },

    skipTimer() {
      const { mode, config } = get();
      if (mode === 'focus') {
        const next = get().sessionsInCycle + 1;
        const isLongBreak = next >= config.sessionsUntilLongBreak;
        const today = new Date().toISOString().split('T')[0];
        const prev = get().dailyFocusMinutes;
        const tId = get().taskId;
        const tTitle = get().taskTitle;
        const tPrev = get().taskFocusMinutes;
        const tKey = tId || '__none__';
        set({
          mode: isLongBreak ? 'longBreak' : 'shortBreak',
          minutes: isLongBreak ? config.longBreakMinutes : config.shortBreakMinutes,
          seconds: 0,
          isRunning: true,
          isPaused: false,
          sessionsInCycle: next,
          totalSessionsToday: get().totalSessionsToday + 1,
          dailyFocusMinutes: { ...prev, [today]: (prev[today] || 0) + config.focusMinutes },
          taskFocusMinutes: { ...tPrev, [tKey]: { title: tTitle || '(无任务)', minutes: (tPrev[tKey]?.minutes || 0) + config.focusMinutes } },
          sessionStartTime: new Date().toISOString(),
          lastCompleted: 'focus',
        });
      } else {
        set({
          mode: 'focus',
          minutes: config.focusMinutes,
          seconds: 0,
          isRunning: true,
          isPaused: false,
          sessionStartTime: new Date().toISOString(),
          lastCompleted: mode,
        });
      }
    },

    tick() {
      const { minutes, seconds, isRunning } = get();
      if (!isRunning) return;

      if (seconds > 0) {
        set({ seconds: seconds - 1 });
      } else if (minutes > 0) {
        set({ minutes: minutes - 1, seconds: 59 });
      } else {
        // Timer reached 0
        const { mode, config } = get();
        if (mode === 'focus') {
          const next = get().sessionsInCycle + 1;
          const isLongBreak = next >= config.sessionsUntilLongBreak;
          const today = new Date().toISOString().split('T')[0];
          const prev = get().dailyFocusMinutes;
          const tId = get().taskId;
          const tTitle = get().taskTitle;
          const tPrev = get().taskFocusMinutes;
          const tKey = tId || '__none__';
          set({
            mode: isLongBreak ? 'longBreak' : 'shortBreak',
            minutes: isLongBreak ? config.longBreakMinutes : config.shortBreakMinutes,
            seconds: 0,
            sessionsInCycle: next,
            totalSessionsToday: get().totalSessionsToday + 1,
            dailyFocusMinutes: { ...prev, [today]: (prev[today] || 0) + config.focusMinutes },
            taskFocusMinutes: { ...tPrev, [tKey]: { title: tTitle || '(无任务)', minutes: (tPrev[tKey]?.minutes || 0) + config.focusMinutes } },
            sessionStartTime: new Date().toISOString(),
            lastCompleted: 'focus',
            ...(config.autoStartBreak ? { isRunning: true, isPaused: false } : { isRunning: false, isPaused: false }),
          });
        } else {
          // Break ended — reset cycle if long break
          const resetCycle = mode === 'longBreak';
          set({
            mode: 'focus',
            minutes: config.focusMinutes,
            seconds: 0,
            isRunning: false,
            isPaused: false,
            sessionsInCycle: resetCycle ? 0 : get().sessionsInCycle,
            lastCompleted: mode,
            sessionStartTime: new Date().toISOString(),
          });
        }
      }
    },

    updateConfig(partial) {
      const next = { ...get().config, ...partial };
      set({ config: next });
      saveConfig(next);
    },
  };
});

// Auto-manage timer loop
usePomodoroStore.subscribe((s, prev) => {
  if (s.isRunning && !prev.isRunning) {
    startLoop(() => usePomodoroStore.getState().tick());
  }
  if (!s.isRunning && prev.isRunning) {
    stopLoop();
  }
});

// Auto-persist history on change
let lastSaved = '';
usePomodoroStore.subscribe((s) => {
  const current = JSON.stringify({ daily: s.dailyFocusMinutes, tasks: s.taskFocusMinutes });
  if (current !== lastSaved) {
    lastSaved = current;
    saveHistory(s.dailyFocusMinutes, s.taskFocusMinutes);
  }
});
