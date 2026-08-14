import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { TagPage } from '../../pages/TagPage';
import { buildTask, renderWithProviders } from '../test-utils';
import { useUIStore } from '../../stores/uiStore';

const mockTasks = { data: null as any, isLoading: false, isError: false };
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
    mockTasks.isError = false;
    mockTags.data = [{ id: 't1', name: 'Work', color: '#ff0000', icon: 'tag', sort_order: 0 }];
    useUIStore.setState({ taskStatusFilter: 'all', selectedTaskId: null, selectedTaskIds: new Set() });
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
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    mockTasks.data = [];
    renderWithProviders(<TagPage />);
    expect(screen.getByText('\u6b64\u6807\u7b7e\u4e0b\u6682\u65e0\u4efb\u52a1')).toBeInTheDocument();
  });

  it('renders fallback name when tag not found', () => {
    mockTags.data = [];
    mockTasks.data = [];
    renderWithProviders(<TagPage />);
    expect(screen.getByText('Tag')).toBeInTheDocument();
  });

  it('uses the desktop session filter on the tag page', () => {
    mockTasks.data = [
      buildTask({ id: 'active', title: 'Active tagged task', tag_ids: ['t1'] }),
      buildTask({ id: 'paused', title: 'Paused tagged task', tag_ids: ['t1'], is_suspended: true }),
    ];
    useUIStore.setState({ taskStatusFilter: 'suspended' });
    renderWithProviders(<TagPage />);
    expect(screen.getByText('Paused tagged task')).toBeInTheDocument();
    expect(screen.queryByText('Active tagged task')).not.toBeInTheDocument();
  });
});
