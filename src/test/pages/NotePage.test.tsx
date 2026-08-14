import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { NotePage } from '../../pages/NotePage';
import { buildTask, renderWithProviders } from '../test-utils';

const { dbMock, updateTaskMock, taskDetailState } = vi.hoisted(() => ({
  dbMock: {
    getTaskNote: vi.fn(),
    getSetting: vi.fn(),
    closeTaskNote: vi.fn(),
    setNoteAlwaysOnTop: vi.fn(),
    setNoteStyle: vi.fn(),
    setNoteCollapsed: vi.fn(),
  },
  updateTaskMock: { mutate: vi.fn() },
  taskDetailState: { data: null as any },
}));

vi.mock('../../lib/db', () => dbMock);

vi.mock('../../hooks/useTasks', () => ({
  useTask: () => taskDetailState,
  useUpdateTask: () => updateTaskMock,
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

const NOTE = {
  task_id: 'task-1',
  x: 100,
  y: 100,
  width: 280,
  height: 300,
  always_on_top: false,
  style: 'minimal',
  collapsed: false,
  created_at: '2026-08-09 00:00:00',
  updated_at: '2026-08-09 00:00:00',
};

function setupTaskDetail() {
  const task = buildTask({ id: 'task-1', title: '写周报' });
  const children = [
    buildTask({ id: 'sub-1', title: '收集数据', is_completed: true, parent_task_id: 'task-1' }),
    buildTask({ id: 'sub-2', title: '整理图表', is_completed: false, parent_task_id: 'task-1' }),
  ];
  taskDetailState.data = { task, children };
}

describe('NotePage', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/?note=task-1');
    taskDetailState.data = null;
    dbMock.getTaskNote.mockResolvedValue(NOTE);
    dbMock.getSetting.mockResolvedValue(null);
    dbMock.closeTaskNote.mockResolvedValue(undefined);
    dbMock.setNoteAlwaysOnTop.mockResolvedValue(undefined);
    dbMock.setNoteStyle.mockResolvedValue(undefined);
    dbMock.setNoteCollapsed.mockResolvedValue(undefined);
  });

  it('renders title, progress and subtask list', async () => {
    setupTaskDetail();
    renderWithProviders(<NotePage />);
    expect(await screen.findByText('写周报')).toBeInTheDocument();
    // 进度环数字随 spring 从 0 生长,用 findBy 等动画走到当前值
    expect(await screen.findByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('收集数据')).toBeInTheDocument();
    expect(screen.getByText('整理图表')).toBeInTheDocument();
  });

  it('toggles subtask completion via updateTask', async () => {
    setupTaskDetail();
    renderWithProviders(<NotePage />);
    const checkbox = await screen.findByRole('button', { name: '标记子任务完成 "整理图表"' });
    fireEvent.click(checkbox);
    expect(updateTaskMock.mutate).toHaveBeenCalledWith({ id: 'sub-2', is_completed: true });
  });

  it('calls closeTaskNote when clicking the close button', async () => {
    setupTaskDetail();
    renderWithProviders(<NotePage />);
    const closeBtn = await screen.findByTitle('关闭便签');
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(dbMock.closeTaskNote).toHaveBeenCalledWith('task-1');
    });
  });

  it('calls setNoteAlwaysOnTop when clicking the pin button', async () => {
    setupTaskDetail();
    renderWithProviders(<NotePage />);
    const pinBtn = await screen.findByTitle('置顶');
    fireEvent.click(pinBtn);
    await waitFor(() => {
      expect(dbMock.setNoteAlwaysOnTop).toHaveBeenCalledWith('task-1', true);
    });
  });

  it('opens context menu on right-click and switches skin via setNoteStyle', async () => {
    setupTaskDetail();
    renderWithProviders(<NotePage />);
    const card = await screen.findByTestId('note-card');
    expect(card).toHaveAttribute('data-style', 'minimal');

    fireEvent.contextMenu(card);
    const glassItem = await screen.findByText('玻璃');
    // 切换后后续 refetch 返回新皮肤
    dbMock.getTaskNote.mockResolvedValue({ ...NOTE, style: 'glass' });
    fireEvent.click(glassItem);

    await waitFor(() => {
      expect(dbMock.setNoteStyle).toHaveBeenCalledWith('task-1', 'glass');
    });
    await waitFor(() => {
      expect(screen.getByTestId('note-card')).toHaveAttribute('data-style', 'glass');
    });
    expect(screen.getByTestId('note-card').className).toContain('rounded-[20px]');
  });

  it('closes the context menu on outside mousedown', async () => {
    setupTaskDetail();
    renderWithProviders(<NotePage />);
    const card = await screen.findByTestId('note-card');
    fireEvent.contextMenu(card);
    expect(await screen.findByText('置顶显示')).toBeInTheDocument();
    // 外点(点在卡片上,菜单外):capture 阶段监听应先于任何冒泡拦截关闭菜单
    fireEvent.mouseDown(card);
    await waitFor(() => {
      expect(screen.queryByText('置顶显示')).not.toBeInTheDocument();
    });
  });

  it('toggles always-on-top from the context menu', async () => {
    setupTaskDetail();
    renderWithProviders(<NotePage />);
    const card = await screen.findByTestId('note-card');
    fireEvent.contextMenu(card);
    const pinItem = await screen.findByText('置顶显示');
    fireEvent.click(pinItem);
    await waitFor(() => {
      expect(dbMock.setNoteAlwaysOnTop).toHaveBeenCalledWith('task-1', true);
    });
  });

  it('shows a hint when the note param is missing', async () => {
    window.history.pushState({}, '', '/');
    setupTaskDetail();
    renderWithProviders(<NotePage />);
    expect(await screen.findByText('便签缺少任务参数')).toBeInTheDocument();
  });

  it('collapses to a minibar via the collapse button', async () => {
    setupTaskDetail();
    renderWithProviders(<NotePage />);
    const collapseBtn = await screen.findByRole('button', { name: '折叠便签' });
    // 点击后 refetch 返回折叠态
    dbMock.getTaskNote.mockResolvedValue({ ...NOTE, collapsed: true });
    fireEvent.click(collapseBtn);
    await waitFor(() => {
      expect(dbMock.setNoteCollapsed).toHaveBeenCalledWith('task-1', true);
    });
    const bar = await screen.findByTestId('note-minibar');
    expect(bar).toHaveTextContent('写周报');
  });

  it('renders minibar when collapsed and expands on click', async () => {
    setupTaskDetail();
    dbMock.getTaskNote.mockResolvedValue({ ...NOTE, collapsed: true });
    renderWithProviders(<NotePage />);
    const bar = await screen.findByTestId('note-minibar');
    expect(bar).toHaveTextContent('写周报');

    dbMock.getTaskNote.mockResolvedValue({ ...NOTE, collapsed: false });
    fireEvent.click(bar);
    await waitFor(() => {
      expect(dbMock.setNoteCollapsed).toHaveBeenCalledWith('task-1', false);
    });
    expect(await screen.findByTestId('note-card')).toBeInTheDocument();
  });

  it('toggles collapse from the context menu', async () => {
    setupTaskDetail();
    renderWithProviders(<NotePage />);
    const card = await screen.findByTestId('note-card');
    fireEvent.contextMenu(card);
    fireEvent.click(await screen.findByText('折叠便签'));
    await waitFor(() => {
      expect(dbMock.setNoteCollapsed).toHaveBeenCalledWith('task-1', true);
    });
  });

  it('shows a celebration ripple when the last subtask completes', async () => {
    setupTaskDetail();
    const { rerender } = renderWithProviders(<NotePage />);
    await screen.findByText('写周报');

    taskDetailState.data = {
      task: buildTask({ id: 'task-1', title: '写周报' }),
      children: [
        buildTask({ id: 'sub-1', title: '收集数据', is_completed: true, parent_task_id: 'task-1' }),
        buildTask({ id: 'sub-2', title: '整理图表', is_completed: true, parent_task_id: 'task-1' }),
      ],
    };
    rerender(<NotePage />);
    expect(await screen.findByTestId('note-celebration')).toBeInTheDocument();
  });

  it('breathes the glass top band when overdue', async () => {
    taskDetailState.data = {
      task: buildTask({ id: 'task-1', title: '写周报', due_date: '2020-01-01' }),
      children: [],
    };
    dbMock.getTaskNote.mockResolvedValue({ ...NOTE, style: 'glass' });
    renderWithProviders(<NotePage />);
    expect(await screen.findByText(/已逾期/)).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('.note-overdue-breath')).not.toBeNull();
    });
  });
});
