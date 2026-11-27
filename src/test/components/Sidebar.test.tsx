/// <reference types="node" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { Link, Route, Routes } from 'react-router-dom';
import { Sidebar } from '../../components/layout/Sidebar';
import { renderWithProviders } from '../test-utils';
import { useUIStore } from '../../stores/uiStore';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { buildTask } from '../test-utils';
import { contrast, cssValue, hex, paintedBackground } from '../contrast';

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({
    data: [
      { id: 't1', name: 'Work', color: '#ff0000', icon: 'tag', sort_order: 0, task_count: 3, incomplete_count: 2, created_at: '', updated_at: '' },
      { id: 't2', name: 'Personal', color: '#00ff00', icon: 'tag', sort_order: 1, task_count: 1, incomplete_count: 1, created_at: '', updated_at: '' },
    ],
    isLoading: false,
  }),
  useCreateTag: () => ({ mutate: vi.fn() }),
  useUpdateTag: () => ({ mutate: vi.fn() }),
  useDeleteTag: () => ({ mutate: vi.fn() }),
  useReorderTags: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => ({ data: [], isLoading: false }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
}));

// 带几个链接的壳子:用来在侧边栏保持挂载的同时切换路由
function Harness() {
  return (
    <>
      <Link to="/calendar">去日历</Link>
      <Link to="/date/tomorrow">去明天</Link>
      <Routes>
        <Route path="/calendar" element={<p>日历页</p>} />
        <Route path="/date/:filter" element={<p>日期页</p>} />
        <Route path="*" element={<p>首页</p>} />
      </Routes>
      <Sidebar />
    </>
  );
}

function destinations() {
  return within(screen.getByRole('navigation', { name: '主导航' })).getAllByRole('link');
}

function activeDestinationNames() {
  return destinations().filter((link) => link.className.includes('font-medium')).map((link) => link.textContent);
}

function destinationIconNames() {
  return [...screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('svg')].map((svg) =>
    (svg.getAttribute('class') ?? '').split(/\s+/).find((cls) => cls.startsWith('lucide-')),
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarOpen: true, lastPlannedRange: 'this-week', theme: 'light' });
  });

  afterEach(() => {
    resetRepositories();
  });

  it('目的地组恰好是五个入口,顺序固定', () => {
    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    expect(destinations().map((link) => link.textContent)).toEqual(['全部任务', '我的一天', '计划', '日历', '习惯追踪']);
  });

  it('没有日期范围和任务视图的独立入口,今日清单只有我的一天', () => {
    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    for (const label of ['今天', '明天', '未来7天', '未来30天', '四象限', '看板']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('任意两个目的地的图标互不相同', () => {
    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    const icons = destinationIconNames();
    expect(icons).toHaveLength(5);
    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(5);
  });

  it('数据面板、设置和标签照常显示', () => {
    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    expect(screen.getByRole('link', { name: '数据面板' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/settings');
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('标签显示未完成任务计数', () => {
    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    // Work incomplete_count=2 and Personal incomplete_count=1
    const counts = screen.getAllByText(/^[12]$/);
    expect(counts.length).toBeGreaterThanOrEqual(2);
  });

  it('点击标签分组标题后标签收起,再点一次恢复', () => {
    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    const header = screen.getByRole('button', { name: '标签' });
    expect(header).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Work')).not.toBeInTheDocument();
    // 收起后新建标签的入口还在
    expect(screen.getByRole('button', { name: '新建标签' })).toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('标签的折叠状态在切换页面、收起再展开侧边栏之后保持', () => {
    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    fireEvent.click(screen.getByRole('button', { name: '标签' }));

    fireEvent.click(screen.getByRole('link', { name: '去日历' }));
    expect(screen.getByText('日历页')).toBeInTheDocument();
    expect(screen.queryByText('Work')).not.toBeInTheDocument();

    act(() => useUIStore.getState().toggleSidebar());
    act(() => useUIStore.getState().toggleSidebar());
    expect(screen.getByRole('button', { name: '标签' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('位于计划范围时只有计划呈选中态', () => {
    renderWithProviders(<Harness />, { initialEntries: ['/date/tomorrow'] });
    expect(activeDestinationNames()).toEqual(['计划']);
  });

  it('位于全部任务时计划不选中', () => {
    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    expect(activeDestinationNames()).toEqual(['全部任务']);
  });

  it('计划指向上次查看的范围,点击后进入该范围', () => {
    useUIStore.setState({ lastPlannedRange: 'tomorrow' });
    renderWithProviders(<Harness />, { initialEntries: ['/calendar'] });
    const planned = screen.getByRole('link', { name: '计划' });
    expect(planned).toHaveAttribute('href', '/date/tomorrow');
    // 不在计划范围内时计划不选中,选中的是当前所在的日历
    expect(activeDestinationNames()).toEqual(['日历']);

    fireEvent.click(planned);
    expect(screen.getByText('日期页')).toBeInTheDocument();
  });

  it('折叠成图标栏时仍有全部入口', () => {
    useUIStore.setState({ sidebarOpen: false });
    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    for (const name of ['全部任务', '我的一天', '计划', '日历', '习惯追踪', '数据面板', '设置']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.queryByText('TodoFlow')).not.toBeInTheDocument();
  });

  it('工作区清单读不到时顶行显示应用名,目的地照常可用', () => {
    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    expect(screen.getByText('TodoFlow')).toBeInTheDocument();
    expect(destinations()).toHaveLength(5);
  });

  it('工作区清单读到后顶行显示工作区名称,不再显示应用名', async () => {
    const { repositories } = createMemoryRepositories({ tasks: [buildTask({ id: 't1', title: '写周报' })] });
    // 切换器只在桌面端显示;内存适配器默认报告的是测试环境
    repositories.platform.kind = 'desktop';
    setRepositoriesForTesting(repositories);

    renderWithProviders(<Harness />, { initialEntries: ['/date/all'] });
    expect(await screen.findByTestId('workspace-switcher')).toHaveTextContent('默认工作区');
    expect(screen.queryByText('TodoFlow')).not.toBeInTheDocument();
  });

  // 浅色主题下主色压在自己的浅色底上只有 3:1。这里按真实取值算:文字色取自 index.css 的
  // .sidebar-selected,底色取自选中项的背景类叠在侧边栏背景上。深色主题的文字是白色,不用算
  it.each([
    ['浅色', '目的地', 'light', '/date/all'],
    ['浅色', '底部入口', 'light', '/dashboard'],
    ['Lumina', '目的地', 'lumina', '/date/all'],
    ['Lumina', '底部入口', 'lumina', '/dashboard'],
  ] as const)('%s 主题下选中的%s对比度不低于 4.5:1', (_label, which, theme, route) => {
    useUIStore.setState({ theme });
    renderWithProviders(<Harness />, { initialEntries: [route] });

    const sidebar = screen.getByRole('navigation', { name: '主导航' }).closest('aside')!;
    const sidebarBackground = theme === 'lumina'
      ? hex(cssValue('.lumina .bg-\\[\\#F3F2FA\\]', 'background-color'))
      : paintedBackground(sidebar.className, [255, 255, 255]);
    const text = hex(cssValue(theme === 'lumina' ? '.lumina .sidebar-selected' : '.sidebar-selected', 'color'));
    const link = which === '目的地'
      ? destinations().find((candidate) => candidate.className.includes('font-medium'))!
      : screen.getByRole('link', { name: '数据面板' });

    expect(link.className).toContain('font-medium');
    expect(link).toHaveClass('sidebar-selected');
    expect(contrast(text, paintedBackground(link.className, sidebarBackground))).toBeGreaterThanOrEqual(4.5);
  });
});
