import { create } from 'zustand';
import { addMonths, addWeeks, addDays, startOfMonth, format } from '../lib/date';

export type ViewMode = 'month' | 'week' | 'day';

interface CalendarState {
  currentDate: Date;
  viewMode: ViewMode;
  setCurrentDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  goNext: () => void;
  goPrev: () => void;
  goToday: () => void;
  currentMonthKey: string; // YYYY-MM format for query cache
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  currentDate: new Date(),
  viewMode: 'month',
  setCurrentDate: (date) =>
    set({ currentDate: date, currentMonthKey: format(startOfMonth(date), 'yyyy-MM') }),
  setViewMode: (mode) => set({ viewMode: mode }),

  goNext: () => {
    const { currentDate, viewMode } = get();
    const next =
      viewMode === 'month'
        ? addMonths(currentDate, 1)
        : viewMode === 'week'
          ? addWeeks(currentDate, 1)
          : addDays(currentDate, 1);
    set({ currentDate: next, currentMonthKey: format(startOfMonth(next), 'yyyy-MM') });
  },

  goPrev: () => {
    const { currentDate, viewMode } = get();
    const prev =
      viewMode === 'month'
        ? addMonths(currentDate, -1)
        : viewMode === 'week'
          ? addWeeks(currentDate, -1)
          : addDays(currentDate, -1);
    set({ currentDate: prev, currentMonthKey: format(startOfMonth(prev), 'yyyy-MM') });
  },

  goToday: () => {
    const today = new Date();
    set({ currentDate: today, currentMonthKey: format(startOfMonth(today), 'yyyy-MM') });
  },

  currentMonthKey: format(startOfMonth(new Date()), 'yyyy-MM'),
}));
