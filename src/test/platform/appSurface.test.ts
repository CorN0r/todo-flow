import { describe, expect, it } from 'vitest';
import { getInitialEntryRoute, shouldUseMobileShell } from '../../platform/appSurface';

describe('app surface routing', () => {
  it('keeps widget and pomodoro routes ahead of platform routing', () => {
    expect(getInitialEntryRoute({ search: '?widget=1', userAgent: 'Android' })).toBe('/widget');
    expect(getInitialEntryRoute({ search: '?pomodoro=1', userAgent: 'Android' })).toBe('/pomodoro-widget');
  });

  it('selects the mobile entry on Android', () => {
    expect(getInitialEntryRoute({
      search: '',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7)',
    })).toBe('/mobile/today');
  });

  it('keeps the desktop default route for non-Android startup', () => {
    expect(getInitialEntryRoute({
      search: '',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    })).toBe('/date/all');
  });

  it('allows explicit mobile and desktop overrides for local verification', () => {
    expect(shouldUseMobileShell({ search: '?mobile=1', userAgent: 'Windows' })).toBe(true);
    expect(shouldUseMobileShell({ search: '?surface=mobile', userAgent: 'Windows' })).toBe(true);
    expect(shouldUseMobileShell({ search: '?desktop=1', userAgent: 'Android' })).toBe(false);
  });
});
