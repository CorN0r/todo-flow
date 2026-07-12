import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';
import { useUIStore } from '../stores/uiStore';
import { MobileBottomNavigation } from './components/MobileNavigation';
import { MobileFab } from './components/MobilePrimitives';
import { MobileQuickAddSheet } from './components/MobileQuickAddSheet';
import { MobileCalendarPage } from './pages/MobileCalendarPage';
import { MobileFocusPage } from './pages/MobileFocusPage';
import { MobileHabitsPage } from './pages/MobileHabitsPage';
import { MobileSettingsPage } from './pages/MobileSettingsPage';
import { MobileTasksPage, MobileTodayPage } from './pages/MobileTaskPages';
import { mobileThemeStyle, resolveMobileTheme } from './tokens';

function getQuickAddDefaults(pathname: string) {
  if (pathname.includes('/mobile/today')) {
    return { defaultDue: 'today' as const, defaultMyDay: true };
  }
  return { defaultDue: 'none' as const, defaultMyDay: false };
}

export function MobileApp() {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const location = useLocation();
  const theme = useUIStore((state) => state.theme);
  const resolvedTheme = useUIStore((state) => state.resolvedTheme);
  const mobileTheme = resolveMobileTheme(theme, resolvedTheme);
  const quickAddDefaults = useMemo(() => getQuickAddDefaults(location.pathname), [location.pathname]);

  return (
    <div
      className="min-h-dvh overflow-hidden bg-[var(--mobile-color-bg)] text-[var(--mobile-color-text)]"
      data-app-surface="mobile"
      data-mobile-theme={mobileTheme}
      style={mobileThemeStyle(mobileTheme)}
    >
      <ErrorBoundary>
        <main className="flex min-h-dvh flex-col">
          <Routes>
            <Route index element={<Navigate to="today" replace />} />
            <Route path="today" element={<MobileTodayPage />} />
            <Route path="tasks" element={<MobileTasksPage />} />
            <Route path="calendar" element={<MobileCalendarPage />} />
            <Route path="habits" element={<MobileHabitsPage />} />
            <Route path="focus" element={<MobileFocusPage />} />
            <Route path="settings" element={<MobileSettingsPage />} />
            <Route path="*" element={<Navigate to="today" replace />} />
          </Routes>
        </main>
        <MobileFab label="新增任务" icon={Plus} onClick={() => setQuickAddOpen(true)} />
        <MobileQuickAddSheet
          open={quickAddOpen}
          onClose={() => setQuickAddOpen(false)}
          defaultDue={quickAddDefaults.defaultDue}
          defaultMyDay={quickAddDefaults.defaultMyDay}
        />
        <MobileBottomNavigation />
        <Toaster position="top-center" richColors />
      </ErrorBoundary>
    </div>
  );
}
