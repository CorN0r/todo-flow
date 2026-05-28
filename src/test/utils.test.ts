import { describe, it, expect } from 'vitest';
import { cn } from '../lib/cn';
import { isToday, isOverdue, formatDate, startOfWeek, addDays } from '../lib/date';

describe('cn() classname utility', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('filters falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isInactive = false;
    expect(cn('base', isActive && 'active', isInactive && 'inactive')).toBe('base active');
  });
});

describe('date utilities', () => {
  it('isToday returns true for today', () => {
    expect(isToday(new Date())).toBe(true);
  });

  it('isToday returns false for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isToday(yesterday)).toBe(false);
  });

  it('isOverdue returns true for past dates', () => {
    expect(isOverdue('2020-01-01')).toBe(true);
  });

  it('isOverdue returns false for future dates', () => {
    expect(isOverdue('2027-06-15')).toBe(false);
  });

  it('isOverdue returns false for null', () => {
    expect(isOverdue(null)).toBe(false);
  });

  it('formatDate formats as short date', () => {
    const result = formatDate('2026-01-15');
    expect(result).toContain('Jan');
  });

  it('startOfWeek returns Sunday by default', () => {
    // May 25, 2026 is a Monday, so startOfWeek should be Sunday May 24
    const result = startOfWeek(new Date(2026, 4, 25));
    expect(result.getDay()).toBe(0); // Sunday
    expect(result.getDate()).toBe(24);
  });

  it('addDays adds correctly', () => {
    const start = new Date(2026, 0, 1);
    const result = addDays(start, 5);
    expect(result.getDate()).toBe(6);
  });
});
