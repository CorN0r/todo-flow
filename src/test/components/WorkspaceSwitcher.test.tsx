import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import i18n from '../../i18n';
import { WorkspaceSwitcher } from '../../components/workspace/WorkspaceSwitcher';
import { renderWithProviders } from '../test-utils';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { buildTask } from '../test-utils';

function setup() {
  const { repositories, state } = createMemoryRepositories({
    tasks: [buildTask({ id: 't1', title: '写周报' })],
  });
  state.workspaces.push({
    id: 'work',
    name: '工作',
    is_active: false,
    task_count: 0,
    created_at: '2026-11-20 10:00:00',
    last_activated_at: '2026-11-23 09:00:00',
  });
  // 切换器只在桌面端显示;内存适配器默认报告的是测试环境
  repositories.platform.kind = 'desktop';
  setRepositoriesForTesting(repositories);
  const activate = vi.spyOn(repositories.settings, 'activateWorkspace').mockResolvedValue(undefined);
  return { state, activate };
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    resetRepositories();
    await i18n.changeLanguage('zh-CN');
  });

  it('始终显示当前工作区的名称', async () => {
    setup();
    renderWithProviders(<WorkspaceSwitcher collapsed={false} />);

    expect(await screen.findByTestId('workspace-switcher')).toHaveTextContent('默认工作区');
    // 内嵌在侧边栏顶行:静止时不带边框
    expect(screen.getByTestId('workspace-switcher')).not.toHaveClass('border');
  });

  it('侧边栏折叠时仍能看到名称', async () => {
    setup();
    renderWithProviders(<WorkspaceSwitcher collapsed />);

    const trigger = await screen.findByTestId('workspace-switcher-collapsed');
    expect(trigger).toHaveTextContent('默认工作区');
    expect(trigger).toHaveAttribute('title', '默认工作区');
  });

  it('点开列出全部工作区,标明当前项,并写明重启和提醒这两条规则', async () => {
    setup();
    renderWithProviders(<WorkspaceSwitcher collapsed={false} />);

    fireEvent.click(await screen.findByTestId('workspace-switcher'));

    const items = await screen.findAllByTestId('workspace-menu-item');
    expect(items.map((item) => item.textContent)).toEqual(['默认工作区当前', '工作']);
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('切换工作区会重启应用')).toBeInTheDocument();
    expect(screen.getByText('提醒只对当前工作区生效')).toBeInTheDocument();
  });

  it('选择另一个工作区会切换;选当前项不会', async () => {
    const { activate } = setup();
    renderWithProviders(<WorkspaceSwitcher collapsed={false} />);

    fireEvent.click(await screen.findByTestId('workspace-switcher'));
    fireEvent.click(await screen.findByRole('menuitem', { name: '工作' }));
    expect(activate).toHaveBeenCalledWith('work');

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    fireEvent.click(screen.getByRole('menuitem', { name: '默认工作区当前' }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('点击外面或按 Esc 关闭菜单', async () => {
    setup();
    renderWithProviders(<WorkspaceSwitcher collapsed={false} />);

    fireEvent.click(await screen.findByTestId('workspace-switcher'));
    expect(screen.getByTestId('workspace-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('workspace-menu')).toBeNull();

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    fireEvent.click(screen.getByTestId('workspace-menu-backdrop'));
    expect(screen.queryByTestId('workspace-menu')).toBeNull();
  });

  it('菜单渲染在页面顶层,不留在侧边栏的层叠上下文里(项目约定:Portal + 固定定位)', async () => {
    setup();
    renderWithProviders(<WorkspaceSwitcher collapsed={false} />);

    const trigger = await screen.findByTestId('workspace-switcher');
    fireEvent.click(trigger);
    const menu = screen.getByTestId('workspace-menu');
    expect(trigger.parentElement?.contains(menu)).toBe(false);
    expect(menu).toHaveClass('fixed');
    expect(menu).toHaveClass('z-[200]');
    // 点外面关闭靠的是这层全屏遮罩
    expect(screen.getByTestId('workspace-menu-backdrop')).toHaveClass('fixed');
  });

  it('"管理工作区"打开管理界面', async () => {
    setup();
    renderWithProviders(<WorkspaceSwitcher collapsed={false} />);

    fireEvent.click(await screen.findByTestId('workspace-switcher'));
    fireEvent.click(screen.getByTestId('workspace-open-manager'));

    expect(await screen.findByRole('dialog', { name: '管理工作区' })).toBeInTheDocument();
  });

  it('清单还没读到时不显示,不影响其余部分', () => {
    const { repositories } = createMemoryRepositories();
    vi.spyOn(repositories.settings, 'listWorkspaces').mockRejectedValue(new Error('boom'));
    setRepositoriesForTesting(repositories);
    renderWithProviders(<WorkspaceSwitcher collapsed={false} />);

    expect(screen.queryByTestId('workspace-switcher')).toBeNull();
    expect(screen.queryByTestId('workspace-switcher-collapsed')).toBeNull();
  });

  it('清单没读到时显示传入的回退内容', async () => {
    const { repositories } = createMemoryRepositories();
    vi.spyOn(repositories.settings, 'listWorkspaces').mockRejectedValue(new Error('boom'));
    setRepositoriesForTesting(repositories);
    renderWithProviders(<WorkspaceSwitcher collapsed={false} fallback={<span>TodoFlow</span>} />);

    expect(screen.getByText('TodoFlow')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-switcher')).toBeNull();
  });

  it('当前环境不提供工作区时显示传入的回退内容', () => {
    const { repositories } = createMemoryRepositories();
    setRepositoriesForTesting(repositories);
    renderWithProviders(<WorkspaceSwitcher collapsed={false} fallback={<span>TodoFlow</span>} />);

    expect(screen.getByText('TodoFlow')).toBeInTheDocument();
  });

  it('切换到英文后文案跟着变', async () => {
    setup();
    await i18n.changeLanguage('en-US');
    renderWithProviders(<WorkspaceSwitcher collapsed={false} />);

    fireEvent.click(await screen.findByTestId('workspace-switcher'));
    await waitFor(() => expect(screen.getByText('Switching restarts the app')).toBeInTheDocument());
    expect(screen.getByText('Reminders only fire for the current workspace')).toBeInTheDocument();
  });
});
