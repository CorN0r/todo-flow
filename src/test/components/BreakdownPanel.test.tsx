import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from "../test-utils";
import userEvent from '@testing-library/user-event';
import { BreakdownPanel } from '../../components/ai/BreakdownPanel';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import type { BreakdownProposal } from '../../domain/models/ai';

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

describe('BreakdownPanel', () => {
  beforeEach(() => {
    resetRepositories();
    vi.restoreAllMocks();
  });

  it('生成前等待任务保存,保存失败则不发起生成', async () => {
    const { repositories } = createMemoryRepositories();
    const generateSpy = vi.spyOn(repositories.ai, 'generateBreakdown');
    setRepositoriesForTesting(repositories);

    renderWithProviders(
      <BreakdownPanel
        taskId="t1"
        existingChildTitles={[]}
        onBeforeGenerate={() => Promise.reject(new Error('save failed'))}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByTestId('ai-breakdown-error')).toBeInTheDocument());
    expect(generateSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('ai-breakdown-error').textContent).toContain('保存失败');
  });

  it('展示假设与候选,同名候选默认不勾选并提示', async () => {
    const { repositories, state } = createMemoryRepositories();
    // 预置:任务已有同名子任务「第一步」
    const proposal = makeProposal({ assumptions: ['默认三个工作日'] });
    vi.spyOn(repositories.ai, 'generateBreakdown').mockResolvedValue(proposal);
    setRepositoriesForTesting(repositories);
    void state;

    renderWithProviders(
      <BreakdownPanel
        taskId="t1"
        existingChildTitles={['第一步']}
        onBeforeGenerate={() => Promise.resolve()}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByText(/默认三个工作日/)).toBeInTheDocument());

    // 「第一步」与已有子任务同名 → 默认不勾 + 同名标记;「梳理目标」默认勾选
    expect(screen.getByText('同名')).toBeInTheDocument();
    expect(screen.getByText(/本次将添加 1 个子任务/)).toBeInTheDocument();
  });

  it('编辑标题后采纳,仅提交选中项', async () => {
    const { repositories } = createMemoryRepositories();
    const proposal = makeProposal();
    const generate = vi.spyOn(repositories.ai, 'generateBreakdown').mockResolvedValue(proposal);
    const apply = vi.spyOn(repositories.ai, 'applyBreakdown').mockResolvedValue({
      created_task_ids: ['n1', 'n2'],
      already_applied: false,
    });
    setRepositoriesForTesting(repositories);

    const onClose = vi.fn();
    renderWithProviders(
      <BreakdownPanel
        taskId="t1"
        existingChildTitles={[]}
        onBeforeGenerate={() => Promise.resolve()}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByText(/本次将添加 2 个子任务/)).toBeInTheDocument());

    // 编辑第一个候选标题
    const inputs = screen.getAllByRole('textbox');
    await userEvent.clear(inputs[1]); // 0 是补充要求输入框
    await userEvent.type(inputs[1], '改过的标题');
    await userEvent.click(screen.getByTestId('ai-breakdown-apply'));

    await waitFor(() => expect(apply).toHaveBeenCalled());
    const [proposalId, operationId, items] = apply.mock.calls[0];
    expect(proposalId).toBe('prop-1');
    expect(operationId).toBeTruthy();
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('改过的标题');
    expect(generate).toHaveBeenCalledWith('t1', undefined);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('重新生成失败时保留原有预览', async () => {
    const { repositories } = createMemoryRepositories();
    const proposal = makeProposal();
    const generate = vi
      .spyOn(repositories.ai, 'generateBreakdown')
      .mockResolvedValueOnce(proposal)
      .mockRejectedValueOnce({ code: 'connection_failed', message: '无法连接到模型服务' });
    setRepositoriesForTesting(repositories);

    renderWithProviders(
      <BreakdownPanel
        taskId="t1"
        existingChildTitles={[]}
        onBeforeGenerate={() => Promise.resolve()}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByText(/本次将添加 2 个子任务/)).toBeInTheDocument());

    // 重新生成失败 → 错误展示,但原候选仍在且可采纳
    await userEvent.click(screen.getByRole('button', { name: /重新生成/ }));
    await waitFor(() => expect(screen.getByTestId('ai-breakdown-error')).toBeInTheDocument());
    expect(screen.getByDisplayValue('梳理目标')).toBeInTheDocument();
    expect(screen.getByTestId('ai-breakdown-apply')).toBeInTheDocument();
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('上下文变化错误提示重新生成,预览保留', async () => {
    const { repositories } = createMemoryRepositories();
    vi.spyOn(repositories.ai, 'generateBreakdown').mockResolvedValue(makeProposal());
    vi.spyOn(repositories.ai, 'applyBreakdown').mockRejectedValue({
      code: 'context_changed',
      message: '生成后任务内容发生了变化,请基于当前内容重新生成',
    });
    setRepositoriesForTesting(repositories);

    renderWithProviders(
      <BreakdownPanel
        taskId="t1"
        existingChildTitles={[]}
        onBeforeGenerate={() => Promise.resolve()}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));
    await waitFor(() => expect(screen.getByTestId('ai-breakdown-apply')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('ai-breakdown-apply'));

    await waitFor(() => expect(screen.getByTestId('ai-breakdown-error')).toBeInTheDocument());
    expect(screen.getByTestId('ai-breakdown-error').textContent).toContain('重新生成');
    // 面板未关闭,候选保留
    expect(screen.getByDisplayValue('梳理目标')).toBeInTheDocument();
  });
});
