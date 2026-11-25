import { create } from 'zustand';
import type { PomodoroMode, PomodoroConfig, PomodoroState } from '../types/pomodoro';
import { DEFAULT_POMODORO_CONFIG } from '../types/pomodoro';

function loadConfig(): PomodoroConfig {
  try {
    const raw = localStorage.getItem('pomodoroConfig');
    if (raw) return { ...DEFAULT_POMODORO_CONFIG, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_POMODORO_CONFIG;
}

function saveConfig(config: PomodoroConfig) {
  localStorage.setItem('pomodoroConfig', JSON.stringify(config));
}

function loadHistory(): { daily: Record<string, number>; tasks: Record<string, { title: string; minutes: number }> } {
  try {
    const raw = localStorage.getItem('pomodoroHistory');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { daily: {}, tasks: {} };
}

function saveHistory(daily: Record<string, number>, tasks: Record<string, { title: string; minutes: number }>) {
  localStorage.setItem('pomodoroHistory', JSON.stringify({ daily, tasks }));
}

// ─── 会话持久化 ───
// 切换工作区会重启应用。把进行中的番茄钟写进 localStorage,重启后接着计时;
// 配置和历史本来就存在这里,不受重启影响。
const SESSION_KEY = 'pomodoroSession';

/**
 * 只有主窗口负责番茄钟会话。
 *
 * 悬浮窗、便签、提醒这些窗口加载的是同一份前端代码,所以每个窗口里都有一份本模块的
 * 实例。计时、通知和独立窗口的显示向来都由主窗口驱动;其他窗口的实例一直是空闲的。
 * 恢复会话和落盘也只能在主窗口做——否则重启时如果有一个进行中的番茄钟,每个窗口都会
 * 各恢复一份并各自计时、各自写记录:主窗口里点了停止,别的窗口还会把记录写回去,
 * 跑完了还会各记一笔专注(2026-11-24 真机验收踩到)。
 * 主窗口的地址不带查询参数;其他窗口带 `?widget=1`、`?pomodoro=1`、`?reminder=1`、`?note=<id>`。
 */
function ownsPomodoroSession(): boolean {
  return window.location.search === '';
}

export interface PersistedPomodoroSession {
  /** 会话开始时刻(ISO) */
  start: string;
  mode: PomodoroMode;
  taskId: string | null;
  taskTitle: string;
  sessionsInCycle: number;
  /** 写入时剩余的秒数 */
  remainingSeconds: number;
  /** 写入时刻(毫秒时间戳) */
  savedAt: number;
  running: boolean;
  paused: boolean;
}

/** 重启后的剩余秒数:运行中的会话扣掉应用不在的这段时间,暂停的原样恢复。 */
export function remainingAfterRestart(session: PersistedPomodoroSession, now = Date.now()): number {
  const away = session.running ? Math.max(0, (now - session.savedAt) / 1000) : 0;
  return Math.max(0, Math.round(session.remainingSeconds - away));
}

function loadSession(): PersistedPomodoroSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed: Partial<PersistedPomodoroSession> | null = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.start === 'string' && typeof parsed.remainingSeconds === 'number') {
      return parsed as PersistedPomodoroSession;
    }
  } catch { /* ignore */ }
  return null;
}

type RestoredTimer = Pick<
  PomodoroState,
  'taskId' | 'taskTitle' | 'mode' | 'minutes' | 'seconds' | 'isRunning' | 'isPaused' | 'sessionsInCycle' | 'sessionStartTime'
>;

function restoreTimer(): RestoredTimer | null {
  const session = loadSession();
  if (!session) return null;
  const remaining = remainingAfterRestart(session);
  return {
    taskId: session.taskId,
    taskTitle: session.taskTitle,
    mode: session.mode,
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
    isRunning: session.running,
    isPaused: session.paused,
    sessionsInCycle: session.sessionsInCycle,
    sessionStartTime: session.start,
  };
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
    // 上次没走完的番茄钟接着计时(只在主窗口);没有的话从初始状态开始
    ...((ownsPomodoroSession() ? restoreTimer() : null) ?? {
      taskId: null,
      taskTitle: '',
      mode: 'focus' as PomodoroMode,
      minutes: config.focusMinutes,
      seconds: 0,
      isRunning: false,
      isPaused: false,
      sessionsInCycle: 0,
      sessionStartTime: null,
    }),
    totalSessionsToday: 0,
    dailyFocusMinutes: history.daily,
    taskFocusMinutes: history.tasks,
    config,
    // 这里不要再写 sessionStartTime:上面的展开已经带上它(恢复出来的或 null)。
    // 在后面再写一个 null 会把恢复出来的会话起点覆盖掉——计时在走,但窗口不显示,
    // 落盘逻辑还会把存档删掉(2026-11-24 真机验收踩到)。
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

// 恢复出来的会话如果仍在运行,把计时循环接上(初始状态不会触发上面的订阅);
// 会话状态一变就落盘,运行中每秒一次,写入很小。两者都只在主窗口做。
if (ownsPomodoroSession()) {
  if (usePomodoroStore.getState().isRunning) {
    startLoop(() => usePomodoroStore.getState().tick());
  }

  usePomodoroStore.subscribe((s) => {
    if (!s.sessionStartTime) {
      if (localStorage.getItem(SESSION_KEY) !== null) localStorage.removeItem(SESSION_KEY);
      return;
    }
    const session: PersistedPomodoroSession = {
      start: s.sessionStartTime,
      mode: s.mode,
      taskId: s.taskId,
      taskTitle: s.taskTitle,
      sessionsInCycle: s.sessionsInCycle,
      remainingSeconds: s.minutes * 60 + s.seconds,
      savedAt: Date.now(),
      running: s.isRunning,
      paused: s.isPaused,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  });
}
