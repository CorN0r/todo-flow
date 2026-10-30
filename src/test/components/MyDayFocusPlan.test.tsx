import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyDayFocusPlan } from '../../components/myday/MyDayFocusPlan';
import { renderWithProviders } from '../test-utils';
import { setRepositoriesForTesting, resetRepositories } from '../../domain/repositories/current';
import { createMemoryRepositories } from '../../domain/adapters/memory';
import { usePomodoroStore } from '../../stores/pomodoroStore';
import { useUIStore } from '../../stores/uiStore';
import { todayISO } from '../../lib/date';
import { buildTask } from '../test-utils';
import type { MyDayPlanView } from '../../domain/models/ai';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const TODAY = todayISO();

function makePlan(overrides: Partial<MyDayPlanView> = {}): MyDayPlanView {
  return {
    plan_id: 'plan-1',
    local_date: TODAY,
    revision: 1,
    focus_text: '',
    model_snapshot: '测试 (m)',
    adopted_at: '2026-10-30 09:00:00',
    actions: [
      {
        display_order: 1,
        root_task_id: 't1',
        target_subtask_id: null,
        root_title: '设计评审',
        subtask_title: null,
        reason: '今天目标明确',
        next_step: '写清范围',
        stop_at: '有可审核流程说明',
        status: 'ok',
        can_start: true,
      },
    ],
    ...overrides,
  };
}

function setup(plan: MyDayPlanView | null) {
  const { repositories, state } = createMemoryRepositories({
    tasks: [buildTask({ id: 't1', title: '设计评审', my_day_date: TODAY })],
  });
  if (plan) state.myDayPlans.set(TODAY, plan);
  setRepositoriesForTesting(repositories);
  return { repositories, state };
}

describe('MyDayFocusPlan(今日重点区块)', () => {
  beforeEach(() => {
    resetRepositories();
    usePomodoroStore.setState({ isRunning: false, isPaused: false, taskId: null, taskTitle: '' });
    useUIStore.setState({ selectedTaskId: null, taskStatusFilter: 'all' });
    vi.clearAllMocks();
  });

  it('无计划时不渲染;有计划时展示卡片与开工入口', async () => {
    setup(null);
    const empty = renderWithProviders(<MyDayFocusPlan today={TODAY} hiddenTaskIds={new Set()} />);
    await waitFor(() => expect(empty.container.querySelector('[data-testid="my-day-focus-plan"]')).toBeNull());
    empty.unmount();

    setup(makePlan());
    renderWithProviders(<MyDayFocusPlan today={TODAY} hiddenTaskIds={new Set()} />);
    await waitFor(() => expect(screen.getByTestId('my-day-focus-card')).toBeInTheDocument());
    expect(screen.getByText('设计评审')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开任务' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /开始专注/ })).toBeInTheDocument();
  });

  it('开始专注:空闲时关联根任务;已有运行专注时不覆盖并提示', async () => {
    setup(makePlan());
    renderWithProviders(<MyDayFocusPlan today={TODAY} hiddenTaskIds={new Set()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /开始专注/ })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /开始专注/ }));
    expect(usePomodoroStore.getState().taskId).toBe('t1');
    expect(usePomodoroStore.getState().isRunning).toBe(true);

    // 已有专注(运行中):再次点击不覆盖,提示先处理
    const { toast } = await import('sonner');
    usePomodoroStore.setState({ taskId: 'other', isRunning: true });
    await userEvent.click(screen.getByRole('button', { name: /开始专注/ }));
    expect(toast.info).toHaveBeenCalledWith('已有专注进行中,请先处理当前番茄钟');
    expect(usePomodoroStore.getState().taskId).toBe('other');
  });

  it('失效卡片显示具体状态并禁止开始;子任务完成只标记本步', async () => {
    const { repositories, state } = createMemoryRepositories({
      tasks: [
        buildTask({ id: 't1', title: '设计评审', my_day_date: TODAY }),
        buildTask({ id: 's1', title: '写流程', parent_task_id: 't1', is_completed: true }),
        buildTask({ id: 't2', title: '已移出的任务', my_day_date: null }),
      ],
    });
    const plan = makePlan({
      actions: [
        {
          display_order: 1,
          root_task_id: 't1',
          target_subtask_id: 's1',
          root_title: '设计评审',
          subtask_title: '写流程',
          reason: 'r',
          next_step: 'n',
          stop_at: 's',
          status: 'ok',
          can_start: true,
        },
        {
          display_order: 2,
          root_task_id: 't2',
          target_subtask_id: null,
          root_title: '已移出的任务',
          subtask_title: null,
          reason: 'r',
          next_step: 'n',
          stop_at: 's',
          status: 'ok',
          can_start: true,
        },
      ],
    });
    state.myDayPlans.set(TODAY, plan);
    setRepositoriesForTesting(repositories);
    renderWithProviders(<MyDayFocusPlan today={TODAY} hiddenTaskIds={new Set()} />);

    await waitFor(() => expect(screen.getAllByTestId('my-day-focus-card').length).toBe(2));
    expect(screen.getByText('本步(子任务)已完成')).toBeInTheDocument();
    expect(screen.getByText('已移出今日')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /开始专注/ })).toBeNull();
  });

  it('被筛选隐藏的任务提供明确的切到进行中并定位操作', async () => {
    setup(makePlan());
    renderWithProviders(<MyDayFocusPlan today={TODAY} hiddenTaskIds={new Set(['t1'])} />);

    await waitFor(() => expect(screen.getByText('被筛选隐藏,切到进行中并定位')).toBeInTheDocument());
    await userEvent.click(screen.getByText('被筛选隐藏,切到进行中并定位'));

    expect(useUIStore.getState().taskStatusFilter).toBe('active');
    expect(useUIStore.getState().selectedTaskId).toBe('t1');
  });

  it('清除重点:调用清除接口,不移出任务', async () => {
    const { repositories, state } = setup(makePlan());
    const clearSpy = vi.spyOn(repositories.ai, 'clearMyDayPlan');

    renderWithProviders(<MyDayFocusPlan today={TODAY} hiddenTaskIds={new Set()} />);
    await waitFor(() => expect(screen.getByText('清除重点')).toBeInTheDocument());

    await userEvent.click(screen.getByText('清除重点'));

    await waitFor(() => expect(clearSpy).toHaveBeenCalledWith(TODAY, 1));
    // 任务仍带今日归属
    expect(state.tasks[0].my_day_date).toBe(TODAY);
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalled();
  });
});
