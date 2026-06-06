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

  it('renders advanced search title', () => {
    renderWithProviders(<SearchPage />, { initialEntries: ['/search'] });
    expect(screen.getByRole('heading', { name: '高级搜索' })).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderWithProviders(<SearchPage />, { initialEntries: ['/search'] });
    expect(screen.getByPlaceholderText('搜索任务标题或描述...')).toBeInTheDocument();
  });

  it('renders filter controls', () => {
    renderWithProviders(<SearchPage />, { initialEntries: ['/search'] });
    expect(screen.getByText('标签')).toBeInTheDocument();
    expect(screen.getByText('全部')).toBeInTheDocument();
    expect(screen.getByText('未完成')).toBeInTheDocument();
    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText('优先级')).toBeInTheDocument();
    expect(screen.getByText('我的一天')).toBeInTheDocument();
  });

  it('shows initial empty state', () => {
    renderWithProviders(<SearchPage />, { initialEntries: ['/search'] });
    expect(screen.getByText('使用上方筛选条件搜索任务，支持按关键词、标签、优先级、日期范围等组合筛选')).toBeInTheDocument();
  });
});
