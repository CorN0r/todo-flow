import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { getSetting, setSetting } from '../lib/db';
import type { ShortcutMap, Conflict } from '../types/shortcuts';
import { getDefaultShortcutMap, detectConflicts, validateShortcutKeys, SHORTCUT_DEFS } from '../types/shortcuts';

interface ShortcutStore {
  shortcutMap: ShortcutMap;
  conflicts: Conflict[];
  isLoaded: boolean;

  load: () => Promise<void>;
  updateShortcut: (id: string, keys: string) => Promise<{ success: boolean; error?: string }>;
  toggleShortcut: (id: string, enabled: boolean) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  clearConflicts: () => void;
}

async function persistShortcuts(map: ShortcutMap) {
  const json = JSON.stringify(map);
  await setSetting('keyboard_shortcuts', json);

  // 若有全局快捷键变更，同步通知 Rust 后端
  const hasGlobal = SHORTCUT_DEFS.some((d) => d.scope === 'rust');
  if (hasGlobal) {
    try {
      await invoke('update_global_shortcuts', { shortcutsJson: json });
    } catch {
      // Rust 后端可能未启动（纯前端调试模式），忽略错误
    }
  }
}

export const useShortcutStore = create<ShortcutStore>((set, get) => ({
  shortcutMap: getDefaultShortcutMap(),
  conflicts: [],
  isLoaded: false,

  load: async () => {
    try {
      const raw = await getSetting('keyboard_shortcuts');
      if (raw) {
        const parsed = JSON.parse(raw) as ShortcutMap;
        // 合并：以默认值为基线，用户自定义覆盖
        const merged = { ...getDefaultShortcutMap(), ...parsed };
        set({
          shortcutMap: merged,
          conflicts: detectConflicts(merged),
          isLoaded: true,
        });
      } else {
        // 首次使用，写入默认值
        await persistShortcuts(getDefaultShortcutMap());
        set({ isLoaded: true });
      }
    } catch {
      // 解析失败则使用默认值
      set({ isLoaded: true });
    }
  },

  updateShortcut: async (id, keys) => {
    const state = get();
    const validationError = validateShortcutKeys(id, keys);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const next: ShortcutMap = { ...state.shortcutMap, [id]: { ...state.shortcutMap[id], keys } };
    const conflicts = detectConflicts(next);
    if (conflicts.length > 0) {
      set({ conflicts });
      return { success: false, error: '快捷键冲突' };
    }

    try {
      await persistShortcuts(next);
      set({ shortcutMap: next, conflicts: [] });
      return { success: true };
    } catch (e) {
      return { success: false, error: `保存失败: ${e}` };
    }
  },

  toggleShortcut: async (id, enabled) => {
    const state = get();
    const next: ShortcutMap = { ...state.shortcutMap, [id]: { ...state.shortcutMap[id], enabled } };
    await persistShortcuts(next);
    set({ shortcutMap: next });
  },

  resetToDefaults: async () => {
    const defaults = getDefaultShortcutMap();
    try {
      await persistShortcuts(defaults);
      set({ shortcutMap: defaults, conflicts: [] });
    } catch {
      // 静默失败
    }
  },

  clearConflicts: () => set({ conflicts: [] }),
}));
