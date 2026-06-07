import { create } from 'zustand';
import type { SortMode } from '../components/shared/PageTitle';

type Theme = 'light' | 'dark' | 'system' | 'glass' | 'warm' | 'lumina';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;

  isDetailDirty: boolean;
  setIsDetailDirty: (dirty: boolean) => void;
  detailSaveStatus: 'idle' | 'saving' | 'saved';
  setDetailSaveStatus: (status: 'idle' | 'saving' | 'saved') => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';

  sortMode: SortMode;
  setSortMode: (mode: SortMode) => void;

  taskViewMode: 'list' | 'wall' | 'unified';
  setTaskViewMode: (mode: 'list' | 'wall' | 'unified') => void;

  globalSubtasksExpanded: boolean;
  toggleGlobalSubtasksExpanded: () => void;

  selectionMode: boolean;
  selectedTaskIds: Set<string>;
  selectableIds: string[];
  setSelectableIds: (ids: string[]) => void;
  enterSelectionMode: (taskId?: string) => void;
  exitSelectionMode: () => void;
  toggleTaskSelection: (id: string) => void;
  selectAllTasks: (ids: string[]) => void;
}

function getResolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (theme === 'glass' || theme === 'warm') return 'dark';
  if (theme === 'lumina') return 'light';
  return theme;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),

  isDetailDirty: false,
  setIsDetailDirty: (dirty) => set({ isDetailDirty: dirty }),

  detailSaveStatus: 'idle',
  setDetailSaveStatus: (status) => set({ detailSaveStatus: status }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  theme: 'system',
  setTheme: (theme) => set({ theme, resolvedTheme: getResolvedTheme(theme) }),
  resolvedTheme: 'light',

  sortMode: 'manual',
  setSortMode: (sortMode) => set({ sortMode }),

  taskViewMode: (localStorage.getItem('taskViewMode') as 'list' | 'wall' | 'unified') || 'list',
  setTaskViewMode: (taskViewMode) => { localStorage.setItem('taskViewMode', taskViewMode); set({ taskViewMode }); },

  globalSubtasksExpanded: false,
  toggleGlobalSubtasksExpanded: () => set((s) => ({ globalSubtasksExpanded: !s.globalSubtasksExpanded })),

  selectionMode: false,
  selectedTaskIds: new Set<string>(),
  selectableIds: [] as string[],
  setSelectableIds: (selectableIds) => set({ selectableIds }),
  enterSelectionMode: (taskId) => set((s) => {
    const next = new Set(s.selectedTaskIds);
    if (taskId) next.add(taskId);
    return { selectionMode: true, selectedTaskIds: next };
  }),
  exitSelectionMode: () => set({ selectionMode: false, selectedTaskIds: new Set() }),
  toggleTaskSelection: (id) => set((s) => {
    const next = new Set(s.selectedTaskIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return { selectedTaskIds: next };
  }),
  selectAllTasks: (ids) => set((s) => {
    const next = new Set(s.selectedTaskIds);
    const allSelected = ids.every((id) => next.has(id));
    if (allSelected) {
      ids.forEach((id) => next.delete(id));
    } else {
      ids.forEach((id) => next.add(id));
    }
    return { selectedTaskIds: next };
  }),
}));
