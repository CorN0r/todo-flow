import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyDayAiPanel } from '../../components/myday/MyDayAiPanel';
import { renderWithProviders } from '../test-utils';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { useMyDayPlanStore } from '../../stores/myDayPlanStore';
import { todayISO } from '../../lib/date';
import type { Tag } from '../../types/tag';
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

function candidateRow(title: string) {
  const row = screen.getByText(title).closest('[data-testid="my-day-candidate"]');
  if (!row) throw new Error(`没有找到候选行:${title}`);
  return row as HTMLElement;
}

// 行内的「必做 / 排除 / 子任务」平时只是视觉上隐藏,按角色和名称查找不受影响
function rowAction(title: string, name: string | RegExp) {
  return within(candidateRow(title)).getByRole('button', { name });
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

  it('展示候选、数量与已加入标记;说明文字不再常驻,生成后出现行动卡', async () => {
    setup();

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set(['t2'])} />);

    await waitFor(() => expect(screen.getByText('设计评审')).toBeInTheDocument());
    expect(screen.getByText('已加入').textContent).toBe('已加入');
    expect(screen.getByText(/候选 2 项/)).toBeInTheDocument();
    expect(screen.queryByText(/从任务池准备候选/)).toBeNull();
    expect(screen.queryByText(/发送给模型的只有/)).toBeNull();

    await userEvent.click(screen.getByTestId('my-day-generate-button'));
    await waitFor(() => expect(screen.getAllByTestId('my-day-action-card').length).toBe(2));
  });

  it('范围无候选时说明并禁用生成;不发送空请求', async () => {
    setup({ tasks: [buildTask({ id: 'done', title: '已完成', is_completed: true })] });

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);

    await waitFor(() => expect(screen.getByText(/没有可执行候选/)).toBeInTheDocument());
    expect(screen.getByTestId('my-day-generate-button')).toBeDisabled();
  });

  it('必做与排除互斥;行内操作平时隐藏,标记后常驻', async () => {
    setup();
    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);

    await waitFor(() => expect(screen.getByText('设计评审')).toBeInTheDocument());
    const actions = within(candidateRow('设计评审')).getByTestId('my-day-row-actions');
    // 平时不占宽度;鼠标悬停和键盘聚焦到这一行时都会展开
    expect(actions).toHaveClass(
      'w-0', 'opacity-0', 'group-hover:w-auto', 'group-hover:opacity-100', 'group-focus-within:w-auto', 'group-focus-within:opacity-100',
    );
    // 每行只留一个键盘入口,其余不占 Tab 顺序;聚焦进来之后整行操作都能 Tab 到
    expect(rowAction('设计评审', '必做')).toHaveProperty('tabIndex', 0);
    expect(rowAction('设计评审', '排除')).toHaveProperty('tabIndex', -1);
    fireEvent.focus(rowAction('设计评审', '必做'));
    expect(actions).toHaveClass('w-auto');
    expect(rowAction('设计评审', '排除')).toHaveProperty('tabIndex', 0);
    fireEvent.blur(rowAction('设计评审', '必做'));
    expect(actions).toHaveClass('w-0', 'opacity-0');

    await userEvent.click(rowAction('设计评审', '必做'));
    expect(useMyDayPlanStore.getState().sessions[TODAY]?.mandatory).toContain('t1');
    expect(rowAction('设计评审', '必做')).toHaveAttribute('aria-pressed', 'true');
    expect(actions).not.toHaveClass('opacity-0');

    await userEvent.click(rowAction('设计评审', '排除'));
    const session = useMyDayPlanStore.getState().sessions[TODAY];
    expect(session?.mandatory).not.toContain('t1');
    expect(session?.excluded).toContain('t1');
    expect(actions).not.toHaveClass('opacity-0');
  });

  it('标签范围默认收起,展开后选标签即按该范围重新准备', async () => {
    const tasks = [
      buildTask({ id: 'a', title: '写周报', tag_ids: ['tagA'] }),
      buildTask({ id: 'b', title: '修水管' }),
    ];
    const tags: Tag[] = [
      { id: 'tagA', name: '工作', color: '#6366f1', icon: 'tag', sort_order: 0, parent_tag_id: null, created_at: '', updated_at: '' },
      { id: 'tagB', name: '生活', color: '#6366f1', icon: 'tag', sort_order: 1, parent_tag_id: null, created_at: '', updated_at: '' },
    ];
    const { repositories, state } = createMemoryRepositories({ tasks, tags });
    state.aiDefaultModel = 'model-1';
    setRepositoriesForTesting(repositories);
    const prepareSpy = vi.spyOn(repositories.ai, 'prepareMyDayContext');

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);
    await waitFor(() => expect(screen.getByText('修水管')).toBeInTheDocument());
    expect(screen.queryByTestId('my-day-scope-chips')).toBeNull();
    expect(screen.getByTestId('my-day-scope-toggle').textContent).toContain('全部可执行');

    await userEvent.click(screen.getByTestId('my-day-scope-toggle'));
    const chips = () => within(screen.getByTestId('my-day-scope-chips'));
    await userEvent.click(chips().getByRole('button', { name: '工作' }));

    await waitFor(() =>
      expect(prepareSpy).toHaveBeenLastCalledWith({ tagIds: ['tagA'], manualTaskIds: [], subtaskPicks: [] }),
    );
    await waitFor(() => expect(screen.queryByText('修水管')).toBeNull());
    expect(screen.getByText('写周报')).toBeInTheDocument();
    expect(screen.getByTestId('my-day-scope-toggle').textContent).toContain('工作');

    // 选中的范围里没有候选:标签行保持展开,并给出恢复全部的入口
    await userEvent.click(chips().getByRole('button', { name: '工作' }));
    await userEvent.click(chips().getByRole('button', { name: '生活' }));
    await waitFor(() => expect(screen.getByText(/没有可执行候选/)).toBeInTheDocument());
    expect(screen.getByTestId('my-day-scope-chips')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '恢复全部可执行' }));
    await waitFor(() => expect(screen.getByText('修水管')).toBeInTheDocument());
  });

  it('推荐项数点开才出现,选择后写入会话', async () => {
    setup();
    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);

    await waitFor(() => expect(screen.getByText('设计评审')).toBeInTheDocument());
    expect(screen.queryByTestId('my-day-count-control')).toBeNull();
    expect(screen.getByTestId('my-day-count-toggle').textContent).toContain('推荐 3 项');

    await userEvent.click(screen.getByTestId('my-day-count-toggle'));
    const control = within(screen.getByTestId('my-day-count-control'));
    await userEvent.click(control.getByRole('button', { name: '5' }));

    expect(useMyDayPlanStore.getState().sessions[TODAY]?.targetCount).toBe(5);
    expect(control.getByRole('button', { name: '5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('my-day-count-toggle').textContent).toContain('推荐 5 项');
  });

  it('候选超过 6 条时先露出 6 条,其余收在「展开其余 N 项」后面', async () => {
    const many = Array.from({ length: 8 }, (_, i) => buildTask({ id: `c-${i}`, title: `任务 ${i + 1}` }));
    setup({ tasks: many });

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);

    await waitFor(() => expect(screen.getAllByTestId('my-day-candidate')).toHaveLength(6));
    expect(screen.getByText(/候选 8 项/)).toBeInTheDocument();
    expect(screen.queryByText('任务 8')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '展开其余 2 项' }));
    expect(screen.getAllByTestId('my-day-candidate')).toHaveLength(8);

    await userEvent.click(screen.getByRole('button', { name: '收起列表' }));
    expect(screen.getAllByTestId('my-day-candidate')).toHaveLength(6);
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

  it('子任务替换:点开才出现胶囊,点击未纳入项换入,末位让位', async () => {
    const root = buildTask({ id: 'r1', title: '根任务' });
    const children = Array.from({ length: 7 }, (_, i) =>
      buildTask({ id: `s${i}`, title: `步骤 ${i}`, parent_task_id: 'r1' }),
    );
    const { repositories, state } = createMemoryRepositories({ tasks: [root, ...children] });
    state.aiDefaultModel = 'model-1';
    setRepositoriesForTesting(repositories);

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);
    await waitFor(() => expect(screen.getByText('根任务')).toBeInTheDocument());

    // 默认收起;按钮上带着已纳入 / 总数,未带入的子任务数量始终可见
    expect(screen.queryByText('+ 步骤 5')).toBeNull();
    expect(rowAction('根任务', /子任务/).textContent).toContain('子任务 5/7');
    fireEvent.click(rowAction('根任务', /子任务/));

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

  it('重新准备候选期间清单保持挂载,子任务行也保持展开', async () => {
    const root = buildTask({ id: 'r1', title: '根任务' });
    const children = Array.from({ length: 7 }, (_, i) =>
      buildTask({ id: `s${i}`, title: `步骤 ${i}`, parent_task_id: 'r1' }),
    );
    const { repositories, state } = createMemoryRepositories({ tasks: [root, ...children] });
    state.aiDefaultModel = 'model-1';
    setRepositoriesForTesting(repositories);

    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);
    await waitFor(() => expect(screen.getByText('根任务')).toBeInTheDocument());
    fireEvent.click(rowAction('根任务', /子任务/));

    // 换入之后的那次重新准备先不返回
    const original = repositories.ai.prepareMyDayContext.bind(repositories.ai);
    let release: () => void = () => {};
    vi.spyOn(repositories.ai, 'prepareMyDayContext').mockImplementationOnce(
      (input) => new Promise<Awaited<ReturnType<typeof original>>>((resolve) => {
        release = () => {
          void original(input).then(resolve);
        };
      }),
    );
    fireEvent.click(screen.getByText('+ 步骤 5'));

    await waitFor(() => expect(useMyDayPlanStore.getState().sessions[TODAY]?.status).toBe('preparing'));
    // 旧清单和展开的子任务行都还在,只是暂时不能操作
    expect(screen.getAllByTestId('my-day-candidate')).toHaveLength(1);
    expect(screen.getByText('+ 步骤 5')).toBeInTheDocument();
    expect(screen.getByText('更新中')).toBeInTheDocument();
    expect(screen.getByTestId('my-day-generate-button')).toBeDisabled();
    expect(rowAction('根任务', /子任务/)).toBeDisabled();

    release();
    await waitFor(() => expect(screen.queryByText('+ 步骤 5')).toBeNull());
    expect(screen.queryByText('更新中')).toBeNull();
    expect(screen.getByTestId('my-day-generate-button')).not.toBeDisabled();
  });

  it('必做项被用户取消后,摘要明确显示未选中', async () => {
    setup();
    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);
    await waitFor(() => expect(screen.getByText('设计评审')).toBeInTheDocument());

    // 标记 t1 必做 → 生成 → 取消 t1 的卡
    await userEvent.click(rowAction('设计评审', '必做'));

    await userEvent.click(screen.getByTestId('my-day-generate-button'));
    await waitFor(() => expect(screen.getByTestId('my-day-adopt-button')).toBeInTheDocument());

    const card = screen.getAllByTestId('my-day-action-card')[0];
    await userEvent.click(card.querySelector('input[type="checkbox"]')!);

    expect(screen.getByTestId('my-day-adopt-summary').textContent).toContain('曾标记必做但未选中');
  });

  it('生成后:候选区和输入框收起,头部出现「重新生成」;点「候选清单」才展开', async () => {
    setup();
    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);
    await waitFor(() => expect(screen.getByText('设计评审')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('my-day-generate-button'));
    await waitFor(() => expect(screen.getByTestId('my-day-adopt-button')).toBeInTheDocument());

    // 有结果时只留结果:候选行和输入框都不在了
    expect(screen.queryByTestId('my-day-candidate')).toBeNull();
    expect(screen.queryByTestId('my-day-focus-note')).toBeNull();
    expect(screen.getByTestId('my-day-generate-button').textContent).toContain('重新生成');
    expect(within(screen.getByTestId('my-day-proposal')).getByText('建议今天重点推进这 2 件')).toBeInTheDocument();
    // 模型假设单独列出,排在行动卡后面
    expect(screen.getByTestId('my-day-assumptions').textContent).toContain('模型假设');

    await userEvent.click(screen.getByTestId('my-day-candidates-toggle'));
    expect(screen.getAllByTestId('my-day-candidate')).toHaveLength(2);
    expect(screen.getByTestId('my-day-focus-note')).toBeInTheDocument();
    // 展开后整个面板里仍然只有一个生成入口
    expect(screen.getAllByTestId('my-day-generate-button')).toHaveLength(1);
  });

  it('重新生成失败后,上一次的建议仍可见、仍可采纳', async () => {
    const { repositories } = setup();
    const applySpy = vi.spyOn(repositories.ai, 'applyMyDayPlan');
    renderWithProviders(<MyDayAiPanel today={TODAY} myDayIds={new Set()} />);
    await waitFor(() => expect(screen.getByText('设计评审')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('my-day-generate-button'));
    await waitFor(() => expect(screen.getByTestId('my-day-adopt-button')).toBeInTheDocument());
    const firstProposal = useMyDayPlanStore.getState().sessions[TODAY]?.proposalId;
    expect(firstProposal).toBeTruthy();

    vi.spyOn(repositories.ai, 'generateMyDayPlan').mockRejectedValueOnce(new Error('模型服务响应超时'));
    await userEvent.click(screen.getByTestId('my-day-generate-button'));

    // 失败不清空上一次的有效预览:行动卡和采纳入口都在,并说明这份建议的来历
    await waitFor(() => expect(screen.getByTestId('my-day-ai-error')).toBeInTheDocument());
    expect(useMyDayPlanStore.getState().sessions[TODAY]?.status).toBe('error');
    expect(screen.getAllByTestId('my-day-action-card')).toHaveLength(2);
    expect(screen.getByTestId('my-day-ai-error').textContent).toContain('下面仍是上一次生成的建议,可以继续采纳');
    expect(screen.getByTestId('my-day-generate-button').textContent).toContain('重新生成');

    await userEvent.click(screen.getByTestId('my-day-adopt-button'));
    await waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    expect(applySpy.mock.calls[0][0].proposalId).toBe(firstProposal);
  });
});
