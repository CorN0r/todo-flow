import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { DateFilterPage } from '../../pages/DateFilterPage';
import { renderWithProviders, buildTask } from '../test-utils';
import { useUIStore } from '../../stores/uiStore';
import { addDays, format } from '../../lib/date';

const mockTasks = { data: null as any, isLoading: false, isError: false };
// 每个用例自己决定路由参数;navigate 记录调用,不真的跳转
const mockRouter = { params: { filter: 'all' }, navigate: vi.fn() };

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => mockTasks,
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
  useToggleMyDay: () => vi.fn(),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

// 快速新建只关心它拿到的默认截止日期
vi.mock('../../components/tasks/TaskQuickAdd', () => ({
  TaskQuickAdd: ({ defaultDueDate }: { defaultDueDate?: string }) => (
    <div data-testid="quick-add-due">{defaultDueDate ?? 'none'}</div>
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockRouter.params,
    useNavigate: () => mockRouter.navigate,
  };
});

describe('DateFilterPage', () => {
  beforeEach(() => {
    mockTasks.data = null;
    mockTasks.isLoading = false;
    mockTasks.isError = false;
    mockRouter.params = { filter: 'all' };
    mockRouter.navigate.mockReset();
    useUIStore.setState({ taskStatusFilter: 'all', selectedTaskId: null, selectedTaskIds: new Set(), lastPlannedRange: 'this-week', showQuickAdd: false, taskViewMode: 'list' });
  });

  it('shows loading skeleton', () => {
    mockTasks.isLoading = true;
    mockTasks.data = undefined;
    renderWithProviders(<DateFilterPage />);
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders All Tasks for all filter', () => {
    mockTasks.data = [];
    renderWithProviders(<DateFilterPage />);
    expect(screen.getByText('全部任务')).toBeInTheDocument();
  });

  it('全部任务没有日期范围切换', () => {
    mockTasks.data = [];
    renderWithProviders(<DateFilterPage />);
    expect(screen.queryByTestId('planned-range-today')).not.toBeInTheDocument();
    expect(screen.queryByText('计划')).not.toBeInTheDocument();
  });

  it('计划范围下标题是计划,四个范围都在,当前范围标出', () => {
    mockTasks.data = [];
    mockRouter.params = { filter: 'this-week' };
    renderWithProviders(<DateFilterPage />);
    expect(screen.getByRole('heading', { name: '计划' })).toBeInTheDocument();
    for (const [range, label] of [['today', '今天'], ['tomorrow', '明天'], ['this-week', '未来7天'], ['this-month', '未来30天']] as const) {
      expect(screen.getByTestId(`planned-range-${range}`)).toHaveTextContent(label);
    }
    expect(screen.getByTestId('planned-range-this-week')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('planned-range-tomorrow')).toHaveAttribute('aria-pressed', 'false');
  });

  it('点击范围后导航到对应的地址', () => {
    mockTasks.data = [];
    mockRouter.params = { filter: 'this-week' };
    renderWithProviders(<DateFilterPage />);
    fireEvent.click(screen.getByTestId('planned-range-tomorrow'));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/date/tomorrow');
  });

  it('进入计划范围后记住该范围,全部任务不改它', () => {
    mockTasks.data = [];
    mockRouter.params = { filter: 'tomorrow' };
    const { unmount } = renderWithProviders(<DateFilterPage />);
    expect(useUIStore.getState().lastPlannedRange).toBe('tomorrow');
    unmount();

    useUIStore.setState({ lastPlannedRange: 'this-month' });
    mockRouter.params = { filter: 'all' };
    renderWithProviders(<DateFilterPage />);
    expect(useUIStore.getState().lastPlannedRange).toBe('this-month');
  });

  it('范围内新建任务的默认截止日期是该范围的起始日期', () => {
    mockTasks.data = [];
    mockRouter.params = { filter: 'tomorrow' };
    renderWithProviders(<DateFilterPage />);
    fireEvent.click(screen.getByRole('button', { name: '新建任务' }));
    expect(screen.getByTestId('quick-add-due')).toHaveTextContent(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  });

  it('shows empty state when no tasks', () => {
    mockTasks.data = [];
    renderWithProviders(<DateFilterPage />);
    expect(screen.getByText('此时间段暂无任务')).toBeInTheDocument();
  });

  it('shows task count', () => {
    mockTasks.data = [{
      id: 't1', title: 'T1', is_completed: false, is_archived: false,
      is_suspended: false, is_abandoned: false, is_pinned: false,
      priority: 0, due_date: null, reminder: null, tag_ids: [],
      parent_task_id: null, sort_order: 0, recurrence: null,
      my_day_date: null, children_count: 0, created_at: '', updated_at: '',
    }];
    renderWithProviders(<DateFilterPage />);
    expect(screen.getByRole('button', { name: '全部 1' })).toBeInTheDocument();
  });

  const openTask = () => buildTask({ id: 'open', title: '还要做的事', priority: 3 });
  const doneTask = () => buildTask({ id: 'done', title: '做完的事', priority: 3, is_completed: true });

  it('在页头的视图菜单里选择看板后,页面以看板显示', () => {
    mockTasks.data = [openTask()];
    renderWithProviders(<DateFilterPage />);
    expect(screen.getByRole('button', { name: /多选/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '视图：列表' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '看板' }));

    expect(useUIStore.getState().taskViewMode).toBe('kanban');
    expect(screen.getByRole('group', { name: '看板分组' })).toBeInTheDocument();
    expect(screen.getByText('还要做的事')).toBeInTheDocument();
    // 看板没有子任务可展开,也没有批量选择
    expect(screen.queryByRole('button', { name: /多选/ })).not.toBeInTheDocument();
  });

  it('看板和列表受同一个状态筛选约束', () => {
    mockTasks.data = [openTask(), doneTask()];
    useUIStore.setState({ taskViewMode: 'kanban', taskStatusFilter: 'all' });
    const { unmount } = renderWithProviders(<DateFilterPage />);
    expect(screen.getByText('做完的事')).toBeInTheDocument();
    unmount();

    useUIStore.setState({ taskStatusFilter: 'active' });
    renderWithProviders(<DateFilterPage />);
    expect(screen.getByText('还要做的事')).toBeInTheDocument();
    expect(screen.queryByText('做完的事')).not.toBeInTheDocument();
  });

  it('四象限只显示未完成的任务', () => {
    mockTasks.data = [openTask(), doneTask()];
    useUIStore.setState({ taskViewMode: 'matrix', taskStatusFilter: 'all' });
    renderWithProviders(<DateFilterPage />);

    for (const title of ['立即处理', '计划安排', '委派他人', '可删除']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText('还要做的事')).toBeInTheDocument();
    expect(screen.queryByText('做完的事')).not.toBeInTheDocument();
  });
});
