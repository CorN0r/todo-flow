import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useShortcutStore } from '../stores/shortcutStore';
import { eventToNormalizedKeys, normalizeKeys, SHORTCUT_DEFS } from '../types/shortcuts';

interface ShortcutCallbacks {
  onNewTask?: () => void;
}

/**
 * 配置驱动的全局快捷键监听 hook。
 * 从 shortcutStore 读取当前快捷键映射，构建动作查表，在 keydown 时分发。
 * 在输入框内默认跳过（Escape 和标记 applicableInInput 的除外）。
 */
export function useKeyboardShortcuts(callbacks?: ShortcutCallbacks) {
  const shortcutMap = useShortcutStore((s) => s.shortcutMap);
  const {
    setSelectedTaskId,
    selectedTaskId,
    toggleSidebar,
    setCommandPaletteOpen,
    selectionMode,
    exitSelectionMode,
  } = useUIStore();
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  /** 根据快捷键 ID 执行对应的动作 */
  const executeAction = useCallback((id: string) => {
    const cb = callbacksRef.current;
    switch (id) {
      case 'toggle-sidebar':
        toggleSidebar();
        return;
      case 'command-palette':
        setCommandPaletteOpen(true);
        return;
      case 'new-task':
        cb?.onNewTask?.();
        return;
      default:
        return;
    }
  }, [toggleSidebar, setCommandPaletteOpen]);

  /** 构建 normalizedKeys → actionId 映射表 */
  const actionMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const def of SHORTCUT_DEFS) {
      if (def.scope !== 'frontend') continue;
      const config = shortcutMap[def.id];
      if (!config || !config.enabled) continue;
      const normalized = normalizeKeys(config.keys);
      if (normalized) map.set(normalized, def.id);
    }
    return map;
  }, [shortcutMap]);

  useEffect(() => {
    // 标准文本编辑快捷键（输入框内放行，输入框外也放行避免误拦）
    const EDITING_KEYS = new Set(['c', 'C', 'v', 'V', 'x', 'X', 'a', 'A', 'z', 'Z', 'y', 'Y']);
    // 浏览器功能键（桌面应用不需要）
    const BLOCKED_FN_KEYS = new Set(['F1', 'F3', 'F5', 'F11', 'F12']);

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      // ---- 1. 屏蔽浏览器功能键 ----
      if (BLOCKED_FN_KEYS.has(e.key)) { e.preventDefault(); return; }

      // ---- 2. 屏蔽浏览器 Ctrl 快捷键（除标准编辑和配置项） ----
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        // 标准编辑快捷键仅在输入框内放行
        if (isInput && EDITING_KEYS.has(e.key)) return;
        // Tab 切换焦点放行
        if (e.key === 'Tab') return;
        // 数字键和符号键在输入框内放行
        if (isInput && /^[0-9!@#$%^&*()_\-+=[\]{}|;:'",.<>/?`~]$/.test(e.key)) return;

        // 检查是否为我们的配置项
        const combo = eventToNormalizedKeys(e);
        if (combo && actionMap.has(combo)) {
          e.preventDefault();
          executeAction(actionMap.get(combo)!);
          return;
        }
        // 其余一律屏蔽
        e.preventDefault();
        return;
      }

      // ---- 3. Alt+Left/Right 浏览器前进后退 ----
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        return;
      }

      // ---- 4. Backspace 浏览器回退（仅非输入框） ----
      if (e.key === 'Backspace' && !isInput) {
        e.preventDefault();
        return;
      }

      // ---- 5. Escape 硬编码，输入框内外均生效 ----
      if (e.key === 'Escape') {
        if (selectionMode) { e.preventDefault(); exitSelectionMode(); return; }
        if (selectedTaskId) { e.preventDefault(); setSelectedTaskId(null); return; }
        return;
      }

      // ---- 6. 输入框内跳过其他快捷键 ----
      if (isInput) return;

      // ---- 7. 单键快捷方式 ----
      const normalized = eventToNormalizedKeys(e);
      if (!normalized) return;

      const actionId = actionMap.get(normalized);
      if (actionId) {
        e.preventDefault();
        executeAction(actionId);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actionMap, executeAction, selectionMode, exitSelectionMode, selectedTaskId, setSelectedTaskId]);
}
