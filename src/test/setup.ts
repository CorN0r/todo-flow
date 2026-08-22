import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// jsdom 未实现 elementFromPoint，TipTap/ProseMirror 在某些交互中会用到
if (typeof document !== 'undefined' && !document.elementFromPoint) {
  document.elementFromPoint = vi.fn(() => null) as unknown as typeof document.elementFromPoint;
}

// jsdom 未实现 Range 的几何方法，ProseMirror 滚动到选区时会用到
if (typeof Range !== 'undefined') {
  const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 };
  Range.prototype.getBoundingClientRect = vi.fn(() => emptyRect as DOMRect);
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
}

// 禁用 BubbleMenu 的 tippy 依赖，避免在 jsdom 中触发未处理异常
vi.mock('@tiptap/extension-bubble-menu', () => ({
  default: {
    create: () => ({
      name: 'bubbleMenu',
      addProseMirrorPlugins: () => [],
    }),
  },
}));

vi.mock('tippy.js', () => ({
  default: vi.fn(() => ({
    setProps: vi.fn(),
    destroy: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
  })),
  hideAll: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((command: string) => {
    if (command === 'get_setting') return Promise.resolve(null);
    if (command === 'get_all_settings') return Promise.resolve({});
    if (command === 'get_tasks') return Promise.resolve([]);
    if (command === 'get_tags') return Promise.resolve([]);
    if (command === 'get_habits') return Promise.resolve([]);
    if (command === 'get_dashboard_stats') {
      return Promise.resolve({
        total_tasks: 0,
        completed_tasks: 0,
        incomplete_tasks: 0,
        overdue_tasks: 0,
        suspended_tasks: 0,
        abandoned_tasks: 0,
        today_completed: 0,
        today_total: 0,
        completion_by_date: [],
        tasks_by_tag: [],
      });
    }
    return Promise.resolve(null);
  }),
}));

vi.mock('@tauri-apps/api/window', () => {
  const currentWindow = {
    isMaximized: vi.fn(() => Promise.resolve(false)),
    onResized: vi.fn(() => Promise.resolve(() => {})),
    toggleMaximize: vi.fn(() => Promise.resolve()),
    minimize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    setSize: vi.fn(() => Promise.resolve()),
  };
  class LogicalSize {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  }
  return { getCurrentWindow: () => currentWindow, LogicalSize };
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.remove('light');
});
