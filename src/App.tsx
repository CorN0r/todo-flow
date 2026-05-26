import { useEffect } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { listen } from '@tauri-apps/api/event';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { TaskDetailPanel } from './components/layout/TaskDetailPanel';
import { TodayPage } from './pages/TodayPage';
import { CalendarPage } from './pages/CalendarPage';
import { ListPage } from './pages/ListPage';
import { SettingsPage } from './pages/SettingsPage';
import { DateFilterPage } from './pages/DateFilterPage';
import { MyDayPage } from './pages/MyDayPage';
import { TagPage } from './pages/TagPage';
import { SearchPage } from './pages/SearchPage';
import { DashboardPage } from './pages/DashboardPage';
import { WidgetPage } from './pages/WidgetPage';
import { CommandPalette } from './components/shared/CommandPalette';
import { BulkActionBar } from './components/shared/BulkActionBar';
import { OnboardingOverlay } from './components/shared/OnboardingOverlay';
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
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);

  useKeyboardShortcuts({
    onNewTask: () => createTask.mutate({ title: 'New task' }),
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
    const setup = async () => {
      const unlisten1 = await listen('global-shortcut-new-task', () => {
        createTask.mutate({ title: 'New task' });
      });
      const unlisten2 = await listen<{ task_id: string; title: string }>('reminder-triggered', (event) => {
        toast(event.payload.title, {
          description: 'Reminder due',
          duration: 8000,
        });
      });
      return () => { unlisten1(); unlisten2(); };
    };
    const cleanup = setup();
    return () => {
      cleanup.then((fn) => fn());
    };
  }, [createTask]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/calendar/*" element={<CalendarPage />} />
            <Route path="/myday" element={<MyDayPage />} />
            <Route path="/date/:filter" element={<DateFilterPage />} />
            <Route path="/list/:listId" element={<ListPage />} />
            <Route path="/tag/:tagId" element={<TagPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
      <TaskDetailPanel />
      <CommandPalette />
      <BulkActionBar />
      <OnboardingOverlay />
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

function App() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <QueryClientProvider client={queryClient}>
        <AppLayout />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

export default App;
