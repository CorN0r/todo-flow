import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileApp } from '../../mobile/MobileApp';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { resetRepositories, setRepositoriesForTesting } from '../../domain/repositories/current';
import { usePomodoroStore } from '../../stores/pomodoroStore';
import type { Habit } from '../../types/habit';
import type { Task } from '../../types/task';
import { buildTask, renderWithProviders } from '../test-utils';

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDaysISO(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const habit: Habit = {
  id: 'habit-1',
  name: 'Morning stretch',
  color: '#10B981',
  icon: 'target',
  frequency: 'daily',
  target_count: 1,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderMobile(initialEntry: string, seed: { tasks?: Task[]; habits?: Habit[] } = {}) {
  const memory = createMemoryRepositories({
    tasks: seed.tasks ?? [],
    habits: seed.habits ?? [],
  });
  setRepositoriesForTesting(memory.repositories);
  const result = renderWithProviders(
    <Routes>
      <Route path="/mobile/*" element={<MobileApp />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
  return { ...result, state: memory.state, repositories: memory.repositories };
}

describe('Mobile calendar, habits, and focus', () => {
  afterEach(() => {
    usePomodoroStore.getState().stopTimer();
    usePomodoroStore.setState({
      dailyFocusMinutes: {},
      taskFocusMinutes: {},
      sessionsInCycle: 0,
      totalSessionsToday: 0,
      lastCompleted: null,
    });
    localStorage.clear();
    resetRepositories();
  });

  it('filters the mobile calendar agenda by selected date and shows month task markers', async () => {
    const user = userEvent.setup();
    const today = todayISO();
    const adjacent = addDaysISO(new Date().getDay() === 6 ? -1 : 1);
    renderMobile('/mobile/calendar', {
      tasks: [
        buildTask({ id: 'today-task', title: 'Calendar today', due_date: today }),
        buildTask({ id: 'adjacent-task', title: 'Calendar adjacent', due_date: adjacent }),
      ],
    });

    expect(await screen.findByText('Calendar today')).toBeInTheDocument();
    expect(screen.queryByText('Calendar adjacent')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(adjacent));
    expect(await screen.findByText('Calendar adjacent')).toBeInTheDocument();
    expect(screen.queryByText('Calendar today')).not.toBeInTheDocument();

    await user.click(screen.getByText('\u6708\u89c6\u56fe'));
    expect(screen.getByLabelText(`${adjacent} 1\u9879`)).toBeInTheDocument();
  });

  it('persists habit check-in locally and updates visible streak state', async () => {
    const user = userEvent.setup();
    const { state } = renderMobile('/mobile/habits', { habits: [habit] });

    expect(await screen.findByText('Morning stretch')).toBeInTheDocument();
    await user.click(screen.getByLabelText('\u6253\u5361'));

    await waitFor(() => expect(state.habitLogs.some((log) => log.habit_id === habit.id)).toBe(true));
    expect(await screen.findByLabelText('\u5df2\u6253\u5361')).toBeInTheDocument();
    expect(screen.getAllByText(`1\u5929`).length).toBeGreaterThanOrEqual(1);
  });

  it('runs mobile focus phase transitions and calls the notification placeholder', async () => {
    const user = userEvent.setup();
    const focusTask = buildTask({ id: 'focus-task', title: 'Focus task' });
    const { repositories } = renderMobile('/mobile/focus', { tasks: [focusTask] });
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const registerBackgroundWork = vi.fn().mockResolvedValue({ supported: false, reason: 'test' });
    repositories.platform.sendNotification = sendNotification;
    repositories.platform.registerBackgroundWork = registerBackgroundWork;
    usePomodoroStore.getState().updateConfig({ sessionsUntilLongBreak: 2 });

    await user.click(await screen.findByText('Focus task'));
    await user.click(screen.getByText('\u5f00\u59cb\u4e13\u6ce8'));
    await waitFor(() => expect(registerBackgroundWork).toHaveBeenCalledWith({ id: 'mobile-focus-session', reason: 'focus-session' }));

    await user.click(screen.getByText('\u8df3\u5230\u4e0b\u4e00\u9636\u6bb5'));
    expect(await screen.findByText('\u77ed\u4f11\u606f')).toBeInTheDocument();
    await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText('\u8df3\u5230\u4e0b\u4e00\u9636\u6bb5'));
    expect(await screen.findByText('\u4e13\u6ce8\u4e2d')).toBeInTheDocument();

    await user.click(screen.getByText('\u8df3\u5230\u4e0b\u4e00\u9636\u6bb5'));
    expect(await screen.findByText('\u957f\u4f11\u606f')).toBeInTheDocument();
    await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(3));

    const timerSurface = screen.getByText('\u957f\u4f11\u606f').closest('section')!;
    expect(within(timerSurface).getByText('Focus task')).toBeInTheDocument();
  });
});
