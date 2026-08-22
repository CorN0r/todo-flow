import { useEffect, Suspense, lazy } from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { listen } from '@tauri-apps/api/event';
import './i18n';
import { useLanguage } from './i18n/useLanguage';
import { invalidateTasks, invalidateTags, invalidateHabits, invalidateDashboardStats, invalidateTaskNotes } from './lib/queryKeys';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { TaskDetailPanel } from './components/layout/TaskDetailPanel';
import { TodayPage } from './pages/TodayPage';
import { WidgetPage } from './pages/WidgetPage';
import { PomodoroWidgetPage } from './pages/PomodoroWidgetPage';
import { NotePage } from './pages/NotePage';
import { CommandPalette } from './components/shared/CommandPalette';
import { BulkActionBar } from './components/shared/BulkActionBar';
import { OnboardingOverlay } from './components/shared/OnboardingOverlay';
import { MobileApp } from './mobile/MobileApp';
import { Loader2 } from 'lucide-react';
import { usePomodoroSync } from './hooks/usePomodoroSync';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useUIStore } from './stores/uiStore';
import { usePomodoroStore } from './stores/pomodoroStore';
import { useShortcutStore } from './stores/shortcutStore';
import { getBrowserInitialEntryRoute } from './platform/appSurface';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// 非首屏路由懒加载，减小入口 bundle
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const TagPage = lazy(() => import('./pages/TagPage').then((m) => ({ default: m.TagPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const DateFilterPage = lazy(() => import('./pages/DateFilterPage').then((m) => ({ default: m.DateFilterPage })));
const MyDayPage = lazy(() => import('./pages/MyDayPage').then((m) => ({ default: m.MyDayPage })));
const MatrixPage = lazy(() => import('./pages/MatrixPage').then((m) => ({ default: m.MatrixPage })));
const KanbanPage = lazy(() => import('./pages/KanbanPage').then((m) => ({ default: m.KanbanPage })));
const HabitPage = lazy(() => import('./pages/HabitPage').then((m) => ({ default: m.HabitPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FocusStatsPage = lazy(() => import('./pages/FocusStatsPage').then((m) => ({ default: m.FocusStatsPage })));
const PomodoroFullscreen = lazy(() => import('./components/shared/PomodoroFullscreen').then((m) => ({ default: m.PomodoroFullscreen })));

function PomodoroSync() {
  usePomodoroSync();
  return null;
}

function AppLayout() {
  useTheme();

  return (
    <Routes>
      <Route path="/widget" element={<WidgetPage />} />
      <Route path="/pomodoro-widget" element={<PomodoroWidgetPage />} />
      <Route path="/note" element={<NotePage />} />
      <Route path="/mobile/*" element={<MobileApp />} />
      <Route path="*" element={<MainLayout />} />
    </Routes>
  );
}

function MainLayout() {
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const isWarm = theme === 'warm';
  const setShowQuickAdd = useUIStore((s) => s.setShowQuickAdd);
  const navigate = useNavigate();

  useKeyboardShortcuts({
    onNewTask: () => setShowQuickAdd(true),
    onPomodoroStart: () => {
      const store = usePomodoroStore.getState();
      if (!store.sessionStartTime) {
        const selectedId = useUIStore.getState().selectedTaskId;
        store.startTimer(selectedId, selectedId ? '' : '番茄钟');
      }
    },
  });

  useEffect(() => {
    let unlisten1: (() => void) | null = null;
    let unlisten2: (() => void) | null = null;
    let unlisten3: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const u1 = await listen<{ task_id: string; title: string }>('reminder-triggered', (event) => {
        toast(event.payload.title, {
          description: '提醒时间到',
          duration: 10000,
          icon: (
            <div className="w-8 h-8 rounded-full bg-[#7C72F6]/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C72F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
          ),
        });
      });
      const u2 = await listen('task-changed', () => {
        invalidateTasks(queryClient);
        invalidateTags(queryClient);
        invalidateHabits(queryClient);
        invalidateDashboardStats(queryClient);
      });
      // 便签行增删/置顶/皮肤/折叠变更时即时刷新(如系统方式销毁便签、其它窗口改动)
      const u3 = await listen('task-notes-changed', () => {
        invalidateTaskNotes(queryClient);
      });
      if (cancelled) {
        u1();
        u2();
        u3();
        return;
      }
      unlisten1 = u1;
      unlisten2 = u2;
      unlisten3 = u3;
    })();

    return () => {
      cancelled = true;
      unlisten1?.();
      unlisten2?.();
      unlisten3?.();
    };
  }, []);


  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const u = await listen('navigate-to-settings', () => {
        navigate('/settings');
      });
      if (cancelled) { u(); return; }
      unlisten = u;
    })();
    return () => { cancelled = true; unlisten?.(); };
  }, [navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-[#1e1e32] text-[#111827] dark:text-white/90 relative" onContextMenu={(e) => e.preventDefault()}>
      {/* Glass theme background gradient */}
      {isGlass && (
        <>
          <div className="fixed inset-0 z-[-1] pointer-events-none"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 30%, #0f3460 60%, #1a1a2e 100%)',
            }}
          />
          <div className="fixed inset-0 z-[-1] pointer-events-none opacity-30"
            style={{
              background: 'radial-gradient(ellipse at 20% 50%, rgba(124,114,246,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(167,139,250,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(99,102,241,0.08) 0%, transparent 50%)',
            }}
          />
        </>
      )}
      {/* Warm theme background gradient */}
      {isWarm && (
        <div className="fixed inset-0 z-[-1] pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, #161514 0%, #1c1a17 40%, #22201c 100%)',
          }}
        />
      )}
      <div className="flex h-full w-full">
        <ErrorBoundary>
          <Sidebar />
        </ErrorBoundary>
        <div className="flex flex-1 flex-col min-w-0">
          <ErrorBoundary>
            <Header />
          </ErrorBoundary>
          <main className={`flex-1 min-h-0 ${isGlass ? 'bg-transparent' : 'bg-white dark:bg-[#1e1e32]'}`}
            style={{ padding: '16px 24px 0 24px' }}>
            <div className="h-full overflow-y-auto">
            <ErrorBoundary>
              <Suspense fallback={
                <div className="h-full flex items-center justify-center text-[#7C72F6]">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              }>
                <Routes>
                  <Route path="/" element={<TodayPage />} />
                  <Route path="/calendar/*" element={<CalendarPage />} />
                  <Route path="/myday" element={<MyDayPage />} />
                  <Route path="/date/:filter" element={<DateFilterPage />} />
                  <Route path="/tag/:tagId" element={<TagPage />} />

                  <Route path="/matrix" element={<MatrixPage />} />
                  <Route path="/kanban" element={<KanbanPage />} />
                  <Route path="/habits" element={<HabitPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/pomodoro" element={<PomodoroFullscreen />} />
                  <Route path="/focus-stats" element={<FocusStatsPage />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
            </div>
          </main>
        </div>
        <TaskDetailPanel />
        <ErrorBoundary><CommandPalette /></ErrorBoundary>
        <ErrorBoundary><BulkActionBar /></ErrorBoundary>
        <ErrorBoundary><OnboardingOverlay /></ErrorBoundary>
      </div>
      <PomodoroSync />
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

function App() {
  const { loadSavedLanguage } = useLanguage();
  useEffect(() => { loadSavedLanguage(); }, [loadSavedLanguage]);

  // 在应用启动时加载快捷键配置
  const loadShortcuts = useShortcutStore((s) => s.load);
  useEffect(() => { loadShortcuts(); }, [loadShortcuts]);

  return (
    <MemoryRouter initialEntries={[getBrowserInitialEntryRoute()]}>
      <QueryClientProvider client={queryClient}>
        <AppLayout />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

export default App;
