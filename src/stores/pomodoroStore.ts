import { create } from 'zustand';

export type PomodoroMode = 'focus' | 'break';

interface PomodoroState {
  taskId: string | null;
  taskTitle: string;
  mode: PomodoroMode;
  minutes: number;
  seconds: number;
  isRunning: boolean;
  isPaused: boolean;
  sessionsCompleted: number;

  focusMinutes: number;
  breakMinutes: number;

  startTimer: (taskId: string, taskTitle: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  skipTimer: () => void;
  tick: () => void;
  setFocusMinutes: (m: number) => void;
  setBreakMinutes: (m: number) => void;
}

const DEFAULT_FOCUS = 25;
const DEFAULT_BREAK = 5;

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
  taskId: null,
  taskTitle: '',
  mode: 'focus',
  minutes: DEFAULT_FOCUS,
  seconds: 0,
  isRunning: false,
  isPaused: false,
  sessionsCompleted: 0,

  focusMinutes: DEFAULT_FOCUS,
  breakMinutes: DEFAULT_BREAK,

  startTimer(taskId, taskTitle) {
    const { focusMinutes } = get();
    set({
      taskId,
      taskTitle,
      mode: 'focus',
      minutes: focusMinutes,
      seconds: 0,
      isRunning: true,
      isPaused: false,
    });
  },

  pauseTimer() {
    set({ isPaused: true, isRunning: false });
  },

  resumeTimer() {
    set({ isPaused: false, isRunning: true });
  },

  resetTimer() {
    set({
      taskId: null,
      taskTitle: '',
      mode: 'focus',
      minutes: get().focusMinutes,
      seconds: 0,
      isRunning: false,
      isPaused: false,
    });
  },

  skipTimer() {
    const { mode, focusMinutes, breakMinutes, sessionsCompleted } = get();
    if (mode === 'focus') {
      set({
        mode: 'break',
        minutes: breakMinutes,
        seconds: 0,
        isRunning: true,
        isPaused: false,
        sessionsCompleted: sessionsCompleted + 1,
      });
    } else {
      set({
        mode: 'focus',
        minutes: focusMinutes,
        seconds: 0,
        isRunning: true,
        isPaused: false,
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
      const { mode, breakMinutes, focusMinutes, sessionsCompleted } = get();
      if (mode === 'focus') {
        set({
          mode: 'break',
          minutes: breakMinutes,
          seconds: 0,
          sessionsCompleted: sessionsCompleted + 1,
        });
      } else {
        set({
          mode: 'focus',
          minutes: focusMinutes,
          seconds: 0,
          isRunning: false,
          isPaused: false,
        });
      }
    }
  },

  setFocusMinutes(m) { set({ focusMinutes: m }); },
  setBreakMinutes(m) { set({ breakMinutes: m }); },
}));
