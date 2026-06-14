import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '../../components/shared/CommandPalette';
import { renderWithProviders } from '../test-utils';

vi.mock('../../stores/uiStore', () => {
  const store = {
    commandPaletteOpen: true,
    setCommandPaletteOpen: vi.fn(),
    sidebarOpen: true,
    toggleSidebar: vi.fn(),
  };
  return {
    useUIStore: vi.fn((selector?: any) => {
      if (typeof selector === 'function') return selector(store);
      return store;
    }),
  };
});

vi.mock('../../stores/shortcutStore', () => ({
  useShortcutStore: vi.fn((selector?: any) => {
    const store = {
      shortcutMap: {},
      conflicts: [],
      isLoaded: true,
    };
    if (typeof selector === 'function') return selector(store);
    return store;
  }),
}));

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn(), resolvedTheme: 'light' }),
}));

vi.mock('../../hooks/useTasks', () => ({
  useCreateTask: () => ({ mutate: vi.fn() }),
}));

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders command list when open', () => {
    renderWithProviders(<CommandPalette />);
    expect(screen.getByText('今天')).toBeInTheDocument();
    expect(screen.getByText('日历')).toBeInTheDocument();
    expect(screen.getByText('设置')).toBeInTheDocument();
  });

  it('filters commands by search query', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);
    const input = screen.getByPlaceholderText('输入命令...');
    await user.type(input, '深色');
    expect(screen.getByText('深色主题')).toBeInTheDocument();
    expect(screen.queryByText('今天')).not.toBeInTheDocument();
  });

  it('shows no results for non-matching query', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);
    const input = screen.getByPlaceholderText('输入命令...');
    await user.type(input, 'zzz_nonexistent');
    expect(screen.getByText('无匹配命令')).toBeInTheDocument();
  });

  it('shows keyboard shortcut hints in footer', () => {
    renderWithProviders(<CommandPalette />);
    expect(screen.getByText('导航')).toBeInTheDocument();
    expect(screen.getByText('选择')).toBeInTheDocument();
    expect(screen.getByText('关闭')).toBeInTheDocument();
  });

  it('renders all categories', () => {
    renderWithProviders(<CommandPalette />);
    expect(screen.getByText('新建任务')).toBeInTheDocument();
    expect(screen.getByText('浅色主题')).toBeInTheDocument();
    expect(screen.getByText('深色主题')).toBeInTheDocument();
    expect(screen.getByText('系统主题')).toBeInTheDocument();
  });
});
