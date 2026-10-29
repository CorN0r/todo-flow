import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { BreakdownPanel } from '../../components/ai/BreakdownPanel';
import { renderWithProviders } from '../test-utils';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { useBreakdownStore } from '../../stores/breakdownStore';
import type { BreakdownProposal } from '../../domain/models/ai';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeProposal(overrides: Partial<BreakdownProposal> = {}): BreakdownProposal {
  return {
    proposal_id: 'prop-1',
    request_id: 'req-1',
    model_snapshot: '测试连接 (m)',
    assumptions: [],
    items: [
      { title: '梳理目标', instructions: '写下完成标准' },
      { title: '第一步', instructions: '确定动作' },
    ],
    used_stream: false,
    json_fallback: false,
    context_fingerprint: 'fp',
    ...overrides,
  };
}

function withRepositories(overrides: Record<string, unknown>) {
  const { repositories } = createMemoryRepositories();
  const ai = Object.assign({}, repositories.ai, overrides);
  setRepositoriesForTesting({ ...repositories, ai });
  return ai;
}

describe('BreakdownPanel(会话 store 驱动)', () => {
  beforeEach(() => {
    resetRepositories();
    useBreakdownStore.setState({ sessions: {} });
    vi.clearAllMocks();
  });

  it('生成前等待任务保存,失败则不发起生成', async () => {
    const generate = vi.fn();
    withRepositories({ generateBreakdown: generate });

    renderWithProviders(
      <BreakdownPanel taskId="t1" existingChildTitles={[]} onBeforeGenerate={() => Promise.reject(new Error('x'))} onClose={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByTestId('ai-breakdown-error')).toBeInTheDocument());
    expect(generate).not.toHaveBeenCalled();
    expect(screen.getByTestId('ai-breakdown-error').textContent).toContain('保存失败');
  });

  it('展示假设与候选;同名候选默认不勾选并提示', async () => {
    withRepositories({
      generateBreakdown: vi.fn().mockResolvedValue(makeProposal({ assumptions: ['默认三个工作日'] })),
    });

    renderWithProviders(
      <BreakdownPanel taskId="t1" existingChildTitles={['第一步']} onBeforeGenerate={() => Promise.resolve()} onClose={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByText(/默认三个工作日/)).toBeInTheDocument());

    expect(screen.getByText('同名')).toBeInTheDocument();
    expect(screen.getByText(/本次将添加 1 个子任务/)).toBeInTheDocument();
  });

  it('编辑标题后采纳:立即关闭,仅提交选中项,requestId 由前端生成', async () => {
    const apply = vi.fn().mockResolvedValue({ created_task_ids: ['n1', 'n2'], already_applied: false });
    const generate = vi.fn().mockResolvedValue(makeProposal());
    withRepositories({ generateBreakdown: generate, applyBreakdown: apply });
    const onClose = vi.fn();

    renderWithProviders(
      <BreakdownPanel taskId="t1" existingChildTitles={[]} onBeforeGenerate={() => Promise.resolve()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByText(/本次将添加 2 个子任务/)).toBeInTheDocument());

    const inputs = screen.getAllByRole('textbox');
    await userEvent.clear(inputs[1]);
    await userEvent.type(inputs[1], '改过的标题');
    await userEvent.click(screen.getByTestId('ai-breakdown-apply'));

    // 立即关闭,不等事务
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(apply).toHaveBeenCalled());
    const [proposalId, operationId, items] = apply.mock.calls[0];
    expect(proposalId).toBe('prop-1');
    expect(operationId).toMatch(/^op-/);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('改过的标题');
    expect(generate).toHaveBeenCalledWith('t1', undefined, expect.stringMatching(/^breakdown-/));
  });

  it('生成中卸载重挂:显示进行中与取消;结果回来后可查看', async () => {
    let release!: (v: BreakdownProposal) => void;
    const gate = new Promise<BreakdownProposal>((resolve) => { release = resolve; });
    withRepositories({ generateBreakdown: () => gate });

    const view = renderWithProviders(
      <BreakdownPanel taskId="t1" existingChildTitles={[]} onBeforeGenerate={() => Promise.resolve()} onClose={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByTestId('ai-breakdown-progress')).toBeInTheDocument());
    view.unmount();

    renderWithProviders(
      <BreakdownPanel taskId="t1" existingChildTitles={[]} onBeforeGenerate={() => Promise.resolve()} onClose={() => {}} />,
    );
    expect(screen.getByTestId('ai-breakdown-progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();

    await act(async () => {
      release(makeProposal({ assumptions: [], items: [{ title: '候选A', instructions: 'x' }] }));
    });
    await waitFor(() => expect(screen.getByTestId('ai-breakdown-apply')).toBeInTheDocument());
    expect(screen.getByDisplayValue('候选A')).toBeInTheDocument();
  });

  it('重新生成失败保留原候选', async () => {
    withRepositories({
      generateBreakdown: vi
        .fn()
        .mockResolvedValueOnce(makeProposal())
        .mockRejectedValueOnce({ code: 'connection_failed', message: '无法连接到模型服务' }),
    });

    renderWithProviders(
      <BreakdownPanel taskId="t1" existingChildTitles={[]} onBeforeGenerate={() => Promise.resolve()} onClose={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByText(/本次将添加 2 个子任务/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /重新生成/ }));
    await waitFor(() => expect(screen.getByTestId('ai-breakdown-error')).toBeInTheDocument());
    // 原候选仍在且可采纳
    expect(screen.getByDisplayValue('梳理目标')).toBeInTheDocument();
    expect(screen.getByTestId('ai-breakdown-apply')).toBeInTheDocument();
  });

  it('采纳冲突(上下文变化)经 toast 反馈,面板立即关闭', async () => {
    const { toast } = await import('sonner');
    withRepositories({
      generateBreakdown: vi.fn().mockResolvedValue(makeProposal()),
      applyBreakdown: vi.fn().mockRejectedValue({
        code: 'context_changed',
        message: '生成后任务内容发生了变化,请基于当前内容重新生成',
      }),
    });
    const onClose = vi.fn();

    renderWithProviders(
      <BreakdownPanel taskId="t1" existingChildTitles={[]} onBeforeGenerate={() => Promise.resolve()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByTestId('ai-breakdown-apply')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('ai-breakdown-apply'));

    expect(onClose).toHaveBeenCalled();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('生成后任务内容发生了变化,请基于当前内容重新生成'),
    );
  });

  it('生成中进度框显示已等待秒数与等待状态', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    withRepositories({
      generateBreakdown: () => gate.then(() =>
        Promise.reject({ code: 'cancelled', message: '已取消' }) as never,
      ),
    });

    renderWithProviders(
      <BreakdownPanel taskId="t1" existingChildTitles={[]} onBeforeGenerate={() => Promise.resolve()} onClose={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByTestId('ai-breakdown-progress')).toBeInTheDocument());
    expect(screen.getByTestId('ai-breakdown-progress').textContent).toContain('已等待');
    expect(screen.getByTestId('ai-breakdown-progress').textContent).toContain('等待模型响应');

    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByTestId('ai-breakdown-progress')).not.toBeInTheDocument());
  });

  it('润色生成中(otherBusy):生成按钮禁用,不发起请求', async () => {
    const generate = vi.fn();
    withRepositories({ generateBreakdown: generate });

    renderWithProviders(
      <BreakdownPanel taskId="t1" existingChildTitles={[]} onBeforeGenerate={() => Promise.resolve()} onClose={() => {}} otherBusy />,
    );
    const btn = screen.getByRole('button', { name: /生成/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await userEvent.click(btn).catch(() => {});
    expect(generate).not.toHaveBeenCalled();
  });
});
