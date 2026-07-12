import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward, Square, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTasks } from '../../hooks/useTasks';
import { getRepositories } from '../../domain/repositories/current';
import type { Task } from '../../domain/models/task';
import { usePomodoroStore } from '../../stores/pomodoroStore';
import type { PomodoroMode } from '../../types/pomodoro';
import { MobileAppBar, MobileChip, MobileEmptyState, MobileIconButton, MobilePage, MobilePageContent } from '../components/MobilePrimitives';

const T = {
  title: '\u4e13\u6ce8',
  backHabits: '\u4e60\u60ef',
  noTask: '\u65e0\u5173\u8054\u4efb\u52a1',
  selectTask: '\u5173\u8054\u4efb\u52a1',
  start: '\u5f00\u59cb\u4e13\u6ce8',
  pause: '\u6682\u505c',
  resume: '\u7ee7\u7eed',
  reset: '\u91cd\u7f6e',
  stop: '\u505c\u6b62',
  skip: '\u8df3\u5230\u4e0b\u4e00\u9636\u6bb5',
  focus: '\u4e13\u6ce8\u4e2d',
  shortBreak: '\u77ed\u4f11\u606f',
  longBreak: '\u957f\u4f11\u606f',
  idle: '\u51c6\u5907\u5f00\u59cb',
  emptyTasks: '\u6ca1\u6709\u53ef\u5173\u8054\u7684\u4efb\u52a1',
  notificationReady: '\u9636\u6bb5\u5b8c\u6210\u540e\u4f1a\u89e6\u53d1\u5e73\u53f0\u901a\u77e5\u5360\u4f4d',
};

const modeLabel: Record<PomodoroMode, string> = {
  focus: T.focus,
  shortBreak: T.shortBreak,
  longBreak: T.longBreak,
};

function isVisibleRootTask(task: Task) {
  return !task.parent_task_id && !task.is_archived && !task.is_abandoned && !task.is_completed;
}

function formatTime(minutes: number, seconds: number) {
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function durationForMode(mode: PomodoroMode, config: ReturnType<typeof usePomodoroStore.getState>['config']) {
  if (mode === 'focus') return config.focusMinutes * 60;
  if (mode === 'shortBreak') return config.shortBreakMinutes * 60;
  return config.longBreakMinutes * 60;
}

export function MobileFocusPage() {
  const navigate = useNavigate();
  const { data: tasks = [] } = useTasks({ include_children: true });
  const visibleTasks = useMemo(() => tasks.filter(isVisibleRootTask), [tasks]);
  const store = usePomodoroStore();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(store.taskId);
  const selectedTask = visibleTasks.find((task) => task.id === selectedTaskId) ?? null;
  const totalSeconds = durationForMode(store.mode, store.config);
  const remainingSeconds = store.minutes * 60 + store.seconds;
  const progress = totalSeconds > 0 ? Math.max(0, Math.min(100, ((totalSeconds - remainingSeconds) / totalSeconds) * 100)) : 0;

  useEffect(() => {
    if (!store.lastCompleted) return;
    const body = store.lastCompleted === 'focus'
      ? '\u4e13\u6ce8\u5b8c\u6210\uff0c\u8be5\u4f11\u606f\u4e00\u4e0b\u4e86'
      : '\u4f11\u606f\u7ed3\u675f\uff0c\u53ef\u4ee5\u5f00\u59cb\u65b0\u4e00\u8f6e\u4e13\u6ce8';
    getRepositories().platform.sendNotification({ title: 'TodoFlow', body }).catch(() => {});
    usePomodoroStore.setState({ lastCompleted: null });
  }, [store.lastCompleted]);

  const start = async () => {
    await getRepositories().platform.registerBackgroundWork({ id: 'mobile-focus-session', reason: 'focus-session' }).catch(() => undefined);
    store.startTimer(selectedTask?.id ?? null, selectedTask?.title ?? '');
  };

  return (
    <MobilePage>
      <MobileAppBar
        title={T.title}
        trailing={<MobileIconButton label={T.backHabits} icon={Timer} onClick={() => navigate('/mobile/habits')} />}
      />
      <MobilePageContent>
        <section className="rounded-[var(--mobile-radius-lg)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] p-5 text-center shadow-[var(--mobile-shadow-card)]">
          <p className="text-[var(--mobile-font-caption)] font-medium leading-5 text-[var(--mobile-color-text-muted)]">
            {store.sessionStartTime ? modeLabel[store.mode] : T.idle}
          </p>
          <div className="mt-3 text-[48px] font-semibold leading-none text-[var(--mobile-color-text)] tabular-nums">
            {formatTime(store.minutes, store.seconds)}
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--mobile-color-primary-container)]">
            <div className="h-full rounded-full bg-[var(--mobile-color-primary)] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 min-h-5 break-words text-[var(--mobile-font-caption)] leading-5 text-[var(--mobile-color-text-muted)]">
            {store.taskTitle || selectedTask?.title || T.noTask}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-[var(--mobile-font-caption)] font-semibold uppercase leading-5 text-[var(--mobile-color-text-muted)]">
            {T.selectTask}
          </h2>
          <div className="flex flex-wrap gap-2">
            <MobileChip active={!selectedTaskId} onClick={() => setSelectedTaskId(null)}>
              {T.noTask}
            </MobileChip>
            {visibleTasks.slice(0, 8).map((task) => (
              <MobileChip key={task.id} active={selectedTaskId === task.id || store.taskId === task.id} onClick={() => setSelectedTaskId(task.id)}>
                {task.title}
              </MobileChip>
            ))}
          </div>
          {visibleTasks.length === 0 && <MobileEmptyState title={T.emptyTasks} />}
        </section>

        <section className="grid grid-cols-2 gap-2">
          {!store.sessionStartTime ? (
            <button
              type="button"
              onClick={start}
              className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-primary)] px-4 text-[var(--mobile-font-body)] font-semibold leading-6 text-white"
            >
              <Play aria-hidden className="h-5 w-5" />
              {T.start}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={store.isRunning ? store.pauseTimer : store.resumeTimer}
                className="flex min-h-12 items-center justify-center gap-2 rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-primary)] px-4 text-[var(--mobile-font-body)] font-semibold leading-6 text-white"
              >
                {store.isRunning ? <Pause aria-hidden className="h-5 w-5" /> : <Play aria-hidden className="h-5 w-5" />}
                {store.isRunning ? T.pause : T.resume}
              </button>
              <button
                type="button"
                onClick={store.skipTimer}
                className="flex min-h-12 items-center justify-center gap-2 rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-4 text-[var(--mobile-font-body)] font-semibold leading-6 text-[var(--mobile-color-text)]"
              >
                <SkipForward aria-hidden className="h-5 w-5" />
                {T.skip}
              </button>
              <button
                type="button"
                onClick={store.resetTimer}
                className="flex min-h-12 items-center justify-center gap-2 rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-4 text-[var(--mobile-font-body)] font-semibold leading-6 text-[var(--mobile-color-text)]"
              >
                <RotateCcw aria-hidden className="h-5 w-5" />
                {T.reset}
              </button>
              <button
                type="button"
                onClick={store.stopTimer}
                className="flex min-h-12 items-center justify-center gap-2 rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-danger)] px-4 text-[var(--mobile-font-body)] font-semibold leading-6 text-[var(--mobile-color-danger)]"
              >
                <Square aria-hidden className="h-5 w-5" />
                {T.stop}
              </button>
            </>
          )}
        </section>

        <p className="rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-3 py-2 text-[var(--mobile-font-caption)] leading-5 text-[var(--mobile-color-text-muted)]">
          {T.notificationReady}
        </p>
      </MobilePageContent>
    </MobilePage>
  );
}
