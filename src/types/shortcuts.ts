export interface ShortcutConfig {
  keys: string;
  enabled: boolean;
}

export interface ShortcutMap {
  [id: string]: ShortcutConfig;
}

export interface ShortcutDef {
  id: string;
  label: string;
  category: 'global' | 'navigation' | 'task' | 'view';
  scope: 'rust' | 'frontend';
  /** 快捷键是否在输入框内也生效（默认 false，仅 Escape 例外） */
  applicableInInput?: boolean;
}

export interface Conflict {
  keys: string;
  ids: string[];
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  // 全局快捷键
  { id: 'global-show-window', label: '显示/隐藏窗口', category: 'global', scope: 'rust' },

  // 视图
  { id: 'command-palette', label: '命令面板', category: 'view', scope: 'frontend' },
  { id: 'toggle-sidebar', label: '切换侧栏', category: 'view', scope: 'frontend' },

  // 任务操作
  { id: 'new-task', label: '快速添加任务', category: 'task', scope: 'frontend' },
  { id: 'pomodoro-toggle', label: '启动番茄钟', category: 'task', scope: 'frontend' },

];

export function getDefaultShortcutMap(): ShortcutMap {
  const defaults: Record<string, string> = {
    'global-show-window': 'Ctrl+Shift+T',
    'command-palette': 'Ctrl+K',
    'toggle-sidebar': 'Ctrl+B',
    'new-task': 'N',
    'pomodoro-toggle': 'Ctrl+Shift+P',
  };
  const map: ShortcutMap = {};
  for (const [id, keys] of Object.entries(defaults)) {
    map[id] = { keys, enabled: true };
  }
  return map;
}

const SORT_ORDER: Record<string, number> = {
  'global-show-window': 0,
  'command-palette': 1,
  'toggle-sidebar': 2,
  'new-task': 3,
  'pomodoro-toggle': 4,
};

export function getShortcutDefsSorted(): ShortcutDef[] {
  return [...SHORTCUT_DEFS].sort(
    (a, b) => (SORT_ORDER[a.id] ?? 99) - (SORT_ORDER[b.id] ?? 99)
  );
}

const KEY_REMAP: Record<string, string> = {
  control: 'Ctrl',
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  meta: 'Super',
  super: 'Super',
  cmd: 'Super',
  win: 'Super',
  escape: 'Escape',
  esc: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  delete: 'Delete',
  del: 'Delete',
  backspace: 'Backspace',
  tab: 'Tab',
  ' ': 'Space',
  space: 'Space',
  spacebar: 'Space',
  arrowup: 'ArrowUp',
  up: 'ArrowUp',
  arrowdown: 'ArrowDown',
  down: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  left: 'ArrowLeft',
  arrowright: 'ArrowRight',
  right: 'ArrowRight',
};

const VALID_MODIFIERS = new Set(['Ctrl', 'Shift', 'Alt', 'Super']);

export function normalizeKeys(raw: string): string {
  const parts = raw.split('+').map((s) => {
    const key = s.trim();
    const lower = key.toLowerCase();
    return KEY_REMAP[lower] || (lower.length === 1 ? lower.toUpperCase() : key);
  });
  // 排序保证一致性：修饰键在前，主键在后
  const mods = parts.filter((p) => VALID_MODIFIERS.has(p)).sort();
  const keys = parts.filter((p) => !VALID_MODIFIERS.has(p));
  return [...mods, ...keys].join('+');
}

export function eventToNormalizedKeys(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Super');

  const raw = e.key;
  const lower = raw.toLowerCase();
  // 跳过纯修饰键按下（仅记录其作为修饰符的存在）
  if (VALID_MODIFIERS.has(KEY_REMAP[lower] || '')) return '';
  // 跳过多余的 Event 属性比如 "Control"
  if (lower === 'control' || lower === 'shift' || lower === 'alt' || lower === 'meta') return '';

  const keyName = KEY_REMAP[lower] || (lower.length === 1 ? lower.toUpperCase() : raw);
  parts.push(keyName);
  return parts.join('+');
}

/** 将规范化键串转为人可读的展示格式 */
export function getShortcutDisplay(keys: string): string {
  const parts = keys.split('+');
  return parts
    .map((p) => {
      if (p.length === 1 && /[A-Z]/.test(p)) return p;
      if (p === 'Ctrl') return 'Ctrl';
      if (p === 'Super') return 'Win';
      return p;
    })
    .join('+');
}

export function detectConflicts(map: ShortcutMap): Conflict[] {
  const byKeys: Record<string, string[]> = {};
  for (const [id, config] of Object.entries(map)) {
    if (!config.enabled) continue;
    const normalized = normalizeKeys(config.keys);
    if (!byKeys[normalized]) byKeys[normalized] = [];
    byKeys[normalized].push(id);
  }
  const conflicts: Conflict[] = [];
  for (const [keys, ids] of Object.entries(byKeys)) {
    if (ids.length >= 2) {
      // Escape 允许多重绑定
      if (ids.every((id) => id === 'escape')) continue;
      conflicts.push({ keys, ids });
    }
  }
  return conflicts;
}

/** 校验单条快捷键的合法性 */
export function validateShortcutKeys(id: string, keys: string): string | null {
  if (!keys.trim()) return '快捷键不能为空';

  const normalized = normalizeKeys(keys);
  const parts = normalized.split('+');
  const mods = parts.filter((p) => VALID_MODIFIERS.has(p));
  const mainKeys = parts.filter((p) => !VALID_MODIFIERS.has(p));

  if (mainKeys.length === 0) return '缺少有效按键';
  if (mainKeys.length > 1) return '组合键仅支持修饰键 + 单个主键';

  // 全局快捷键必须至少有一个修饰键
  const def = SHORTCUT_DEFS.find((d) => d.id === id);
  if (def?.scope === 'rust' && mods.length === 0) {
    return '全局快捷键必须包含修饰键（Ctrl/Shift/Alt/Win）';
  }

  return null;
}
