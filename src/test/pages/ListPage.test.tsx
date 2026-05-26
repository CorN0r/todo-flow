import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { ListPage } from '../../pages/ListPage';
import { renderWithProviders } from '../test-utils';

const mockTasks = { data: null as any, isLoading: false };
const mockLists = { data: null as any, isLoading: false };

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => mockTasks,
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useLists', () => ({
  useLists: () => mockLists,
}));

// Mock useParams so ListPage gets listId without full route matching
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ listId: 'l1' }),
    useNavigate: () => vi.fn(),
  };
});

describe('ListPage', () => {
  beforeEach(() => {
    mockTasks.data = null;
    mockTasks.isLoading = false;
    mockLists.data = [{ id: 'l1', name: 'Work', color: '#ff0000', icon: 'list', sort_order: 0 }];
  });

  it('shows loading skeleton', () => {
    mockTasks.isLoading = true;
    mockTasks.data = undefined;
    renderWithProviders(<ListPage />);
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders list name', () => {
    mockTasks.data = [];
    renderWithProviders(<ListPage />);
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    mockTasks.data = [];
    renderWithProviders(<ListPage />);
    expect(screen.getByText('No tasks in this list')).toBeInTheDocument();
  });

  it('renders fallback name when list not found', () => {
    mockLists.data = [];
    mockTasks.data = [];
    renderWithProviders(<ListPage />);
    expect(screen.getByText('List')).toBeInTheDocument();
  });
});
