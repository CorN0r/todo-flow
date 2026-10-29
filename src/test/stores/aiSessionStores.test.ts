import { describe, expect, it, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { runPolish, usePolishStore } from '../../stores/polishStore';
import { runBreakdown, useBreakdownStore } from '../../stores/breakdownStore';
import type { BreakdownProposal } from '../../domain/models/ai';

function withAi(overrides: Record<string, unknown>) {
  const { repositories } = createMemoryRepositories();
  setRepositoriesForTesting({ ...repositories, ai: { ...repositories.ai, ...overrides } });
}

const polishProposal = { request_id: 'polish-r1', model_snapshot: '测试 (m)', text: '润色结果' };
const breakdownProposal: BreakdownProposal = {
  proposal_id: 'prop-1',
  request_id: 'req-1',
  model_snapshot: '测试 (m)',
  assumptions: [],
  items: [{ title: '候选A', instructions: 'x' }],
  used_stream: false,
  json_fallback: false,
  context_fingerprint: 'fp',
};

describe('AI 会话 store 重入防护与错误文案', () => {
  beforeEach(() => {
    resetRepositories();
    usePolishStore.setState({ sessions: {} });
    useBreakdownStore.setState({ sessions: {} });
    vi.restoreAllMocks();
  });

  it('runPolish:生成中忽略再次发起,不产生第二路请求', async () => {
    let release!: (v: typeof polishProposal) => void;
    const gate = new Promise<typeof polishProposal>((r) => { release = r; });
    const polish = vi.fn(() => gate);
    withAi({ polishDescription: polish });

    const p1 = runPolish('t1', 'base', async () => {});
    const p2 = runPolish('t1', 'base', async () => {});
    await p2;
    await waitFor(() => expect(polish).toHaveBeenCalledTimes(1));
    expect(usePolishStore.getState().sessions.t1?.status).toBe('generating');

    release(polishProposal);
    await p1;
    await waitFor(() => expect(usePolishStore.getState().sessions.t1?.status).toBe('done'));
  });

  it('runPolish:timeout 错误翻译为友好文案,cancelled 显示已取消', async () => {
    withAi({
      polishDescription: vi
        .fn()
        .mockRejectedValueOnce({ code: 'timeout', message: 'upstream 504' })
        .mockRejectedValueOnce({ code: 'cancelled', message: '已取消' }),
    });

    await runPolish('t1', 'base', async () => {});
    expect(usePolishStore.getState().sessions.t1?.error).toBe('模型服务响应超时,请稍后重试');
    expect(usePolishStore.getState().sessions.t1?.status).toBe('error');

    await runPolish('t1', 'base', async () => {});
    expect(usePolishStore.getState().sessions.t1?.error).toBe('已取消');
  });

  it('runBreakdown:生成中忽略再次发起', async () => {
    let release!: (v: BreakdownProposal) => void;
    const gate = new Promise<BreakdownProposal>((r) => { release = r; });
    const generate = vi.fn(() => gate);
    withAi({ generateBreakdown: generate });

    const p1 = runBreakdown('t1', '', [], async () => {});
    const p2 = runBreakdown('t1', '', [], async () => {});
    await p2;
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(useBreakdownStore.getState().sessions.t1?.status).toBe('generating');

    release(breakdownProposal);
    await p1;
    await waitFor(() => expect(useBreakdownStore.getState().sessions.t1?.status).toBe('done'));
  });

  it('runBreakdown:timeout 错误翻译为友好文案,失败保留原候选', async () => {
    withAi({
      generateBreakdown: vi
        .fn()
        .mockResolvedValueOnce(breakdownProposal)
        .mockRejectedValueOnce({ code: 'timeout', message: 'upstream 504' }),
    });

    await runBreakdown('t1', '', [], async () => {});
    expect(useBreakdownStore.getState().sessions.t1?.items).toHaveLength(1);

    await runBreakdown('t1', '', [], async () => {});
    expect(useBreakdownStore.getState().sessions.t1?.error).toBe('模型服务响应超时,请稍后重试');
    expect(useBreakdownStore.getState().sessions.t1?.items).toHaveLength(1);
  });
});
