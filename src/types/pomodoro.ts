export type PomodoroMode = 'focus' | 'shortBreak' | 'longBreak';

export interface PomodoroConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsUntilLongBreak: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsUntilLongBreak: 4,
  autoStartBreak: false,
  autoStartFocus: false,
};

export interface PomodoroSession {
  id: string;
  taskId: string | null;
  taskTitle: string;
  mode: PomodoroMode;
  durationMinutes: number;
  completed: boolean;
  startedAt: string;
  endedAt: string | null;
}

export interface DailyStats {
  date: string;
  focusMinutes: number;
  sessionsCompleted: number;
}

export interface PomodoroState {
  // Timer state
  taskId: string | null;
  taskTitle: string;
  mode: PomodoroMode;
  minutes: number;
  seconds: number;
  isRunning: boolean;
  isPaused: boolean;
  sessionsInCycle: number; // how many focus sessions done in current cycle
  totalSessionsToday: number;

  // History
  dailyFocusMinutes: Record<string, number>; // date → total focus minutes
  taskFocusMinutes: Record<string, { title: string; minutes: number }>; // taskId → {title, minutes}

  // Config
  config: PomodoroConfig;

  // Current session tracking
  sessionStartTime: string | null;
  lastCompleted: string | null; // 'focus' | 'shortBreak' | 'longBreak' — set when a phase ends, cleared after read

  // Actions
  startTimer: (taskId: string | null, taskTitle: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  stopTimer: () => void;
  skipTimer: () => void;
  tick: () => void;
  updateConfig: (partial: Partial<PomodoroConfig>) => void;
}
