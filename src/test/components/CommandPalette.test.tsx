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
    expect(screen.getByText('Go to Today')).toBeInTheDocument();
    expect(screen.getByText('Go to Calendar')).toBeInTheDocument();
    expect(screen.getByText('Go to Settings')).toBeInTheDocument();
  });

  it('filters commands by search query', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);
    const input = screen.getByPlaceholderText('Type a command...');
    await user.type(input, 'dark');
    expect(screen.getByText('Dark Theme')).toBeInTheDocument();
    expect(screen.queryByText('Go to Today')).not.toBeInTheDocument();
  });

  it('shows no results for non-matching query', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);
    const input = screen.getByPlaceholderText('Type a command...');
    await user.type(input, 'zzz_nonexistent');
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });

  it('shows keyboard shortcut hints in footer', () => {
    renderWithProviders(<CommandPalette />);
    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.getByText('Select')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('renders all categories', () => {
    renderWithProviders(<CommandPalette />);
    // Actions category
    expect(screen.getByText('Create New Task')).toBeInTheDocument();
    // View category
    expect(screen.getByText('Light Theme')).toBeInTheDocument();
    expect(screen.getByText('Dark Theme')).toBeInTheDocument();
    expect(screen.getByText('System Theme')).toBeInTheDocument();
  });
});
