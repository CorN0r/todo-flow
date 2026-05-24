import { useMemo } from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from '../lib/date';
import { useTasks } from './useTasks';
import type { Task } from '../types/task';

export interface CalendarEvent {
  title: string;
  date: string; // YYYY-MM-DD
  task: Task;
}

export function useCalendarEvents(currentDate: Date, viewMode: 'month' | 'week' | 'day') {
  let from: string;
  let to: string;

  if (viewMode === 'month') {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    from = formatToString(start);
    to = formatToString(end);
  } else if (viewMode === 'week') {
    from = formatToString(startOfWeek(currentDate));
    to = formatToString(endOfWeek(currentDate));
  } else {
    from = formatToString(currentDate);
    to = from;
  }

  const { data: tasks } = useTasks({
    due_date_from: from,
    due_date_to: to,
  });

  const events = useMemo(() => {
    return (tasks || [])
      .filter((t) => t.due_date)
      .map((t) => ({
        title: t.title,
        date: t.due_date!,
        task: t,
      }));
  }, [tasks]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [events]);

  return { events, eventsByDate };
}

function formatToString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
