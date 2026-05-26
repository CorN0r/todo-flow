import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCalendarStore } from '../../stores/calendarStore';

beforeEach(() => {
  vi.useRealTimers();
  useCalendarStore.setState({
    currentDate: new Date('2026-06-15T12:00:00Z'),
    viewMode: 'month',
    currentMonthKey: '2026-06',
  });
});

describe('calendarStore', () => {
  describe('initial state', () => {
    it('has default values', () => {
      const state = useCalendarStore.getState();
      expect(state.currentDate).toBeInstanceOf(Date);
      expect(state.viewMode).toBe('month');
    });
  });

  describe('setCurrentDate', () => {
    it('updates currentDate and monthKey', () => {
      const d = new Date('2026-08-01T12:00:00Z');
      useCalendarStore.getState().setCurrentDate(d);
      const state = useCalendarStore.getState();
      expect(state.currentDate.toISOString()).toBe(d.toISOString());
      expect(state.currentMonthKey).toBe('2026-08');
    });
  });

  describe('setViewMode', () => {
    it('changes view mode', () => {
      useCalendarStore.getState().setViewMode('week');
      expect(useCalendarStore.getState().viewMode).toBe('week');
      useCalendarStore.getState().setViewMode('day');
      expect(useCalendarStore.getState().viewMode).toBe('day');
    });
  });

  describe('goNext', () => {
    it('advances by one month in month view', () => {
      useCalendarStore.getState().goNext();
      const state = useCalendarStore.getState();
      expect(state.currentMonthKey).toBe('2026-07');
      expect(state.currentDate.getMonth()).toBe(6); // July (0-indexed)
    });

    it('advances by one week in week view', () => {
      useCalendarStore.getState().setViewMode('week');
      const before = useCalendarStore.getState().currentDate.getTime();
      useCalendarStore.getState().goNext();
      const after = useCalendarStore.getState().currentDate.getTime();
      expect(after - before).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('advances by one day in day view', () => {
      useCalendarStore.getState().setViewMode('day');
      const before = useCalendarStore.getState().currentDate.getTime();
      useCalendarStore.getState().goNext();
      const after = useCalendarStore.getState().currentDate.getTime();
      expect(after - before).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('goPrev', () => {
    it('goes back by one month in month view', () => {
      useCalendarStore.getState().goPrev();
      const state = useCalendarStore.getState();
      expect(state.currentMonthKey).toBe('2026-05');
    });

    it('goes back by one week in week view', () => {
      useCalendarStore.getState().setViewMode('week');
      const before = useCalendarStore.getState().currentDate.getTime();
      useCalendarStore.getState().goPrev();
      const after = useCalendarStore.getState().currentDate.getTime();
      expect(before - after).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('goes back by one day in day view', () => {
      useCalendarStore.getState().setViewMode('day');
      const before = useCalendarStore.getState().currentDate.getTime();
      useCalendarStore.getState().goPrev();
      const after = useCalendarStore.getState().currentDate.getTime();
      expect(before - after).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('goToday', () => {
    it('resets to current date', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
      useCalendarStore.getState().goToday();
      const state = useCalendarStore.getState();
      expect(state.currentMonthKey).toBe('2026-10');
      vi.useRealTimers();
    });
  });

  describe('currentMonthKey', () => {
    it('updates when navigating months', () => {
      useCalendarStore.getState().goNext(); // June → July
      expect(useCalendarStore.getState().currentMonthKey).toBe('2026-07');
      useCalendarStore.getState().goPrev(); // July → June
      expect(useCalendarStore.getState().currentMonthKey).toBe('2026-06');
    });
  });
});
