import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { screen, fireEvent, render, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubtaskDescription } from '../../components/tasks/SubtaskDescription';
import { TaskCard } from '../../components/tasks/TaskCard';
import { TaskDetail } from '../../components/tasks/TaskDetail';
import { renderWithProviders, buildTask } from '../test-utils';
import { toast } from 'sonner';

// ─── 共享 mock 状态(vi.hoisted 使 vi.mock 工厂可引用) ───
const mocks = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  // 模拟 TanStack mutate 语义:传入 onSuccess 时同步执行,驱动删除后的 toast/撤销链路
  deleteMutate: vi.fn((_id: string, opts?: { onSuccess?: () => void }) => { opts?.onSuccess?.(); }),
  createMutate: vi.fn(),
  createMutateAsync: vi.fn(() => Promise.resolve({ id: 'rebuilt' })),
  reorderMutate: vi.fn(),
  detail: null as { task: any; children: any[] } | null,
  store: {
    selectedTaskId: null as string | null,
    setSelectedTaskId: vi.fn(),
    selectionMode: false,
    selectedTaskIds: new Set<string>(),
    enterSelectionMode: vi.fn(),
    toggleTaskSelection: vi.fn(),
    theme: 'light' as const,
    globalSubtasksExpanded: false,
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
  Toaster: () => null,
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: Object.assign(
    vi.fn((selector?: any) => {
      if (typeof selector === 'function') return selector(mocks.store);
      return mocks.store;
    }),
    { getState: () => mocks.store, subscribe: () => () => {} },
  ),
}));

vi.mock('../../hooks/useTasks', () => ({
  useUpdateTask: () => ({ mutate: mocks.updateMutate }),
  useDeleteTask: () => ({ mutate: mocks.deleteMutate }),
  useCreateTask: () => ({ mutate: mocks.createMutate, mutateAsync: mocks.createMutateAsync }),
  useReorderTasks: () => ({ mutate: mocks.reorderMutate }),
  useToggleMyDay: () => vi.fn(),
  useTaskReminders: () => ({ data: [] }),
  useTask: () => ({ data: mocks.detail, isLoading: false }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: null, isLoading: false }),
}));

vi.mock('../../hooks/useTaskNotes', () => ({
  useTaskNotes: () => ({ data: [] }),
  useToggleTaskNote: () => vi.fn(),
}));

// 避免 Tiptap 全家桶加载;描述编辑器不在本次验收范围
vi.mock('../../components/shared/RichTextEditor', () => ({
  RichTextEditor: () => <div data-testid="rich-editor" />,
}));

const childWithDesc = buildTask({
  id: 'c1', title: '调研竞品价格', parent_task_id: 't1', description: '比较京东/淘宝/拼多多三家价格',
});
const childNoDesc = buildTask({ id: 'c2', title: '整理预算表', parent_task_id: 't1', description: '' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.selectedTaskId = null;
  mocks.store.selectionMode = false;
  mocks.store.selectedTaskIds = new Set();
});

// editing 是受控 prop,用带 state 的 Harness 模拟真实父级联动
function Harness({ taskId, description }: { taskId: string; description: string }) {
  const [editing, setEditing] = useState(false);
  return <SubtaskDescription taskId={taskId} description={description} editing={editing} onEditingChange={setEditing} />;
}

// ─── 1. SubtaskDescription 组件 ───
describe('SubtaskDescription', () => {
  it('有描述时渲染单行预览(HTML 经 stripHtml 转纯文本)', () => {
    renderWithProviders(<SubtaskDescription taskId="c1" description="<p>比较三家价格</p>" editing={false} onEditingChange={() => {}} />);
    expect(screen.getByText('比较三家价格')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('添加执行说明...')).not.toBeInTheDocument();
  });

  it('无描述且非编辑态不渲染任何内容', () => {
    const { container } = renderWithProviders(<SubtaskDescription taskId="c2" description="" editing={false} onEditingChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('点击预览进入编辑,textarea 初值为纯文本且聚焦', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness taskId="c1" description="比较三家价格" />);
    await user.click(screen.getByText('比较三家价格'));
    const textarea = screen.getByPlaceholderText('添加执行说明...');
    expect(textarea).toHaveValue('比较三家价格');
    expect(textarea).toHaveFocus();
  });

  it('编辑后失焦且有变化才保存', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness taskId="c1" description="旧说明" />);
    await user.click(screen.getByText('旧说明'));
    const textarea = screen.getByPlaceholderText('添加执行说明...');
    await user.clear(textarea);
    await user.type(textarea, '新说明');
    fireEvent.blur(textarea);
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      { id: 'c1', description: '新说明' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('失焦但内容未变时不触发保存', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness taskId="c1" description="原样" />);
    await user.click(screen.getByText('原样'));
    fireEvent.blur(screen.getByPlaceholderText('添加执行说明...'));
    expect(mocks.updateMutate).not.toHaveBeenCalled();
  });

  it('Esc 取消编辑不保存', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness taskId="c1" description="原说明" />);
    await user.click(screen.getByText('原说明'));
    const textarea = screen.getByPlaceholderText('添加执行说明...');
    await user.clear(textarea);
    await user.type(textarea, '被放弃的修改');
    await user.type(textarea, '{Escape}');
    expect(mocks.updateMutate).not.toHaveBeenCalled();
  });

  it('父级入口触发(editing=true)时空描述也直接进入编辑,输入后失焦保存', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubtaskDescription taskId="c2" description="" editing onEditingChange={() => {}} />);
    const textarea = screen.getByPlaceholderText('添加执行说明...');
    await user.type(textarea, '首次添加的说明');
    fireEvent.blur(textarea);
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      { id: 'c2', description: '首次添加的说明' },
      expect.anything(),
    );
  });

  it('清空描述后失焦保存空字符串', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness taskId="c1" description="将被清空" />);
    await user.click(screen.getByText('将被清空'));
    const textarea = screen.getByPlaceholderText('添加执行说明...');
    await user.clear(textarea);
    fireEvent.blur(textarea);
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      { id: 'c1', description: '' },
      expect.anything(),
    );
  });
});

// ─── 2. TaskCard 子任务展开区 ───
describe('TaskCard 子任务描述', () => {
  const parentTask = buildTask({ id: 't1', title: '主任务', children: [childWithDesc] });

  async function expandSubtasks() {
    const user = userEvent.setup();
    renderWithProviders(<TaskCard task={parentTask} />);
    await user.click(screen.getByLabelText('展开子任务'));
    return user;
  }

  it('展开子任务后显示描述预览,行尾提供编辑描述图标', async () => {
    await expandSubtasks();
    expect(screen.getByText('比较京东/淘宝/拼多多三家价格')).toBeInTheDocument();
    expect(screen.getByTitle('编辑描述')).toBeInTheDocument();
  });

  it('点击预览展开编辑,失焦后调用 updateTask 保存描述', async () => {
    const user = await expandSubtasks();
    await user.click(screen.getByText('比较京东/淘宝/拼多多三家价格'));
    const textarea = screen.getByPlaceholderText('添加执行说明...');
    await user.clear(textarea);
    await user.type(textarea, '改成只看京东');
    fireEvent.blur(textarea);
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      { id: 'c1', description: '改成只看京东' },
      expect.anything(),
    );
  });

  it('右键菜单含"编辑描述"项,点击后进入描述编辑', async () => {
    const user = await expandSubtasks();
    fireEvent.contextMenu(screen.getByText('调研竞品价格'));
    await user.click(screen.getByText('编辑描述'));
    expect(screen.getByPlaceholderText('添加执行说明...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('添加执行说明...')).toHaveValue('比较京东/淘宝/拼多多三家价格');
  });

  it('删除子任务后点撤销,重建时带回描述', async () => {
    const user = await expandSubtasks();
    fireEvent.contextMenu(screen.getByText('调研竞品价格'));
    await user.click(screen.getByText('删除'));
    expect(mocks.deleteMutate).toHaveBeenCalledWith('c1');
    expect(toast.success).toHaveBeenCalled();
    // toast 内容被 mock,手动渲染捕获到的 JSX 拿到撤销按钮
    const toastContent = vi.mocked(toast.success).mock.calls[0][0] as any;
    const { getByText } = render(<div>{typeof toastContent === 'function' ? toastContent() : toastContent}</div>);
    await user.click(getByText('撤销'));
    expect(mocks.createMutate).toHaveBeenCalledWith(expect.objectContaining({
      title: '调研竞品价格',
      description: '比较京东/淘宝/拼多多三家价格',
      parent_task_id: 't1',
    }));
  });
});

// ─── 3. TaskDetail 子任务区 ───
describe('TaskDetail 子任务描述', () => {
  beforeEach(() => {
    mocks.detail = { task: buildTask({ id: 't1', title: '主任务' }), children: [childWithDesc, childNoDesc] };
    mocks.store.selectedTaskId = 't1';
  });

  it('子任务行显示描述预览;无描述的子任务不显示', () => {
    renderWithProviders(<TaskDetail />);
    expect(screen.getByText('比较京东/淘宝/拼多多三家价格')).toBeInTheDocument();
    const rowNoDesc = screen.getByText('整理预算表').closest('.group') as HTMLElement;
    expect(within(rowNoDesc).queryByText(/比较京东/)).not.toBeInTheDocument();
  });

  it('点击预览展开编辑,失焦保存到对应子任务', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskDetail />);
    await user.click(screen.getByText('比较京东/淘宝/拼多多三家价格'));
    const textarea = screen.getByPlaceholderText('添加执行说明...');
    await user.clear(textarea);
    await user.type(textarea, '详情面板里改的');
    fireEvent.blur(textarea);
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      { id: 'c1', description: '详情面板里改的' },
      expect.anything(),
    );
  });

  it('行尾 hover 图标可给无描述子任务添加描述', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskDetail />);
    const rowNoDesc = screen.getByText('整理预算表').closest('.group') as HTMLElement;
    await user.click(within(rowNoDesc).getByTitle('编辑描述'));
    const textarea = within(rowNoDesc).getByPlaceholderText('添加执行说明...');
    await user.type(textarea, '新加的执行说明');
    fireEvent.blur(textarea);
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      { id: 'c2', description: '新加的执行说明' },
      expect.anything(),
    );
  });

  it('删除子任务后撤销,重建带回描述', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskDetail />);
    const rowWithDesc = screen.getByText('调研竞品价格').closest('.group') as HTMLElement;
    await user.click(within(rowWithDesc).getByLabelText('删除子任务'));
    expect(mocks.deleteMutate).toHaveBeenCalledWith('c1', expect.objectContaining({ onSuccess: expect.any(Function) }));
    const toastContent = vi.mocked(toast.success).mock.calls[0][0] as any;
    const { getByText } = render(<div>{typeof toastContent === 'function' ? toastContent() : toastContent}</div>);
    await user.click(getByText('撤销'));
    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        title: '调研竞品价格',
        description: '比较京东/淘宝/拼多多三家价格',
      }));
    });
  });
});
