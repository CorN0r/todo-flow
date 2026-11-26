import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore, parseTaskViewMode } from '../../stores/uiStore';

const initialState = {
  sidebarOpen: true,
  selectedTaskId: null,
  isDetailDirty: false,
  detailSaveStatus: 'idle' as const,
  commandPaletteOpen: false,
  theme: 'system' as const,
  resolvedTheme: 'light' as const,
  taskStatusFilter: 'all' as const,
  lastPlannedRange: 'this-week' as const,
  taskViewMode: 'list' as const,
  selectionMode: false,
  selectedTaskIds: new Set<string>(),
};

beforeEach(() => {
  useUIStore.setState({ ...initialState, selectedTaskIds: new Set() });
});

describe('uiStore', () => {
  describe('sidebar', () => {
    it('starts open', () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it('toggleSidebar switches the value', () => {
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(false);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it('setSidebarOpen sets explicitly', () => {
      useUIStore.getState().setSidebarOpen(false);
      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });
  });

  describe('selectedTaskId', () => {
    it('starts null', () => {
      expect(useUIStore.getState().selectedTaskId).toBeNull();
    });

    it('setSelectedTaskId updates the id', () => {
      useUIStore.getState().setSelectedTaskId('task-1');
      expect(useUIStore.getState().selectedTaskId).toBe('task-1');
    });

    it('setSelectedTaskId can be set back to null', () => {
      useUIStore.getState().setSelectedTaskId('task-1');
      useUIStore.getState().setSelectedTaskId(null);
      expect(useUIStore.getState().selectedTaskId).toBeNull();
    });
  });

  describe('detail dirty/save', () => {
    it('isDetailDirty defaults to false', () => {
      expect(useUIStore.getState().isDetailDirty).toBe(false);
    });

    it('setIsDetailDirty toggles dirty flag', () => {
      useUIStore.getState().setIsDetailDirty(true);
      expect(useUIStore.getState().isDetailDirty).toBe(true);
    });

    it('detailSaveStatus defaults to idle', () => {
      expect(useUIStore.getState().detailSaveStatus).toBe('idle');
    });

    it('setDetailSaveStatus cycles through states', () => {
      useUIStore.getState().setDetailSaveStatus('saving');
      expect(useUIStore.getState().detailSaveStatus).toBe('saving');
      useUIStore.getState().setDetailSaveStatus('saved');
      expect(useUIStore.getState().detailSaveStatus).toBe('saved');
    });
  });

  describe('commandPalette', () => {
    it('starts closed', () => {
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it('setCommandPaletteOpen opens it', () => {
      useUIStore.getState().setCommandPaletteOpen(true);
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    });
  });

  describe('theme', () => {
    it('defaults to system', () => {
      expect(useUIStore.getState().theme).toBe('system');
    });

    it('setTheme to dark updates theme and resolvedTheme', () => {
      useUIStore.getState().setTheme('dark');
      expect(useUIStore.getState().theme).toBe('dark');
      expect(useUIStore.getState().resolvedTheme).toBe('dark');
    });

    it('setTheme to light updates theme and resolvedTheme', () => {
      useUIStore.getState().setTheme('dark');
      useUIStore.getState().setTheme('light');
      expect(useUIStore.getState().theme).toBe('light');
      expect(useUIStore.getState().resolvedTheme).toBe('light');
    });
  });

  describe('selection mode', () => {
    it('starts with no selection', () => {
      expect(useUIStore.getState().selectionMode).toBe(false);
      expect(useUIStore.getState().selectedTaskIds.size).toBe(0);
    });

    it('enterSelectionMode enables mode', () => {
      useUIStore.getState().enterSelectionMode();
      expect(useUIStore.getState().selectionMode).toBe(true);
    });

    it('enterSelectionMode with taskId adds it to selected set', () => {
      useUIStore.getState().enterSelectionMode('task-1');
      expect(useUIStore.getState().selectionMode).toBe(true);
      expect(useUIStore.getState().selectedTaskIds.has('task-1')).toBe(true);
    });

    it('exitSelectionMode clears everything', () => {
      useUIStore.getState().enterSelectionMode('task-1');
      useUIStore.getState().exitSelectionMode();
      expect(useUIStore.getState().selectionMode).toBe(false);
      expect(useUIStore.getState().selectedTaskIds.size).toBe(0);
    });

    it('toggleTaskSelection adds and removes', () => {
      useUIStore.getState().toggleTaskSelection('task-1');
      expect(useUIStore.getState().selectedTaskIds.has('task-1')).toBe(true);
      useUIStore.getState().toggleTaskSelection('task-1');
      expect(useUIStore.getState().selectedTaskIds.has('task-1')).toBe(false);
    });

    it('selectAllTasks adds all when not all selected', () => {
      useUIStore.getState().selectAllTasks(['a', 'b', 'c']);
      expect(useUIStore.getState().selectedTaskIds.size).toBe(3);
    });

    it('selectAllTasks removes all when all already selected', () => {
      useUIStore.getState().selectAllTasks(['a', 'b']);
      // calling again toggles them off
      useUIStore.getState().selectAllTasks(['a', 'b']);
      expect(useUIStore.getState().selectedTaskIds.size).toBe(0);
    });

    it('removes selected tasks that are no longer selectable', () => {
      useUIStore.getState().selectAllTasks(['a', 'b']);
      useUIStore.getState().setSelectableIds(['b', 'c']);
      expect([...useUIStore.getState().selectedTaskIds]).toEqual(['b']);
    });
  });

  describe('task status filter', () => {
    it('starts with all tasks and updates for the current session', () => {
      expect(useUIStore.getState().taskStatusFilter).toBe('all');
      useUIStore.getState().setTaskStatusFilter('suspended');
      expect(useUIStore.getState().taskStatusFilter).toBe('suspended');
    });
  });

  describe('lastPlannedRange', () => {
    it('starts with this-week and updates in memory', () => {
      expect(useUIStore.getState().lastPlannedRange).toBe('this-week');
      useUIStore.getState().setLastPlannedRange('tomorrow');
      expect(useUIStore.getState().lastPlannedRange).toBe('tomorrow');
    });
  });

  describe('taskViewMode', () => {
    it('accepts all five views and persists the choice', () => {
      for (const mode of ['list', 'wall', 'unified', 'kanban', 'matrix'] as const) {
        useUIStore.getState().setTaskViewMode(mode);
        expect(useUIStore.getState().taskViewMode).toBe(mode);
        expect(localStorage.getItem('taskViewMode')).toBe(mode);
      }
    });

    it('falls back to list for an unknown stored value', () => {
      expect(parseTaskViewMode('bogus')).toBe('list');
      expect(parseTaskViewMode(null)).toBe('list');
      expect(parseTaskViewMode('matrix')).toBe('matrix');
    });

    it('clears the selected task when leaving unified, but not while staying in it', () => {
      useUIStore.getState().setTaskViewMode('unified');
      useUIStore.getState().setSelectedTaskId('task-1');
      useUIStore.getState().setTaskViewMode('unified');
      expect(useUIStore.getState().selectedTaskId).toBe('task-1');

      useUIStore.getState().setTaskViewMode('list');
      expect(useUIStore.getState().selectedTaskId).toBeNull();
    });

    it('exits selection mode when switching to a board view', () => {
      useUIStore.getState().enterSelectionMode('task-1');
      useUIStore.getState().setTaskViewMode('kanban');
      expect(useUIStore.getState().selectionMode).toBe(false);
      expect(useUIStore.getState().selectedTaskIds.size).toBe(0);

      useUIStore.getState().enterSelectionMode('task-1');
      useUIStore.getState().setTaskViewMode('matrix');
      expect(useUIStore.getState().selectionMode).toBe(false);
    });

    it('keeps the selected task when switching between list and a board view', () => {
      useUIStore.getState().setSelectedTaskId('task-1');
      useUIStore.getState().setTaskViewMode('kanban');
      expect(useUIStore.getState().selectedTaskId).toBe('task-1');
      useUIStore.getState().setTaskViewMode('list');
      expect(useUIStore.getState().selectedTaskId).toBe('task-1');
    });
  });
});
