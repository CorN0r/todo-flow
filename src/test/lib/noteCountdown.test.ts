import { describe, expect, it } from 'vitest';
import { formatCountdown } from '../../lib/noteCountdown';

// 固定为本地时间 2026-08-09 12:00:00,避免时区影响
const NOW = new Date(2026, 7, 9, 12, 0, 0);

describe('formatCountdown', () => {
  it('returns null when due_date is missing', () => {
    expect(formatCountdown(null, NOW)).toBeNull();
    expect(formatCountdown(undefined, NOW)).toBeNull();
    expect(formatCountdown('', NOW)).toBeNull();
  });

  it('formats exactly 24h remaining as days', () => {
    expect(formatCountdown('2026-08-10 12:00', NOW)).toEqual({
      text: '还剩 1 天',
      overdue: false,
    });
  });

  it('formats less than 1 hour remaining as hours + minutes', () => {
    expect(formatCountdown('2026-08-09 12:45', NOW)).toEqual({
      text: '还剩 45 分钟',
      overdue: false,
    });
  });

  it('formats remaining time with hours and minutes under a day', () => {
    expect(formatCountdown('2026-08-09 17:30', NOW)).toEqual({
      text: '还剩 5 小时 30 分钟',
      overdue: false,
    });
  });

  it('formats overdue by days', () => {
    expect(formatCountdown('2026-08-07 09:00', NOW)).toEqual({
      text: '已逾期 2 天 3 小时',
      overdue: true,
    });
  });

  it('formats overdue by hours', () => {
    expect(formatCountdown('2026-08-09 07:30', NOW)).toEqual({
      text: '已逾期 4 小时 30 分钟',
      overdue: true,
    });
  });

  it('treats date-only due_date as end of day (23:59)', () => {
    // 当天 12:00 距 23:59:59.999 为 11 小时 59 分钟
    expect(formatCountdown('2026-08-09', NOW)).toEqual({
      text: '还剩 11 小时 59 分钟',
      overdue: false,
    });
  });

  it('treats past date-only due_date as overdue', () => {
    // 昨天 23:59:59.999 距今天 12:00 为 12 小时 0 分钟
    expect(formatCountdown('2026-08-08', NOW)).toEqual({
      text: '已逾期 12 小时 0 分钟',
      overdue: true,
    });
  });

  it('parses due_date with time via space separator', () => {
    // 恰好 23 小时 59 分钟后到期 → 仍走小时分支(不足 24h)
    expect(formatCountdown('2026-08-10 11:59', NOW)).toEqual({
      text: '还剩 23 小时 59 分钟',
      overdue: false,
    });
  });
});
