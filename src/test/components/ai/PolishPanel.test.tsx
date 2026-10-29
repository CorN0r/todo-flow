import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PolishPanel } from '../../../components/ai/PolishPanel';
import { renderWithProviders } from '../../test-utils';
import { setRepositoriesForTesting, resetRepositories } from '../../../domain/repositories/current';
import { createMemoryRepositories } from '../../../domain/adapters/memory';
import type { PolishProposal } from '../../../domain/models/ai';

function makeProposal(text = '润色后的说明。'): PolishProposal {
  return { request_id: 'req-p1', model_snapshot: '测试 (m)', text };
}

describe('PolishPanel', () => {
  beforeEach(() => {
    resetRepositories();
    vi.restoreAllMocks();
  });

  it('保存失败时不发起生成', async () => {
    const { repositories } = createMemoryRepositories();
    const polish = vi.spyOn(repositories.ai, 'polishDescription');
    setRepositoriesForTesting(repositories);

    renderWithProviders(
      <PolishPanel
        taskId="t1"
        currentDescriptionText="原始描述"
        onBeforeGenerate={() => Promise.reject(new Error('save failed'))}
        onAdopt={vi.fn()}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /开始润色/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-error')).toBeInTheDocument());
    expect(polish).not.toHaveBeenCalled();
    expect(screen.getByTestId('ai-polish-error').textContent).toContain('保存失败');
  });

  it('生成→编辑→采纳仅把包装后的文本交给 onAdopt', async () => {
    const { repositories } = createMemoryRepositories();
    vi.spyOn(repositories.ai, 'polishDescription').mockResolvedValue(makeProposal('第一段\n\n第二段'));
    setRepositoriesForTesting(repositories);
    const onAdopt = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    renderWithProviders(
      <PolishPanel
        taskId="t1"
        currentDescriptionText=""
        onBeforeGenerate={() => Promise.resolve()}
        onAdopt={onAdopt}
        onClose={onClose}
      />,
    );
    // 空描述 → 生成入口文案
    await userEvent.click(screen.getByRole('button', { name: /生成描述/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-draft')).toBeInTheDocument());

    const draft = screen.getByTestId('ai-polish-draft') as HTMLTextAreaElement;
    await userEvent.clear(draft);
    await userEvent.type(draft, '改后的说明');
    await userEvent.click(screen.getByTestId('ai-polish-adopt'));

    await waitFor(() => expect(onAdopt).toHaveBeenCalled());
    // wrapPlainText:纯文本包为 <p> 段落
    expect(onAdopt).toHaveBeenCalledWith('<p>改后的说明</p>');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('生成失败展示错误,可重试', async () => {
    const { repositories } = createMemoryRepositories();
    vi.spyOn(repositories.ai, 'polishDescription')
      .mockRejectedValueOnce({ code: 'timeout', message: '请求超时' })
      .mockResolvedValueOnce(makeProposal());
    setRepositoriesForTesting(repositories);

    renderWithProviders(
      <PolishPanel
        taskId="t1"
        currentDescriptionText="x"
        onBeforeGenerate={() => Promise.resolve()}
        onAdopt={vi.fn()}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /开始润色/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-error')).toBeInTheDocument());
    expect(screen.getByTestId('ai-polish-error').textContent).toContain('请求超时');

    await userEvent.click(screen.getByRole('button', { name: /开始润色/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-draft')).toBeInTheDocument());
  });

  it('采纳失败时面板保留,展示错误', async () => {
    const { repositories } = createMemoryRepositories();
    vi.spyOn(repositories.ai, 'polishDescription').mockResolvedValue(makeProposal('内容'));
    setRepositoriesForTesting(repositories);
    const onAdopt = vi.fn().mockRejectedValue(new Error('update failed'));

    renderWithProviders(
      <PolishPanel
        taskId="t1"
        currentDescriptionText="x"
        onBeforeGenerate={() => Promise.resolve()}
        onAdopt={onAdopt}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /开始润色/ }));
    await waitFor(() => expect(screen.getByTestId('ai-polish-adopt')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('ai-polish-adopt'));
    await waitFor(() => expect(screen.getByTestId('ai-polish-error')).toBeInTheDocument());
    expect(screen.getByTestId('ai-polish-panel')).toBeInTheDocument();
  });
});
