import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MyDayPage } from '../../pages/MyDayPage';
import { buildTask, renderWithProviders } from '../test-utils';
import { useUIStore } from '../../stores/uiStore';
import { format, subDays } from '../../lib/date';

const mockState = { data: null as any, isLoading: false, isError: false, suggestions: null as any };

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('../../hooks/useTasks', () => ({
  useTasks: (filter?: any) =>
    filter?.due_date_to && mockState.suggestions
      ? { data: mockState.suggestions, isLoading: false, isError: false }
      : mockState,
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

describe('MyDayPage', () => {
  beforeEach(() => {
    mockState.data = null;
    mockState.isLoading = false;
    mockState.isError = false;
    mockState.suggestions = null;
    sessionStorage.clear();
    useUIStore.setState({ taskStatusFilter: 'all', selectedTaskId: null, selectedTaskIds: new Set() });
  });

  it('shows loading skeleton when isLoading', () => {
    mockState.isLoading = true;
    mockState.data = undefined;
    renderWithProviders(<MyDayPage />);
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders header with My Day text', () => {
    mockState.data = [];
    renderWithProviders(<MyDayPage />);
    expect(screen.getByText('我的一天')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    mockState.data = [];
    renderWithProviders(<MyDayPage />);
    expect(screen.getByText('今天没有任务')).toBeInTheDocument();
  });

  it('shows task count when tasks exist', () => {
    mockState.data = [buildTask({ id: 't1', title: 'T1' })];
    renderWithProviders(<MyDayPage />);
    expect(screen.getByRole('button', { name: '全部 1' })).toBeInTheDocument();
  });

  it('shows suggestion rule text and reason labels', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const twoDaysAgo = format(subDays(new Date(), 2), 'yyyy-MM-dd');
    mockState.data = [];
    mockState.suggestions = [
      buildTask({ id: 's1', title: 'Due today', priority: 0, due_date: today }),
      buildTask({ id: 's2', title: 'Overdue', priority: 3, due_date: twoDaysAgo }),
    ];
    renderWithProviders(<MyDayPage />);
    expect(screen.queryByText(/推荐规则/)).toBeNull();
    fireEvent.mouseEnter(document.querySelector('.cursor-help')!);
    expect(screen.getByText(/推荐规则/)).toBeInTheDocument();
    fireEvent.mouseLeave(document.querySelector('.cursor-help')!);
    expect(screen.queryByText(/推荐规则/)).toBeNull();
    expect(screen.getByText('Due today')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('今天到期')).toBeInTheDocument();
    expect(screen.getByText('已逾期 2 天')).toBeInTheDocument();
  });

  it('includes suggestions without priority', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    mockState.data = [];
    mockState.suggestions = [buildTask({ id: 's1', title: 'No priority', priority: 0, due_date: today })];
    renderWithProviders(<MyDayPage />);
    expect(screen.getByText('No priority')).toBeInTheDocument();
  });

  it('collapses suggestions beyond 6 and expands on click', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    mockState.data = [];
    mockState.suggestions = Array.from({ length: 8 }, (_, i) =>
      buildTask({ id: `s${i}`, title: `S${i}`, due_date: today }),
    );
    renderWithProviders(<MyDayPage />);
    expect(screen.getByText('S5')).toBeInTheDocument();
    expect(screen.queryByText('S6')).toBeNull();
    fireEvent.click(screen.getByText('展开其余 2 项'));
    expect(screen.getByText('S7')).toBeInTheDocument();
    fireEvent.click(screen.getByText('收起列表'));
    expect(screen.queryByText('S6')).toBeNull();
  });

  it('collapses the whole suggestion section via the header chevron', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    mockState.data = [];
    mockState.suggestions = [buildTask({ id: 's1', title: 'S1', due_date: today })];
    renderWithProviders(<MyDayPage />);
    expect(screen.getByText('S1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '收起建议区块' }));
    expect(screen.queryByText('S1')).toBeNull();
    expect(screen.getByText(/建议 · 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开建议区块' }));
    expect(screen.getByText('S1')).toBeInTheDocument();
  });

  it('dismissed suggestions can be restored via 重新推荐', () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    mockState.data = [];
    mockState.suggestions = [buildTask({ id: 's1', title: 'S1', due_date: today })];
    renderWithProviders(<MyDayPage />);
    fireEvent.click(screen.getByText('暂不'));
    expect(screen.queryByText('S1')).toBeNull();
    fireEvent.click(screen.getByText(/重新推荐/));
    expect(screen.getByText('S1')).toBeInTheDocument();
  });
});
