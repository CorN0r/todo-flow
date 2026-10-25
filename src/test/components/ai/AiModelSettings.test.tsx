import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiModelSettings } from '../../../components/ai/AiModelSettings';
import { renderWithProviders } from '../../test-utils';
import { setRepositoriesForTesting, resetRepositories } from '../../../domain/repositories/current';
import { createMemoryRepositories } from '../../../domain/adapters/memory';

describe('AiModelSettings', () => {
  beforeEach(() => {
    resetRepositories();
    vi.restoreAllMocks();
  });

  it('空态引导新增服务', () => {
    const { repositories } = createMemoryRepositories();
    setRepositoriesForTesting(repositories);
    renderWithProviders(<AiModelSettings />);
    expect(screen.getByText(/还没有配置模型服务/)).toBeInTheDocument();
  });

  it('新增连接 → 添加模型 → 设为默认 → 删除模型受保护', async () => {
    const { repositories } = createMemoryRepositories();
    setRepositoriesForTesting(repositories);

    renderWithProviders(<AiModelSettings />);

    // 新增连接
    await userEvent.click(screen.getByRole('button', { name: /新增服务/ }));
    await userEvent.type(screen.getByPlaceholderText('显示名称'), '测试服务');
    await userEvent.type(screen.getByPlaceholderText(/API 基础地址/), 'https://api.example.com/v1');
    await userEvent.type(screen.getByPlaceholderText(/API Key/), 'sk-test');
    await userEvent.click(screen.getByRole('button', { name: /保存连接/ }));

    await waitFor(() => expect(screen.getByText('测试服务')).toBeInTheDocument());
    expect(screen.getByText('Key 已配置')).toBeInTheDocument();

    // 手动添加模型(输入框内回车)
    const modelInput = screen.getByPlaceholderText(/手动填写模型标识/);
    await userEvent.type(modelInput, 'test-model{Enter}');

    await waitFor(() => expect(screen.getAllByText('test-model').length).toBeGreaterThan(0));

    // 设为默认 → 出现默认标记,删除按钮禁用
    await userEvent.click(screen.getByRole('button', { name: /设为默认/ }));
    await waitFor(() => expect(screen.getByText('默认')).toBeInTheDocument());
    const deleteButtons = screen.getAllByTitle(/删除/);
    expect(deleteButtons[0]).toBeDisabled();
  });
});
