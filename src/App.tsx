import { useEffect, useRef } from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { listen } from '@tauri-apps/api/event';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { TaskDetailPanel } from './components/layout/TaskDetailPanel';
import { TodayPage } from './pages/TodayPage';
import { CalendarPage } from './pages/CalendarPage';
import { TagPage } from './pages/TagPage';
import { SettingsPage } from './pages/SettingsPage';
import { DateFilterPage } from './pages/DateFilterPage';
import { MyDayPage } from './pages/MyDayPage';

import { MatrixPage } from './pages/MatrixPage';
import { KanbanPage } from './pages/KanbanPage';
import { HabitPage } from './pages/HabitPage';
import { SearchPage } from './pages/SearchPage';
import { DashboardPage } from './pages/DashboardPage';
import { WidgetPage } from './pages/WidgetPage';
import { CommandPalette } from './components/shared/CommandPalette';
import { BulkActionBar } from './components/shared/BulkActionBar';
import { OnboardingOverlay } from './components/shared/OnboardingOverlay';
import { PomodoroTimer } from './components/shared/PomodoroTimer';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useCreateTask, useUpdateTask, useDeleteTask } from './hooks/useTasks';
import { useUIStore } from './stores/uiStore';
import { todayISO } from './lib/date';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppLayout() {
  useTheme();

  return (
    <Routes>
      <Route path="/widget" element={<WidgetPage />} />
      <Route path="*" element={<MainLayout />} />
    </Routes>
  );
}

function MainLayout() {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTaskRef = useRef(createTask);
  useEffect(() => { createTaskRef.current = createTask; });

  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const navigate = useNavigate();

  useKeyboardShortcuts({
    onNewTask: () => createTaskRef.current.mutate({ title: 'New task', due_date: todayISO() }),
    onToggleComplete: () => {
      if (selectedTaskId) updateTask.mutate({ id: selectedTaskId, is_completed: true });
    },
    onDeleteTask: () => {
      if (selectedTaskId) {
        deleteTask.mutate(selectedTaskId);
        setSelectedTaskId(null);
      }
    },
    onToggleMyDay: () => {
      if (selectedTaskId) updateTask.mutate({ id: selectedTaskId, my_day_date: todayISO() });
    },
  });

  useEffect(() => {
    let unlisten1: (() => void) | null = null;
    let unlisten2: (() => void) | null = null;
    let unlisten3: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const u1 = await listen('global-shortcut-new-task', () => {
        createTaskRef.current.mutate({ title: 'New task', due_date: todayISO() });
      });
      const u2 = await listen<{ task_id: string; title: string }>('reminder-triggered', (event) => {
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
      const u3 = await listen('task-changed', () => {
        queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' });
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
            </Routes>
            </ErrorBoundary>
            </div>
          </main>
        </div>
        <TaskDetailPanel />
        <ErrorBoundary><CommandPalette /></ErrorBoundary>
        <ErrorBoundary><BulkActionBar /></ErrorBoundary>
        <ErrorBoundary><OnboardingOverlay /></ErrorBoundary>
        <PomodoroTimer />
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

function App() {
  return (
    <MemoryRouter initialEntries={[new URLSearchParams(window.location.search).has('widget') ? '/widget' : '/date/all']}>
      <QueryClientProvider client={queryClient}>
        <AppLayout />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

export default App;
