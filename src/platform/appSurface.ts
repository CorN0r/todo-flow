export type EntryRoute = '/widget' | '/pomodoro-widget' | '/note' | '/mobile/today' | '/date/all';

export interface EntryRouteContext {
  search: string;
  userAgent: string;
}

export function isAndroidUserAgent(userAgent: string): boolean {
  return /\bAndroid\b/i.test(userAgent);
}

export function shouldUseMobileShell(context: EntryRouteContext): boolean {
  const params = new URLSearchParams(context.search);

  if (params.get('desktop') === '1') {
    return false;
  }

  if (params.get('mobile') === '1' || params.get('surface') === 'mobile') {
    return true;
  }

  return isAndroidUserAgent(context.userAgent);
}

export function getInitialEntryRoute(context: EntryRouteContext): EntryRoute {
  const params = new URLSearchParams(context.search);

  if (params.has('widget')) {
    return '/widget';
  }

  if (params.has('pomodoro')) {
    return '/pomodoro-widget';
  }

  if (params.has('note')) {
    return '/note';
  }

  if (shouldUseMobileShell(context)) {
    return '/mobile/today';
  }

  return '/date/all';
}

export function getBrowserInitialEntryRoute(): EntryRoute {
  return getInitialEntryRoute({
    search: window.location.search,
    userAgent: navigator.userAgent,
  });
}
