import { vi } from 'vitest';

// Mock @tauri-apps/api/core invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock @tauri-apps/api/event (used in App.tsx, useTheme, reminders)
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

// Mock sonner toast (used in all mutation hooks)
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock motion/react — render as plain HTML elements for deterministic snapshots
vi.mock('motion/react', async () => {
  const elements = [
    'div', 'aside', 'span', 'section', 'header', 'footer', 'main',
    'nav', 'article', 'button', 'p', 'h1', 'h2', 'h3', 'h4',
  ];
  const motion: Record<string, string> = {};
  for (const tag of elements) {
    motion[tag] = tag;
  }
  return {
    ...motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Mock react-router-dom useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Mock lucide-react icons — render simple span elements
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  const mockIcons: Record<string, () => { render: () => unknown }> = {};
  const iconNames = [
    'GripVertical', 'House', 'CalendarDays', 'Plus', 'Minimize2',
    'PanelLeftClose', 'PanelLeft', 'Settings', 'MoreHorizontal',
    'Pencil', 'Trash2', 'Sun', 'Moon', 'Search', 'X', 'Check',
    'RotateCcw', 'Copy', 'Calendar', 'Flag', 'ListTree', 'ListChecks',
    'List', 'Repeat', 'Save', 'ChevronDown', 'Image', 'Upload',
    'FileText', 'Download', 'Database', 'ExternalLink',
    'Repeat', 'ChevronDown', 'ChevronLeft', 'ChevronRight',
    'ArrowRight', 'SunDim', 'GripHorizontal', 'SunDim',
    'CheckCheck', 'FolderInput', 'Tag', 'Inbox', 'CalendarCheck',
    'Minimize2', 'Square', 'SquareCheck',
  ];
  for (const name of iconNames) {
    mockIcons[name] = () => ({ render: () => null });
  }
  return { ...actual, ...mockIcons };
});
