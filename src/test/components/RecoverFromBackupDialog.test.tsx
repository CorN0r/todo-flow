import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { toast } from 'sonner';
import { RecoverFromBackupDialog } from '../../components/workspace/RecoverFromBackupDialog';
import { renderWithProviders } from '../test-utils';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import type { BackupPreview } from '../../domain/models/workspace';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const SOURCE = 'D:/backups/todoflow-backup-2026-11-23.db';

const PREVIEW: BackupPreview = {
  has_reviews: true,
  tasks: [
    { id: 'p1', title: '写周报', parent_task_id: null, exists_locally: false, is_completed: false, due_date: '2026-12-01', source: 'agent' },
    { id: 'c1', title: '收集数据', parent_task_id: 'p1', exists_locally: true, is_completed: false, due_date: null, source: null },
    { id: 'p2', title: '已有任务', parent_task_id: null, exists_locally: true, is_completed: true, due_date: null, source: null },
  ],
};

function setup(preview: BackupPreview = PREVIEW) {
  const { repositories } = createMemoryRepositories();
  setRepositoriesForTesting(repositories);
  vi.spyOn(repositories.platform, 'chooseFiles').mockResolvedValue([SOURCE]);
  const inspect = vi.spyOn(repositories.settings, 'inspectBackup').mockResolvedValue(preview);
  const recover = vi
    .spyOn(repositories.settings, 'recoverFromBackup')
    .mockResolvedValue({ recovered: 1, replaced: 0, reviews_restored: 0 });
  return { repositories, inspect, recover };
}

async function openPreview() {
  fireEvent.click(await screen.findByTestId('recover-choose-file'));
  return screen.findByText('备份里有 3 个任务,其中 1 个当前库中没有。');
}

const checkedIds = () =>
  screen.getAllByTestId('recover-task-row').map((row) => ({
    title: within(row).getByRole('checkbox').getAttribute('aria-label'),
    checked: (within(row).getByRole('checkbox') as HTMLInputElement).checked,
  }));

describe('RecoverFromBackupDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(async () => {
    resetRepositories();
    await i18n.changeLanguage('zh-CN');
  });

  it('默认只勾选当前库中没有的任务,已存在的不勾', async () => {
    setup();
    renderWithProviders(<RecoverFromBackupDialog open onClose={vi.fn()} />);

    await openPreview();

    expect(checkedIds()).toEqual([
      { title: '写周报', checked: true },
      { title: '收集数据', checked: false },
      { title: '已有任务', checked: false },
    ]);
    expect(screen.getByTestId('recover-selected-count')).toHaveTextContent('已勾选 1 项');
    expect(screen.getByText('库中没有')).toBeInTheDocument();
    expect(screen.getAllByText('已存在')).toHaveLength(2);
  });

  it('执行时只带回勾选的任务,不带回顾', async () => {
    const { recover, inspect } = setup();
    const onClose = vi.fn();
    renderWithProviders(<RecoverFromBackupDialog open onClose={onClose} />);

    await openPreview();
    fireEvent.click(screen.getByTestId('recover-submit'));

    await waitFor(() => expect(recover).toHaveBeenCalledWith(SOURCE, ['p1'], false));
    expect(inspect).toHaveBeenCalledWith(SOURCE);
    expect(toast.success).toHaveBeenCalledWith('已找回 1 个任务,替换 0 个');
    expect(onClose).toHaveBeenCalled();
  });

  it('勾选已存在的任务会提示将替换,并一并带回', async () => {
    const { recover } = setup();
    renderWithProviders(<RecoverFromBackupDialog open onClose={vi.fn()} />);

    await openPreview();
    expect(screen.queryByText(/会用备份里的版本替换当前版本/)).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: '已有任务' }));
    expect(screen.getByText(/会用备份里的版本替换当前版本/)).toBeInTheDocument();
    expect(screen.getByText('已勾选 2 项')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('recover-submit'));
    await waitFor(() => expect(recover).toHaveBeenCalledWith(SOURCE, ['p1', 'p2'], false));
  });

  it('备份里有回顾时才提供恢复回顾的选项', async () => {
    const { recover } = setup();
    renderWithProviders(<RecoverFromBackupDialog open onClose={vi.fn()} />);

    await openPreview();
    fireEvent.click(screen.getByRole('checkbox', { name: '同时恢复日/周回顾' }));
    fireEvent.click(screen.getByTestId('recover-submit'));

    await waitFor(() => expect(recover).toHaveBeenCalledWith(SOURCE, ['p1'], true));
  });

  it('备份里没有回顾时不显示该选项', async () => {
    setup({ ...PREVIEW, has_reviews: false });
    renderWithProviders(<RecoverFromBackupDialog open onClose={vi.fn()} />);

    await openPreview();
    expect(screen.queryByRole('checkbox', { name: '同时恢复日/周回顾' })).toBeNull();
  });

  it('可以一键勾选缺失的或清空;没有勾选时不能执行', async () => {
    const { recover } = setup();
    renderWithProviders(<RecoverFromBackupDialog open onClose={vi.fn()} />);

    await openPreview();
    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(screen.getByTestId('recover-submit')).toBeDisabled();
    expect(screen.getByText('已勾选 0 项')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '勾选库中没有的' }));
    expect(screen.getByTestId('recover-submit')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('recover-submit'));
    await waitFor(() => expect(recover).toHaveBeenCalledTimes(1));
  });

  it('在文件选择框里取消时停在第一步', async () => {
    const { repositories, inspect } = setup();
    vi.spyOn(repositories.platform, 'chooseFiles').mockResolvedValue([]);
    renderWithProviders(<RecoverFromBackupDialog open onClose={vi.fn()} />);

    fireEvent.click(await screen.findByTestId('recover-choose-file'));

    await waitFor(() => expect(repositories.platform.chooseFiles).toHaveBeenCalled());
    expect(inspect).not.toHaveBeenCalled();
    expect(screen.getByTestId('recover-choose-file')).toBeInTheDocument();
  });

  it('备份读不了时说明原因,不执行任何找回', async () => {
    const { recover, inspect } = setup();
    inspect.mockRejectedValue(new Error('Validation error: 不是 TodoFlow 的数据库文件'));
    const onClose = vi.fn();
    renderWithProviders(<RecoverFromBackupDialog open onClose={onClose} />);

    fireEvent.click(await screen.findByTestId('recover-choose-file'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('无法读取这份备份:不是 TodoFlow 的数据库文件'));
    expect(recover).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('recover-choose-file')).toBeInTheDocument();
  });

  it('找回失败时提示并保留预览,方便重试', async () => {
    const { recover } = setup();
    recover.mockRejectedValue(new Error('备份与本机存在同一回顾范围的不同文稿(week:2026-11-16),已拒绝找回'));
    const onClose = vi.fn();
    renderWithProviders(<RecoverFromBackupDialog open onClose={onClose} />);

    await openPreview();
    fireEvent.click(screen.getByRole('checkbox', { name: '同时恢复日/周回顾' }));
    fireEvent.click(screen.getByTestId('recover-submit'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('找回失败:备份与本机存在同一回顾范围的不同文稿(week:2026-11-16),已拒绝找回'),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('recover-submit')).not.toBeDisabled();
  });

  it('父任务在前、子任务缩进跟在后面', async () => {
    setup();
    renderWithProviders(<RecoverFromBackupDialog open onClose={vi.fn()} />);

    await openPreview();
    const titles = screen.getAllByTestId('recover-task-row').map((row) => within(row).getByRole('checkbox').getAttribute('aria-label'));
    expect(titles).toEqual(['写周报', '收集数据', '已有任务']);
  });

  it('切换到英文后文案跟着变', async () => {
    setup();
    await i18n.changeLanguage('en-US');
    renderWithProviders(<RecoverFromBackupDialog open onClose={vi.fn()} />);

    expect(await screen.findByRole('dialog', { name: 'Recover from backup' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId('recover-choose-file'));
    expect(await screen.findByText('The backup has 3 tasks; 1 of them are not in this workspace.')).toBeInTheDocument();
  });
});
