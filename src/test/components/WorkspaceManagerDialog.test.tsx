import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { toast } from 'sonner';
import { WorkspaceManagerDialog } from '../../components/workspace/WorkspaceManagerDialog';
import { renderWithProviders } from '../test-utils';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { buildTask } from '../test-utils';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function setup(taskCount = 3) {
  const { repositories, state } = createMemoryRepositories({
    tasks: Array.from({ length: taskCount }, (_, i) => buildTask({ id: `t${i + 1}`, title: `任务 ${i + 1}` })),
  });
  setRepositoriesForTesting(repositories);
  return { repositories, state };
}

function addWorkspace(state: ReturnType<typeof setup>['state'], overrides: Partial<typeof state.workspaces[number]> = {}) {
  state.workspaces.push({
    id: 'work',
    name: '工作',
    is_active: false,
    task_count: 0,
    created_at: '2026-11-20 10:00:00',
    last_activated_at: '2026-11-23 09:00:00',
    ...overrides,
  });
}

function render(onClose = vi.fn()) {
  renderWithProviders(<WorkspaceManagerDialog open onClose={onClose} />);
  return onClose;
}

const rows = () => screen.getAllByTestId('workspace-row');
// 按名称整字匹配:"默认工作区"里也有"工作"两个字,不能用包含
const rowOf = (name: string) => rows().find((row) => within(row).queryByText(name) !== null) as HTMLElement;

describe('WorkspaceManagerDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(async () => {
    resetRepositories();
    await i18n.changeLanguage('zh-CN');
  });

  it('列出每个工作区的名称、任务数、最近使用和当前标记', async () => {
    const { state } = setup();
    state.workspaces[0].last_activated_at = '2026-11-24 09:30:00';
    addWorkspace(state, { last_activated_at: null });
    render();

    expect(await screen.findByRole('dialog', { name: '管理工作区' })).toBeInTheDocument();
    expect(await screen.findAllByTestId('workspace-row')).toHaveLength(2);
    const current = rowOf('默认工作区');
    expect(current).toHaveAttribute('data-active', 'true');
    expect(current).toHaveTextContent('当前');
    expect(current).toHaveTextContent('3 个任务');
    expect(current).toHaveTextContent('最近使用 2026-11-24 09:30');
    expect(rowOf('工作')).toHaveAttribute('data-active', 'false');
    expect(rowOf('工作')).toHaveTextContent('还没用过');
  });

  it('只剩一个工作区时不能删除,并说明原因', async () => {
    setup();
    render();

    const remove = await screen.findByTestId('workspace-delete');
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('title', '至少要保留一个工作区');
  });

  it('删除需要确认,确认文案带名称和任务数', async () => {
    const { state } = setup();
    addWorkspace(state);
    render();

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(state.workspaces).toHaveLength(2);

    fireEvent.click(within(rowOf('工作')).getByTestId('workspace-delete'));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('删除“工作”?其中的 3 个任务和附件会被删除,无法恢复。');
    // 还没确认:没有删除
    expect(state.workspaces).toHaveLength(2);

    fireEvent.click(screen.getByTestId('workspace-confirm-delete'));
    await waitFor(() => expect(state.workspaces).toHaveLength(1));
    expect(state.workspaces[0].id).toBe('default');
    expect(toast.success).toHaveBeenCalledWith('已删除工作区');
  });

  it('删除当前工作区时提示会切换并重启', async () => {
    const { state } = setup();
    addWorkspace(state);
    render();

    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(within(rowOf('默认工作区')).getByTestId('workspace-delete'));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('删除当前工作区后,会切换到另一个工作区并重启应用。');
  });

  it('重命名立即生效', async () => {
    const { state } = setup();
    render();

    fireEvent.click(await screen.findByRole('button', { name: '重命名' }));
    const input = await screen.findByLabelText('工作区名称');
    await userEvent.clear(input);
    await userEvent.type(input, '个人');
    fireEvent.click(screen.getByTestId('workspace-name-submit'));

    await waitFor(() => expect(state.workspaces[0].name).toBe('个人'));
    expect(toast.success).toHaveBeenCalledWith('已重命名');
    expect(screen.queryByTestId('workspace-name-form')).toBeNull();
  });

  it('新建空白工作区,默认建完切换过去', async () => {
    const { repositories, state } = setup();
    const create = vi.spyOn(repositories.settings, 'createWorkspace');
    render();

    fireEvent.click(await screen.findByTestId('workspace-new'));
    await userEvent.type(await screen.findByLabelText('工作区名称'), '试验');
    fireEvent.click(screen.getByTestId('workspace-name-submit'));

    await waitFor(() => expect(state.workspaces).toHaveLength(2));
    expect(create).toHaveBeenCalledWith('试验', true);
    expect(state.workspaces[1].is_active).toBe(true);
  });

  it('名称为空时不创建并提示', async () => {
    setup();
    render();

    fireEvent.click(await screen.findByTestId('workspace-new'));
    fireEvent.click(await screen.findByTestId('workspace-name-submit'));

    expect(toast.error).toHaveBeenCalledWith('请输入工作区名称');
  });

  it('从文件添加:名称默认取文件名,可以取消"完成后切换"', async () => {
    const { repositories, state } = setup();
    vi.spyOn(repositories.platform, 'chooseFiles').mockResolvedValue(['D:/backups/旧备份.db']);
    const add = vi.spyOn(repositories.settings, 'addWorkspaceFromFile');
    render();

    fireEvent.click(await screen.findByTestId('workspace-add-from-file'));
    const input = await screen.findByLabelText('工作区名称');
    expect(input).toHaveValue('旧备份');
    fireEvent.click(screen.getByLabelText('完成后切换过去'));
    fireEvent.click(screen.getByTestId('workspace-name-submit'));

    await waitFor(() => expect(state.workspaces).toHaveLength(2));
    expect(add).toHaveBeenCalledWith('D:/backups/旧备份.db', '旧备份', false);
  });

  it('在文件选择框里取消不会打开表单', async () => {
    const { repositories } = setup();
    vi.spyOn(repositories.platform, 'chooseFiles').mockResolvedValue([]);
    render();

    fireEvent.click(await screen.findByTestId('workspace-add-from-file'));
    await waitFor(() => expect(repositories.platform.chooseFiles).toHaveBeenCalled());
    expect(screen.queryByTestId('workspace-name-form')).toBeNull();
  });

  it('切换到非当前工作区', async () => {
    const { repositories, state } = setup();
    addWorkspace(state);
    const activate = vi.spyOn(repositories.settings, 'activateWorkspace').mockResolvedValue(undefined);
    render();

    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(within(rowOf('工作')).getByTestId('workspace-switch'));
    expect(activate).toHaveBeenCalledWith('work');
  });

  it('后端拒绝时把原因显示出来', async () => {
    const { repositories } = setup();
    vi.spyOn(repositories.settings, 'createWorkspace').mockRejectedValue(new Error('Validation error: 已有名为“试验”的工作区'));
    render();

    fireEvent.click(await screen.findByTestId('workspace-new'));
    await userEvent.type(await screen.findByLabelText('工作区名称'), '试验');
    fireEvent.click(screen.getByTestId('workspace-name-submit'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('已有名为“试验”的工作区'));
  });

  it('按 Esc 关闭', async () => {
    const onClose = vi.fn();
    setup();
    render(onClose);

    await screen.findByRole('dialog', { name: '管理工作区' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('切换到英文后文案跟着变', async () => {
    setup();
    await i18n.changeLanguage('en-US');
    render();

    expect(await screen.findByRole('dialog', { name: 'Manage workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New workspace/ })).toBeInTheDocument();
  });
});
