import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Selected task
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;

  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

function getResolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),

  theme: 'system',
  setTheme: (theme) => set({ theme, resolvedTheme: getResolvedTheme(theme) }),
  resolvedTheme: 'light',
}));
