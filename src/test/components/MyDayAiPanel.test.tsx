import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyDayAiPanel } from '../../components/myday/MyDayAiPanel';
import { renderWithProviders } from '../test-utils';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { useMyDayPlanStore } from '../../stores/myDayPlanStore';
import { todayISO } from '../../lib/date';
import { buildTask } from '../test-utils';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const TODAY = todayISO();

function setup(options: { defaultModel?: boolean; tasks?: ReturnType<typeof buildTask>[] } = {}) {
  const { repositories, state } = createMemoryRepositories({
    tasks: options.tasks ?? [
      buildTask({ id: 't1', title: '设计评审' }),
      buildTask({ id: 't2', title: '排查同步失败', my_day_date: TODAY }),
    ],
  });
  if (options.defaultModel !== false) state.aiDefaultModel = 'model-1';
  setRepositoriesForTesting(repositories);
  return { repositories, state };
}

describe('MyDayAiPanel(AI 建议模式)', () => {
  beforeEach(() => {
    resetRepositories();
    useMyDayPlanStore.setState({ sessions: {} });
    vi.clearAllMocks();
  });

  it('未配置模型:显示配置入口,不渲染生成按钮', async () => {
    setup({ defaultModel: false });

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set(['t2'])} />);

    await waitFor(() => expect(screen.getByTestId('my-day-ai-no-model')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /去设置/ })).toBeInTheDocument();
    expect(screen.queryByTestId('my-day-generate-button')).toBeNull();
  });

  it('展示候选与已加入标记,生成后出现行动卡', async () => {
    setup();

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set(['t2'])} />);

    await waitFor(() => expect(screen.getByText('设计评审')).toBeInTheDocument());
    expect(screen.getByText('已加入').textContent).toBe('已加入');
    expect(screen.getByText(/候选 2 项/)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('my-day-generate-button'));
    await waitFor(() => expect(screen.getAllByTestId('my-day-action-card').length).toBe(2));
  });

  it('范围无候选时说明并禁用生成;不发送空请求', async () => {
    setup({ tasks: [buildTask({ id: 'done', title: '已完成', is_completed: true })] });

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);

    await waitFor(() => expect(screen.getByText(/没有可执行候选/)).toBeInTheDocument());
    expect(screen.getByTestId('my-day-generate-button')).toBeDisabled();
  });

  it('必做与排除互斥切换反映到会话', async () => {
    setup();
    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);

    await waitFor(() => expect(screen.getByText('设计评审')).toBeInTheDocument());
    const row = screen.getByText('设计评审').closest('div')!;
    const mandatoryBtn = row.querySelector('button')!;
    await userEvent.click(mandatoryBtn);

    const session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.mandatory).toContain('t1');
  });

  it('生成后采纳:调用 applyMyDayPlan,成功后清空会话并提示', async () => {
    const { repositories } = setup();
    const applySpy = vi.spyOn(repositories.ai, 'applyMyDayPlan');

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set(['t2'])} />);
    await waitFor(() => expect(screen.getByText('设计评审')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('my-day-generate-button'));
    await waitFor(() => expect(screen.getByTestId('my-day-adopt-button')).toBeInTheDocument());

    // 采纳摘要:1 新增 + 1 已在今日,并提示未覆盖的原清单项
    expect(screen.getByTestId('my-day-adopt-summary').textContent).toContain('新增 1 项、已在今日 1 项');

    // 取消一项(已在今日的 t2 不在 myDayIds 外?此处取消第一张卡)
    const cards = screen.getAllByTestId('my-day-action-card');
    const checkbox = cards[1].querySelector('input[type="checkbox"]') as HTMLInputElement;
    await userEvent.click(checkbox);

    await userEvent.click(screen.getByTestId('my-day-adopt-button'));

    await waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    const arg = applySpy.mock.calls[0][0];
    expect(arg.actions).toHaveLength(1);
    expect(arg.actions[0].root_task_id).toBe('t1');
    // 成功后清空会话,面板回到准备态(候选重新可见)
    await waitFor(() =>
      expect(useMyDayPlanStore.getState().sessions[TODAY]?.drafts ?? []).toHaveLength(0),
    );

    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalled();
  });

  it('范围内未带入的任务可展开并手动补入,补入后进入候选最前', async () => {
    const many = Array.from({ length: 22 }, (_, i) =>
      buildTask({ id: `bulk-${i}`, title: `任务 ${i + 1}` }),
    );
    const { repositories, state } = createMemoryRepositories({ tasks: many });
    state.aiDefaultModel = 'model-1';
    setRepositoriesForTesting(repositories);

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);
    await waitFor(() => expect(screen.getByText(/还有 2 项未带入/)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/还有 2 项未带入/));
    const addButton = screen.getAllByRole('button', { name: '补入' })[0];
    fireEvent.click(addButton);

    await waitFor(() => expect(screen.getByText('补入 ×')).toBeInTheDocument());
    const session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.manualTaskIds).toHaveLength(1);
    expect(session?.preview?.candidates[0].group).toBe('manual');
  });

  it('子任务替换:点击未纳入项换入,末位让位', async () => {
    const root = buildTask({ id: 'r1', title: '根任务' });
    const children = Array.from({ length: 7 }, (_, i) =>
      buildTask({ id: `s${i}`, title: `步骤 ${i}`, parent_task_id: 'r1' }),
    );
    const { repositories, state } = createMemoryRepositories({ tasks: [root, ...children] });
    state.aiDefaultModel = 'model-1';
    setRepositoriesForTesting(repositories);

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);
    await waitFor(() => expect(screen.getByText('根任务')).toBeInTheDocument());

    // 未纳入的子任务以 "+ 标题" 呈现
    expect(screen.getByText('+ 步骤 5')).toBeInTheDocument();
    fireEvent.click(screen.getByText('+ 步骤 5'));

    await waitFor(() => {
      expect(screen.queryByText('+ 步骤 5')).toBeNull();
      expect(screen.getByText('步骤 5')).toBeInTheDocument();
    });
    // 已满 5 项,末位 步骤 4 让位
    expect(screen.getByText('+ 步骤 4')).toBeInTheDocument();
    const session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.preview?.candidates[0].subtasks.map((x) => x.subtask_id)).toEqual([
      's0', 's1', 's2', 's3', 's5',
    ]);
  });

  it('必做项被用户取消后,摘要明确显示未选中', async () => {
    setup();
    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);
    await waitFor(() => expect(screen.getByText('设计评审')).toBeInTheDocument());

    // 标记 t1 必做 → 生成 → 取消 t1 的卡
    const row = screen.getByText('设计评审').closest('div')!;
    await userEvent.click(row.querySelector('button')!);

    await userEvent.click(screen.getByTestId('my-day-generate-button'));
    await waitFor(() => expect(screen.getByTestId('my-day-adopt-button')).toBeInTheDocument());

    const card = screen.getAllByTestId('my-day-action-card')[0];
    await userEvent.click(card.querySelector('input[type="checkbox"]')!);

    expect(screen.getByTestId('my-day-adopt-summary').textContent).toContain('曾标记必做但未选中');
  });
});
