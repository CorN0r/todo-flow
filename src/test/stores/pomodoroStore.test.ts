import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedPomodoroSession } from '../../stores/pomodoroStore';

type StoreModule = typeof import('../../stores/pomodoroStore');

/** 每次重新加载模块,相当于应用重启一次 */
async function boot(): Promise<StoreModule> {
  vi.resetModules();
  return import('../../stores/pomodoroStore');
}

const START = '2026-11-24T09:00:00+08:00';

function session(overrides: Partial<PersistedPomodoroSession> = {}): PersistedPomodoroSession {
  return {
    start: START,
    mode: 'focus',
    taskId: 'task-1',
    taskTitle: '写周报',
    sessionsInCycle: 0,
    remainingSeconds: 25 * 60,
    savedAt: Date.now(),
    running: true,
    paused: false,
    ...overrides,
  };
}

function remainingOf(store: StoreModule) {
  const state = store.usePomodoroStore.getState();
  return state.minutes * 60 + state.seconds;
}

describe('番茄钟会话跨重启保持', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');   // 默认当作主窗口
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00+08:00'));
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.useRealTimers();
  });

  it.each(['/?widget=1', '/?pomodoro=1', '/?reminder=1', '/?note=abc'])(
    '其他窗口(%s)加载同一份代码,但不恢复会话、不计时、不动存档',
    async (url) => {
      const stored = JSON.stringify(session({ savedAt: Date.now() - 60_000 }));
      localStorage.setItem('pomodoroSession', stored);
      window.history.replaceState({}, '', url);

      const store = await boot();
      const state = store.usePomodoroStore.getState();
      expect(state.isRunning).toBe(false);
      expect(state.sessionStartTime).toBeNull();
      expect(remainingOf(store)).toBe(25 * 60);

      vi.advanceTimersByTime(5000);
      // 这个实例里发生了别的事(比如改了配置),也不能把主窗口的存档删掉或改写
      store.usePomodoroStore.getState().updateConfig({ focusMinutes: 30 });
      expect(localStorage.getItem('pomodoroSession')).toBe(stored);
    },
  );

  it('运行中的会话扣掉应用不在的时间,暂停的不扣', async () => {
    const { remainingAfterRestart } = await boot();
    const savedAt = Date.now();
    // 25 分钟的专注,应用关了 10 分钟:还剩 15 分钟
    expect(remainingAfterRestart(session({ savedAt }), savedAt + 10 * 60_000)).toBe(15 * 60);
    // 离开的时间比剩余还长:归零,由下一拍按"走到头"处理
    expect(remainingAfterRestart(session({ savedAt }), savedAt + 60 * 60_000)).toBe(0);
    // 暂停中的会话原样恢复
    expect(
      remainingAfterRestart(session({ savedAt, running: false, paused: true, remainingSeconds: 300 }), savedAt + 60 * 60_000),
    ).toBe(300);
  });

  it('重启后计时接着走,关联任务的标题保留', async () => {
    localStorage.setItem('pomodoroSession', JSON.stringify(session({ savedAt: Date.now() - 10 * 60_000 })));
    const store = await boot();

    const state = store.usePomodoroStore.getState();
    expect(state.isRunning).toBe(true);
    expect(remainingOf(store)).toBe(15 * 60);
    expect(state.taskTitle).toBe('写周报');
    expect(state.taskId).toBe('task-1');
    expect(state.mode).toBe('focus');
    // 会话起点必须一起恢复:番茄钟窗口靠它决定显示,落盘逻辑靠它决定保留存档
    expect(state.sessionStartTime).toBe(START);

    // 计时循环也接上了
    vi.advanceTimersByTime(1000);
    expect(remainingOf(store)).toBe(15 * 60 - 1);

    // 走了一拍之后存档还在(没有被当成"没有会话"删掉),起点不变
    const saved = JSON.parse(localStorage.getItem('pomodoroSession') ?? 'null');
    expect(saved.start).toBe(START);
    expect(saved.remainingSeconds).toBe(15 * 60 - 1);
  });

  it('暂停中的会话恢复后仍是暂停', async () => {
    localStorage.setItem(
      'pomodoroSession',
      JSON.stringify(session({ running: false, paused: true, remainingSeconds: 300, savedAt: Date.now() - 60 * 60_000 })),
    );
    const store = await boot();

    expect(store.usePomodoroStore.getState().isPaused).toBe(true);
    expect(store.usePomodoroStore.getState().isRunning).toBe(false);
    expect(store.usePomodoroStore.getState().sessionStartTime).toBe(START);
    expect(remainingOf(store)).toBe(300);
    vi.advanceTimersByTime(5000);
    expect(remainingOf(store)).toBe(300);
    expect(JSON.parse(localStorage.getItem('pomodoroSession') ?? 'null').start).toBe(START);
  });

  it('应用不在期间走到头的专注,恢复后按完成处理', async () => {
    localStorage.setItem(
      'pomodoroSession',
      JSON.stringify(session({ savedAt: Date.now() - 60 * 60_000 })),
    );
    const store = await boot();

    vi.advanceTimersByTime(1000);
    const state = store.usePomodoroStore.getState();
    expect(state.mode).toBe('shortBreak');
    expect(state.dailyFocusMinutes['2026-11-24']).toBe(25);
    expect(state.taskFocusMinutes['task-1']).toEqual({ title: '写周报', minutes: 25 });
  });

  it('开始计时就写入存档,结束后清掉', async () => {
    const store = await boot();
    expect(store.usePomodoroStore.getState().isRunning).toBe(false);
    expect(localStorage.getItem('pomodoroSession')).toBeNull();

    store.usePomodoroStore.getState().startTimer('task-1', '写周报');
    const saved = JSON.parse(localStorage.getItem('pomodoroSession') ?? 'null');
    expect(saved).toMatchObject({ taskTitle: '写周报', taskId: 'task-1', running: true, paused: false, remainingSeconds: 25 * 60 });

    vi.advanceTimersByTime(3000);
    expect(JSON.parse(localStorage.getItem('pomodoroSession') ?? 'null').remainingSeconds).toBe(25 * 60 - 3);

    store.usePomodoroStore.getState().stopTimer();
    expect(localStorage.getItem('pomodoroSession')).toBeNull();
  });

  it('存档损坏时从初始状态开始,不抛错', async () => {
    localStorage.setItem('pomodoroSession', '{not json');
    const store = await boot();
    expect(store.usePomodoroStore.getState().isRunning).toBe(false);
    expect(remainingOf(store)).toBe(25 * 60);
  });
});
