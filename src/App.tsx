import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { TaskDetailPanel } from './components/layout/TaskDetailPanel';
import { TodayPage } from './pages/TodayPage';
import { CalendarPage } from './pages/CalendarPage';
import { ListPage } from './pages/ListPage';
import { SettingsPage } from './pages/SettingsPage';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppShell() {
  useTheme();
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/calendar/*" element={<CalendarPage />} />
            <Route path="/list/:listId" element={<ListPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
      <TaskDetailPanel />
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

function App() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

export default App;
