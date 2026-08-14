import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { SettingsPage } from '../../pages/SettingsPage';
import { buildTask, renderWithProviders } from '../test-utils';
import type { TaskNote } from '../../types/note';

const { dbMock, tasksState } = vi.hoisted(() => ({
  dbMock: {
    getTasks: vi.fn(),
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    backupDatabase: vi.fn(),
    exportCsv: vi.fn(),
    importDatabase: vi.fn(),
    openTaskNote: vi.fn(),
    closeTaskNote: vi.fn(),
    getAllTaskNotes: vi.fn(),
  },
  tasksState: { data: [] as any[] },
}));

vi.mock('../../lib/db', () => dbMock);

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => tasksState,
}));

function buildNote(overrides: Partial<TaskNote> = {}): TaskNote {
  return {
    task_id: 'task-1',
    x: null,
    y: null,
    width: 280,
    height: 300,
    always_on_top: false,
    style: 'minimal',
    collapsed: false,
    created_at: '2026-08-09 00:00:00',
    updated_at: '2026-08-09 00:00:00',
    ...overrides,
  };
}

describe('SettingsPage 桌面便签区块', () => {
  beforeEach(() => {
    tasksState.data = [];
    dbMock.getSetting.mockResolvedValue(null);
    dbMock.getTasks.mockResolvedValue([]);
    dbMock.openTaskNote.mockResolvedValue(undefined);
    dbMock.closeTaskNote.mockResolvedValue(undefined);
    dbMock.getAllTaskNotes.mockResolvedValue([]);
  });

  it('renders empty state and 0/8 counter when no notes', async () => {
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('还没有固定的便签。在任务右键菜单里选择『固定到桌面』即可创建。')).toBeInTheDocument();
    expect(screen.getByText('0/8')).toBeInTheDocument();
  });

  it('lists notes with task title, style label and status', async () => {
    tasksState.data = [
      buildTask({ id: 'task-1', title: '写周报' }),
      buildTask({ id: 'task-2', title: '买牛奶' }),
    ];
    dbMock.getAllTaskNotes.mockResolvedValue([
      buildNote({ task_id: 'task-1', style: 'glass', always_on_top: true }),
      buildNote({ task_id: 'task-2', style: 'paper', collapsed: true }),
    ]);
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('写周报')).toBeInTheDocument();
    expect(screen.getByText('买牛奶')).toBeInTheDocument();
    expect(screen.getByText('玻璃 · 置顶中')).toBeInTheDocument();
    expect(screen.getByText('便签纸 · 已折叠')).toBeInTheDocument();
    expect(screen.getByText('2/8')).toBeInTheDocument();
  });

  it('calls openTaskNote when clicking 定位', async () => {
    tasksState.data = [buildTask({ id: 'task-1', title: '写周报' })];
    dbMock.getAllTaskNotes.mockResolvedValue([buildNote({ task_id: 'task-1' })]);
    renderWithProviders(<SettingsPage />);
    const locateBtn = await screen.findByRole('button', { name: '定位' });
    fireEvent.click(locateBtn);
    await waitFor(() => {
      expect(dbMock.openTaskNote).toHaveBeenCalledWith('task-1');
    });
  });

  it('calls closeTaskNote and toasts when clicking 取消固定', async () => {
    tasksState.data = [buildTask({ id: 'task-1', title: '写周报' })];
    dbMock.getAllTaskNotes.mockResolvedValue([buildNote({ task_id: 'task-1' })]);
    renderWithProviders(<SettingsPage />);
    const unpinBtn = await screen.findByRole('button', { name: '取消固定' });
    fireEvent.click(unpinBtn);
    await waitFor(() => {
      expect(dbMock.closeTaskNote).toHaveBeenCalledWith('task-1');
    });
    expect(toast.success).toHaveBeenCalledWith('已取消固定');
  });

  it('shows amber limit hint when notes reach 8', async () => {
    dbMock.getAllTaskNotes.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => buildNote({ task_id: `task-${i + 1}` })),
    );
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('便签数量已达上限')).toBeInTheDocument();
    expect(screen.getByText('8/8')).toBeInTheDocument();
  });
});
