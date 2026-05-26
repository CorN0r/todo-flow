import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { TagPage } from '../../pages/TagPage';
import { renderWithProviders } from '../test-utils';

const mockTasks = { data: null as any, isLoading: false };
const mockTags = { data: null as any, isLoading: false };

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => mockTasks,
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => mockTags,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ tagId: 't1' }),
    useNavigate: () => vi.fn(),
  };
});

describe('TagPage', () => {
  beforeEach(() => {
    mockTasks.data = null;
    mockTasks.isLoading = false;
    mockTags.data = [{ id: 't1', name: 'urgent', color: '#ef4444' }];
  });

  it('shows loading skeleton', () => {
    mockTasks.isLoading = true;
    mockTasks.data = undefined;
    renderWithProviders(<TagPage />);
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders tag name', () => {
    mockTasks.data = [];
    renderWithProviders(<TagPage />);
    expect(screen.getByText('urgent')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    mockTasks.data = [];
    renderWithProviders(<TagPage />);
    expect(screen.getByText('No tasks with this tag')).toBeInTheDocument();
  });

  it('renders fallback name when tag not found', () => {
    mockTags.data = [];
    mockTasks.data = [];
    renderWithProviders(<TagPage />);
    expect(screen.getByText('Tag')).toBeInTheDocument();
  });
});
