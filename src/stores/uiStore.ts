import { create } from 'zustand';
import type { SortMode } from '../components/shared/PageTitle';
import type { PlannedRange } from '../lib/dateRanges';
import type { TaskStatusFilter } from '../lib/taskStatusFilter';

type Theme = 'light' | 'dark' | 'system' | 'glass' | 'warm' | 'lumina';

// 地址只表达“看哪一批任务”,视图是这一份全局状态:选了看板,换到别的范围也还是看板
export type TaskViewMode = 'list' | 'wall' | 'unified' | 'kanban' | 'matrix';
const TASK_VIEW_MODES: readonly TaskViewMode[] = ['list', 'wall', 'unified', 'kanban', 'matrix'];

export function parseTaskViewMode(value: string | null): TaskViewMode {
  return TASK_VIEW_MODES.includes(value as TaskViewMode) ? (value as TaskViewMode) : 'list';
}

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

  taskStatusFilter: TaskStatusFilter;
  setTaskStatusFilter: (filter: TaskStatusFilter) => void;

  // 侧边栏“计划”指向的范围:只在本次会话内记住,重启后回到默认
  lastPlannedRange: PlannedRange;
  setLastPlannedRange: (range: PlannedRange) => void;

  taskViewMode: TaskViewMode;
  setTaskViewMode: (mode: TaskViewMode) => void;

  globalSubtasksExpanded: boolean;
  toggleGlobalSubtasksExpanded: () => void;

  showQuickAdd: boolean;
  setShowQuickAdd: (show: boolean) => void;

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

export const useUIStore = create<UIState>((set, get) => ({
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

  theme: (localStorage.getItem('theme') as Theme) || 'system',
  setTheme: (theme) => { localStorage.setItem('theme', theme); set({ theme, resolvedTheme: getResolvedTheme(theme) }); },
  resolvedTheme: getResolvedTheme((localStorage.getItem('theme') as Theme) || 'system'),

  sortMode: 'manual',
  setSortMode: (sortMode) => set({ sortMode }),

  taskStatusFilter: 'all',
  setTaskStatusFilter: (taskStatusFilter) => set({ taskStatusFilter }),

  lastPlannedRange: 'this-week',
  setLastPlannedRange: (lastPlannedRange) => set({ lastPlannedRange }),

  taskViewMode: parseTaskViewMode(localStorage.getItem('taskViewMode')),
  setTaskViewMode: (taskViewMode) => {
    // 一体式在右侧分栏里显示任务,不开侧边详情;离开时清掉选中,免得详情面板突然弹出
    if (get().taskViewMode === 'unified' && taskViewMode !== 'unified') get().setSelectedTaskId(null);
    // 看板与四象限没有批量选择
    if (taskViewMode === 'kanban' || taskViewMode === 'matrix') get().exitSelectionMode();
    localStorage.setItem('taskViewMode', taskViewMode);
    set({ taskViewMode });
  },

  globalSubtasksExpanded: false,
  toggleGlobalSubtasksExpanded: () => set((s) => ({ globalSubtasksExpanded: !s.globalSubtasksExpanded })),

  showQuickAdd: false,
  setShowQuickAdd: (show) => set({ showQuickAdd: show }),

  selectionMode: false,
  selectedTaskIds: new Set<string>(),
  selectableIds: [] as string[],
  setSelectableIds: (selectableIds) => set((state) => {
    const visibleIds = new Set(selectableIds);
    const selectedTaskIds = new Set([...state.selectedTaskIds].filter((id) => visibleIds.has(id)));
    return { selectableIds, selectedTaskIds };
  }),
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
