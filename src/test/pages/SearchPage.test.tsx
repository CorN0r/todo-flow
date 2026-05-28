import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { SearchPage } from '../../pages/SearchPage';
import { renderWithProviders } from '../test-utils';

const { mockGetTasks } = vi.hoisted(() => ({
  mockGetTasks: vi.fn(),
}));

vi.mock('../../lib/db', () => ({
  getTasks: mockGetTasks,
}));

vi.mock('../../hooks/useTasks', () => ({
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

describe('SearchPage', () => {
  beforeEach(() => {
    mockGetTasks.mockResolvedValue([]);
  });

  it('renders search input', () => {
    renderWithProviders(<SearchPage />, { initialEntries: ['/search'] });
    expect(screen.getByPlaceholderText('Search tasks by title or description...')).toBeInTheDocument();
  });

  it('shows initial suggestions when no query', () => {
    renderWithProviders(<SearchPage />, { initialEntries: ['/search'] });
    expect(screen.getByText('Search your tasks')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('High priority')).toBeInTheDocument();
  });
});
