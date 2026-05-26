import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Sidebar } from '../../components/layout/Sidebar';
import { renderWithProviders } from '../test-utils';

vi.mock('../../hooks/useLists', () => ({
  useLists: () => ({
    data: [
      { id: 'l1', name: 'Work', color: '#ff0000', icon: 'list', sort_order: 0, task_count: 3, incomplete_count: 2, created_at: '', updated_at: '' },
      { id: 'l2', name: 'Personal', color: '#00ff00', icon: 'list', sort_order: 1, task_count: 1, incomplete_count: 1, created_at: '', updated_at: '' },
    ],
    isLoading: false,
  }),
  useCreateList: () => ({ mutate: vi.fn() }),
  useUpdateList: () => ({ mutate: vi.fn() }),
  useDeleteList: () => ({ mutate: vi.fn() }),
  useReorderLists: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => ({ data: [], isLoading: false }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({
    data: [
      { id: 't1', name: 'urgent', color: '#ef4444', task_count: 2 },
      { id: 't2', name: 'bug', color: '#f97316', task_count: 1 },
    ],
    isLoading: false,
  }),
  useCreateTag: () => ({ mutate: vi.fn() }),
  useUpdateTag: () => ({ mutate: vi.fn() }),
  useDeleteTag: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: any) => {
    const state = {
      sidebarOpen: true,
      setSidebarOpen: vi.fn(),
      toggleSidebar: vi.fn(),
      commandPaletteOpen: false,
      setCommandPaletteOpen: vi.fn(),
      selectedTaskId: null,
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  }),
}));

describe('Sidebar', () => {
  it('renders navigation links', () => {
    renderWithProviders(<Sidebar />, { initialEntries: ['/'] });
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('My Day')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders Calendar section', () => {
    renderWithProviders(<Sidebar />, { initialEntries: ['/'] });
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('renders Lists section with list names', () => {
    renderWithProviders(<Sidebar />, { initialEntries: ['/'] });
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('renders Tags section with tag names', () => {
    renderWithProviders(<Sidebar />, { initialEntries: ['/'] });
    expect(screen.getByText('urgent')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
  });

  it('renders task counts for lists', () => {
    renderWithProviders(<Sidebar />, { initialEntries: ['/'] });
    // Work incomplete_count=2 and Personal incomplete_count=1
    const counts = screen.getAllByText(/^[12]$/);
    expect(counts.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Settings link', () => {
    renderWithProviders(<Sidebar />, { initialEntries: ['/'] });
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
