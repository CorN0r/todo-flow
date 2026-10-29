import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { PolishPanel } from '../../../components/ai/PolishPanel';
import { renderWithProviders } from '../../test-utils';
import { setRepositoriesForTesting, resetRepositories } from '../../../domain/repositories/current';
import { createMemoryRepositories } from '../../../domain/adapters/memory';
import { usePolishStore } from '../../../stores/polishStore';

function mockResolveWith(text: string) {
  return vi.fn().mockResolvedValue({ request_id: 'polish-r1', model_snapshot: '测试 (m)', text });
}

describe('PolishPanel(会话 store 驱动)', () => {
  beforeEach(() => {
    resetRepositories();
    usePolishStore.setState({ sessions: {} });
    vi.restoreAllMocks();
  });

  it('保存失败时会话标记错误,不发起生成', async () => {
    const { repositories } = createMemoryRepositories();
    const polish = vi.fn();
    setRepositoriesForTesting({ ...repositories, ai: { ...repositories.ai, polishDescription: polish } });

    renderWithProviders(
      <PolishPanel taskId="t1" currentDescriptionText="原始" onBeforeGenerate={() => Promise.reject(new Error('x'))} onAdopt={vi.fn()} onClose={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /开始润色/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-error')).toBeInTheDocument());
    expect(polish).not.toHaveBeenCalled();
  });

  it('生成完成展示可编辑预览;采纳立即关闭并仅传包装文本', async () => {
    const { repositories } = createMemoryRepositories();
    setRepositoriesForTesting({ ...repositories, ai: { ...repositories.ai, polishDescription: mockResolveWith('第一段\n\n第二段') } });
    const onAdopt = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <PolishPanel taskId="t1" currentDescriptionText="" onBeforeGenerate={() => Promise.resolve()} onAdopt={onAdopt} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成描述/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-draft')).toBeInTheDocument());

    const draft = screen.getByTestId('ai-polish-draft') as HTMLTextAreaElement;
    await userEvent.clear(draft);
    await userEvent.type(draft, '改后的说明');
    await userEvent.click(screen.getByTestId('ai-polish-adopt'));

    expect(onAdopt).toHaveBeenCalledWith('<p>改后的说明</p>');
    expect(onClose).toHaveBeenCalled();
    // 采纳后会话清除
    expect(usePolishStore.getState().sessions.t1).toBeUndefined();
  });

  it('生成中离开再进入:显示进行中状态与取消,结果回来后可查看', async () => {
    const { repositories } = createMemoryRepositories();
    let release!: (v: { request_id: string; model_snapshot: string; text: string }) => void;
    const gate = new Promise((resolve) => { release = resolve; });
    setRepositoriesForTesting({
      ...repositories,
      ai: { ...repositories.ai, polishDescription: () => gate },
    });

    const view = renderWithProviders(
      <PolishPanel taskId="t1" currentDescriptionText="原始" onBeforeGenerate={() => Promise.resolve()} onAdopt={vi.fn()} onClose={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /开始润色/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-progress')).toBeInTheDocument());

    // 离开详情(卸载)再回来(重挂载)
    view.unmount();
    renderWithProviders(
      <PolishPanel taskId="t1" currentDescriptionText="原始" onBeforeGenerate={() => Promise.resolve()} onAdopt={vi.fn()} onClose={() => {}} />,
    );
    // 重进后仍能看到进行中状态与取消入口
    expect(screen.getByTestId('ai-polish-progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();

    await act(async () => {
      release({ request_id: 'polish-r1', model_snapshot: '测试 (m)', text: '后台完成的结果' });
    });
    await waitFor(() => expect(screen.getByTestId('ai-polish-draft')).toBeInTheDocument());
    expect((screen.getByTestId('ai-polish-draft') as HTMLTextAreaElement).value).toBe('后台完成的结果');
  });

  it('生成后描述有改动:提示基于旧内容', async () => {
    const { repositories } = createMemoryRepositories();
    setRepositoriesForTesting({ ...repositories, ai: { ...repositories.ai, polishDescription: mockResolveWith('结果') } });

    const view = renderWithProviders(
      <PolishPanel taskId="t1" currentDescriptionText="旧描述" onBeforeGenerate={() => Promise.resolve()} onAdopt={vi.fn()} onClose={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /开始润色/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-draft')).toBeInTheDocument());
    view.unmount();

    // 重新进入时描述已被(比如)手动改过
    renderWithProviders(
      <PolishPanel taskId="t1" currentDescriptionText="被改过的描述" onBeforeGenerate={() => Promise.resolve()} onAdopt={vi.fn()} onClose={() => {}} />,
    );
    expect(screen.getByTestId('ai-polish-stale')).toBeInTheDocument();
    expect((screen.getByTestId('ai-polish-draft') as HTMLTextAreaElement).value).toBe('结果');
  });

  it('失败后可重试', async () => {
    const { repositories } = createMemoryRepositories();
    const polish = vi.fn()
      .mockRejectedValueOnce({ code: 'timeout', message: '请求超时' })
      .mockResolvedValueOnce({ request_id: 'polish-r2', model_snapshot: '测试 (m)', text: '成功结果' });
    setRepositoriesForTesting({ ...repositories, ai: { ...repositories.ai, polishDescription: polish } });

    renderWithProviders(
      <PolishPanel taskId="t1" currentDescriptionText="x" onBeforeGenerate={() => Promise.resolve()} onAdopt={vi.fn()} onClose={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /开始润色/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-error')).toBeInTheDocument());
    expect(screen.getByTestId('ai-polish-error').textContent).toContain('请求超时');

    await userEvent.click(screen.getByRole('button', { name: /重试/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-draft')).toBeInTheDocument());
  });
});
