import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { CommandPalette } from '../../components/shared/CommandPalette';
import { renderWithProviders } from '../test-utils';
import { useUIStore } from '../../stores/uiStore';

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

// 记录导航落点的壳子
function Harness() {
  const location = useLocation();
  return (
    <>
      <Routes>
        <Route path="*" element={<p>占位页</p>} />
      </Routes>
      <output data-testid="location">{location.pathname}</output>
      <CommandPalette />
    </>
  );
}

// 和侧边栏的五个目的地加数据面板、设置一一对应
const DESTINATIONS = ['全部任务', '我的一天', '计划', '日历', '习惯追踪', '数据面板', '设置'];

describe('CommandPalette', () => {
  beforeEach(() => {
    useUIStore.setState({ commandPaletteOpen: true, sidebarOpen: true, lastPlannedRange: 'this-week', taskViewMode: 'list' });
  });

  it('打开后能到达全部目的地,并有看板与四象限两条视图命令', () => {
    renderWithProviders(<Harness />);
    for (const label of DESTINATIONS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('看板视图')).toBeInTheDocument();
    expect(screen.getByText('四象限视图')).toBeInTheDocument();
    expect(screen.queryByText('今天')).not.toBeInTheDocument();
  });

  it('filters commands by search query', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const input = screen.getByPlaceholderText('输入命令...');
    await user.type(input, '深色');
    expect(screen.getByText('深色主题')).toBeInTheDocument();
    expect(screen.queryByText('我的一天')).not.toBeInTheDocument();
  });

  it('shows no results for non-matching query', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const input = screen.getByPlaceholderText('输入命令...');
    await user.type(input, 'zzz_nonexistent');
    expect(screen.getByText('无匹配命令')).toBeInTheDocument();
  });

  it('选择计划进入上次查看的范围', async () => {
    const user = userEvent.setup();
    useUIStore.setState({ lastPlannedRange: 'tomorrow' });
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: '计划' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/date/tomorrow');
  });

  it('执行看板视图后当前视图变为看板', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: '看板视图' }));
    expect(useUIStore.getState().taskViewMode).toBe('kanban');
  });

  it('shows keyboard shortcut hints in footer', () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText('导航')).toBeInTheDocument();
    expect(screen.getByText('选择')).toBeInTheDocument();
    expect(screen.getByText('关闭')).toBeInTheDocument();
  });

  it('renders all categories', () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText('新建任务')).toBeInTheDocument();
    expect(screen.getByText('浅色主题')).toBeInTheDocument();
    expect(screen.getByText('深色主题')).toBeInTheDocument();
    expect(screen.getByText('系统主题')).toBeInTheDocument();
  });
});
