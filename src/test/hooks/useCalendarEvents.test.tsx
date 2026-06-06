import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import type { Task } from '../../types/task';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock useTasks so we control what tasks useCalendarEvents receives
vi.mock('../../hooks/useTasks', () => ({
  useTasks: vi.fn(),
}));

import { useTasks } from '../../hooks/useTasks';

function TestComponent({
  currentDate,
  viewMode,
  onResult,
}: {
  currentDate: Date;
  viewMode: 'month' | 'week' | 'day';
  onResult: (result: ReturnType<typeof useCalendarEvents>) => void;
}) {
  const result = useCalendarEvents(currentDate, viewMode);
  onResult(result);
  return null;
}

function renderHook(
  currentDate: Date,
  viewMode: 'month' | 'week' | 'day',
): ReturnType<typeof useCalendarEvents> {
  let captured: ReturnType<typeof useCalendarEvents> = null!;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TestComponent currentDate={currentDate} viewMode={viewMode} onResult={(r) => { captured = r; }} />
    </QueryClientProvider>,
  );
  return captured;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'Test', description: '', is_completed: false, is_archived: false,
    is_suspended: false, is_abandoned: false, is_pinned: false, priority: 0, due_date: '2026-06-15', reminder: null, tag_id: null,
    parent_task_id: null, sort_order: 0, recurrence: null, my_day_date: null,
    children_count: 0,
    created_at: '', updated_at: '',
    ...overrides,
  };
}

describe('useCalendarEvents', () => {
  it('returns empty events when no tasks', () => {
    vi.mocked(useTasks).mockReturnValue({ data: [], isLoading: false } as any);
    const result = renderHook(new Date('2026-06-15'), 'month');
    expect(result.events).toEqual([]);
    expect(result.eventsByDate).toEqual({});
  });

  it('maps tasks with due_date to CalendarEvent', () => {
    const task = makeTask({ due_date: '2026-06-15' });
    vi.mocked(useTasks).mockReturnValue({ data: [task], isLoading: false } as any);
    const result = renderHook(new Date('2026-06-15'), 'month');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].date).toBe('2026-06-15');
    expect(result.events[0].task).toBe(task);
  });

  it('filters out tasks without due_date', () => {
    const withDate = makeTask({ id: 't1', due_date: '2026-06-15' });
    const withoutDate = makeTask({ id: 't2', due_date: null });
    vi.mocked(useTasks).mockReturnValue({ data: [withDate, withoutDate], isLoading: false } as any);
    const result = renderHook(new Date('2026-06-15'), 'month');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].task.id).toBe('t1');
  });

  it('groups events by date in eventsByDate', () => {
    const t1 = makeTask({ id: 't1', due_date: '2026-06-15', title: 'Task 1' });
    const t2 = makeTask({ id: 't2', due_date: '2026-06-15', title: 'Task 2' });
    const t3 = makeTask({ id: 't3', due_date: '2026-06-16', title: 'Task 3' });
    vi.mocked(useTasks).mockReturnValue({ data: [t1, t2, t3], isLoading: false } as any);
    const result = renderHook(new Date('2026-06-15'), 'month');
    expect(result.eventsByDate['2026-06-15']).toHaveLength(2);
    expect(result.eventsByDate['2026-06-16']).toHaveLength(1);
  });

  it('computes date range for month view spanning weeks', () => {
    const task = makeTask({ due_date: '2026-06-01' });
    vi.mocked(useTasks).mockReturnValue({ data: [task], isLoading: false } as any);
    const result = renderHook(new Date('2026-06-15'), 'month');
    expect(result.events).toHaveLength(1);
  });

  it('handles week view mode', () => {
    vi.mocked(useTasks).mockReturnValue({ data: [], isLoading: false } as any);
    const result = renderHook(new Date('2026-06-15'), 'week');
    expect(result.events).toEqual([]);
  });

  it('handles day view mode', () => {
    vi.mocked(useTasks).mockReturnValue({ data: [], isLoading: false } as any);
    const result = renderHook(new Date('2026-06-15'), 'day');
    expect(result.events).toEqual([]);
  });
});
