import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { emit } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { SettingsPage } from '../../pages/SettingsPage';
import { buildTask, renderWithProviders } from '../test-utils';
import type { TaskNote } from '../../types/note';

const { dbMock, tasksState, shellOpenMock } = vi.hoisted(() => ({
  dbMock: {
    getTasks: vi.fn(),
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    backupDatabase: vi.fn(),
    exportCsv: vi.fn(),
    openTaskNote: vi.fn(),
    closeTaskNote: vi.fn(),
    getAllTaskNotes: vi.fn(),
    getHistoryRetention: vi.fn().mockResolvedValue(true),
    setHistoryRetention: vi.fn().mockResolvedValue(undefined),
    clearStateEventsRange: vi.fn().mockResolvedValue(0),
  },
  tasksState: { data: [] as any[] },
  shellOpenMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/db', () => dbMock);

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => tasksState,
}));

vi.mock('@tauri-apps/api/app', () => ({
  getName: vi.fn().mockResolvedValue('TodoFlow'),
  getVersion: vi.fn().mockResolvedValue('0.10.0'),
  getTauriVersion: vi.fn().mockResolvedValue('2.11.0'),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: shellOpenMock,
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

function openTab(label: string) {
  fireEvent.click(screen.getByRole('tab', { name: label }));
}

describe('SettingsPage 分组导航', () => {
  beforeEach(() => {
    tasksState.data = [];
    dbMock.getSetting.mockResolvedValue(null);
    dbMock.setSetting.mockResolvedValue(undefined);
    dbMock.getTasks.mockResolvedValue([]);
    dbMock.getAllTaskNotes.mockResolvedValue([]);
  });

  it('默认展示「常规」分组，可切换到各个配置分组', () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByRole('tab', { name: '常规' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('外观主题')).toBeInTheDocument();
    expect(screen.getByText('开机启动')).toBeInTheDocument();

    openTab('番茄钟');
    expect(screen.getByRole('tab', { name: '番茄钟' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('专注时长')).toBeInTheDocument();

    openTab('快捷键');
    expect(screen.getByText('启用快捷键')).toBeInTheDocument();

    openTab('关于');
    expect(screen.getByTestId('about-version-badge')).toHaveTextContent('v0.10.0');
  });
});

describe('SettingsPage 桌面组件 - 悬浮球大小', () => {
  beforeEach(() => {
    tasksState.data = [];
    dbMock.getSetting.mockImplementation((key: string) => {
      if (key === 'widget_bubble_size') return Promise.resolve('36');
      return Promise.resolve(null);
    });
    dbMock.setSetting.mockResolvedValue(undefined);
    dbMock.getAllTaskNotes.mockResolvedValue([]);
  });

  it('读取已保存的悬浮球大小并更新预览与滑块', async () => {
    renderWithProviders(<SettingsPage initialSection="desktop" />);
    expect(await screen.findByTestId('bubble-size-value')).toHaveTextContent('36 px');
    const preview = screen.getByTestId('bubble-size-preview');
    expect(preview).toHaveStyle({ width: '36px', height: '36px' });
  });

  it('点击预设档位与拖动滑块时保存配置并广播 bubble-size-changed', async () => {
    renderWithProviders(<SettingsPage initialSection="desktop" />);
    await screen.findByTestId('bubble-size-value');

    fireEvent.click(screen.getByRole('button', { name: /迷你/ }));
    expect(screen.getByTestId('bubble-size-value')).toHaveTextContent('32 px');
    expect(dbMock.setSetting).toHaveBeenCalledWith('widget_bubble_size', '32');
    expect(emit).toHaveBeenCalledWith('bubble-size-changed', 32);

    const slider = screen.getByRole('slider', { name: '悬浮球大小' });
    fireEvent.change(slider, { target: { value: '44' } });
    expect(screen.getByTestId('bubble-size-value')).toHaveTextContent('44 px');
    expect(dbMock.setSetting).toHaveBeenCalledWith('widget_bubble_size', '44');
    expect(emit).toHaveBeenCalledWith('bubble-size-changed', 44);
  });
});

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
    renderWithProviders(<SettingsPage initialSection="desktop" />);
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
    renderWithProviders(<SettingsPage initialSection="desktop" />);
    expect(await screen.findByText('写周报')).toBeInTheDocument();
    expect(screen.getByText('买牛奶')).toBeInTheDocument();
    expect(screen.getByText('玻璃 · 置顶中')).toBeInTheDocument();
    expect(screen.getByText('便签纸 · 已折叠')).toBeInTheDocument();
    expect(screen.getByText('2/8')).toBeInTheDocument();
  });

  it('calls openTaskNote when clicking 定位', async () => {
    tasksState.data = [buildTask({ id: 'task-1', title: '写周报' })];
    dbMock.getAllTaskNotes.mockResolvedValue([buildNote({ task_id: 'task-1' })]);
    renderWithProviders(<SettingsPage initialSection="desktop" />);
    const locateBtn = await screen.findByRole('button', { name: '定位' });
    fireEvent.click(locateBtn);
    await waitFor(() => {
      expect(dbMock.openTaskNote).toHaveBeenCalledWith('task-1');
    });
  });

  it('calls closeTaskNote and toasts when clicking 取消固定', async () => {
    tasksState.data = [buildTask({ id: 'task-1', title: '写周报' })];
    dbMock.getAllTaskNotes.mockResolvedValue([buildNote({ task_id: 'task-1' })]);
    renderWithProviders(<SettingsPage initialSection="desktop" />);
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
    renderWithProviders(<SettingsPage initialSection="desktop" />);
    expect(await screen.findByText('便签数量已达上限')).toBeInTheDocument();
    expect(screen.getByText('8/8')).toBeInTheDocument();
  });
});

describe('SettingsPage 数据区', () => {
  beforeEach(() => {
    dbMock.getSetting.mockResolvedValue(null);
  });

  it('不再有"导入数据库",改为"从备份找回"和"管理工作区"两个入口', async () => {
    renderWithProviders(<SettingsPage initialSection="data" />);
    expect(await screen.findByTestId('settings-recover')).toBeInTheDocument();
    expect(screen.getByTestId('settings-manage-workspaces')).toBeInTheDocument();
    expect(screen.queryByText('导入数据库')).toBeNull();
  });

  it('点击"从备份找回"打开先预览的对话框', async () => {
    renderWithProviders(<SettingsPage initialSection="data" />);
    fireEvent.click(await screen.findByTestId('settings-recover'));
    expect(await screen.findByRole('dialog', { name: '从备份找回' })).toBeInTheDocument();
    expect(screen.getByTestId('recover-choose-file')).toBeInTheDocument();
  });
});

describe('SettingsPage 关于区', () => {
  beforeEach(() => {
    shellOpenMock.mockClear();
  });

  it('展示软件版本、框架、协议并支持打开项目链接与复制诊断信息', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderWithProviders(<SettingsPage initialSection="about" />);
    expect(await screen.findByText('Tauri v2.11.0')).toBeInTheDocument();
    expect(screen.getByTestId('about-version-badge')).toHaveTextContent('v0.10.0');
    expect(screen.getByText('MIT License')).toBeInTheDocument();
    expect(screen.getByText('com.todoflow.desktop')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /项目仓库/ }));
    await waitFor(() => {
      expect(shellOpenMock).toHaveBeenCalledWith('https://gitcode.com/CorN0r/todo-flow');
    });

    fireEvent.click(screen.getByRole('button', { name: '复制版本信息' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('TodoFlow v0.10.0'));
    });
  });
});
