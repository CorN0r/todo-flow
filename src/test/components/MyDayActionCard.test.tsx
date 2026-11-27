import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyDayActionCard } from '../../components/myday/MyDayActionCard';
import type { DraftMyDayAction } from '../../stores/myDayPlanStore';

function draft(overrides: Partial<DraftMyDayAction> = {}): DraftMyDayAction {
  return {
    root_task_id: 't1',
    root_title: '写季度总结',
    target_subtask_id: 's1',
    subtask_title: '梳理本季度工作清单',
    already_in_my_day: true,
    reason: '最近到期,值得今天推进',
    next_step: '先搭好框架',
    stop_at: '有一个可以检查的中间结果',
    selected: true,
    was_mandatory: false,
    ...overrides,
  };
}

function setup(options: { index?: number; total?: number; busy?: boolean; draft?: Partial<DraftMyDayAction> } = {}) {
  const handlers = { onEdit: vi.fn(), onToggleSelected: vi.fn(), onMove: vi.fn(), onSwapOut: vi.fn() };
  render(
    <MyDayActionCard
      draft={draft(options.draft)}
      index={options.index ?? 1}
      total={options.total ?? 3}
      busy={options.busy ?? false}
      {...handlers}
    />,
  );
  return handlers;
}

const up = () => screen.getByRole('button', { name: '上移' });
const down = () => screen.getByRole('button', { name: '下移' });
const swap = () => screen.getByRole('button', { name: '换一件' });
const line = () => screen.getByTestId('my-day-card-toggle');

describe('MyDayActionCard', () => {
  it('默认只有标题行和一行「下一步 / 停在哪里」;理由和输入框要点开才出现', () => {
    setup();
    const card = screen.getByTestId('my-day-action-card');
    expect(within(card).getByText('写季度总结')).toBeInTheDocument();
    expect(within(card).getByText('→ 梳理本季度工作清单')).toBeInTheDocument();
    expect(within(card).getByText('已加入')).toBeInTheDocument();
    expect(line().textContent).toBe('下一步:先搭好框架·停在哪里:有一个可以检查的中间结果');
    expect(line()).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).queryByText(/最近到期/)).toBeNull();
    expect(screen.queryByTestId('my-day-next-step-input')).toBeNull();
    expect(screen.queryByTestId('my-day-stop-at-input')).toBeNull();
  });

  it('点那一行才展开理由和两个输入框;改了会通知外层;点「收起」合上', async () => {
    const handlers = setup();
    await userEvent.click(line());
    const editor = screen.getByTestId('my-day-card-editor');
    expect(within(editor).getByText(/最近到期,值得今天推进/)).toBeInTheDocument();
    expect(line()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(screen.getByTestId('my-day-next-step-input'), { target: { value: '改成先列提纲' } });
    expect(handlers.onEdit).toHaveBeenLastCalledWith({ next_step: '改成先列提纲' });
    fireEvent.change(screen.getByTestId('my-day-stop-at-input'), { target: { value: '提纲列完为止' } });
    expect(handlers.onEdit).toHaveBeenLastCalledWith({ stop_at: '提纲列完为止' });

    await userEvent.click(within(editor).getByRole('button', { name: '收起' }));
    expect(screen.queryByTestId('my-day-card-editor')).toBeNull();
    expect(line()).toHaveAttribute('aria-expanded', 'false');
  });

  it('标题行里换序与换一件平时不占宽度', () => {
    setup();
    const actions = within(screen.getByTestId('my-day-action-card')).getByTestId('my-day-card-actions');
    expect(actions).toHaveClass(
      'w-0', 'opacity-0', 'group-hover:w-auto', 'group-hover:opacity-100', 'group-focus-within:w-auto', 'group-focus-within:opacity-100',
    );
    // 这组按钮平时在宽度为 0 的容器里:不收缩、不换行,否则「换一件」会竖着排开,把标题行撑高一倍
    for (const button of within(actions).getAllByRole('button')) {
      expect(button).toHaveClass('shrink-0', 'whitespace-nowrap');
    }
  });

  it('每张卡只留一个键盘入口,聚焦进来之后整组操作都能 Tab 到', () => {
    setup();
    expect(up()).toHaveProperty('tabIndex', 0);
    expect(down()).toHaveProperty('tabIndex', -1);
    expect(swap()).toHaveProperty('tabIndex', -1);

    fireEvent.focus(up());
    expect(down()).toHaveProperty('tabIndex', 0);
    expect(swap()).toHaveProperty('tabIndex', 0);

    fireEvent.blur(up());
    expect(down()).toHaveProperty('tabIndex', -1);
  });

  it('上移、下移、换一件分别触发对应操作', async () => {
    const handlers = setup();
    await userEvent.click(up());
    expect(handlers.onMove).toHaveBeenLastCalledWith(-1);
    await userEvent.click(down());
    expect(handlers.onMove).toHaveBeenLastCalledWith(1);
    await userEvent.click(swap());
    expect(handlers.onSwapOut).toHaveBeenCalledTimes(1);
  });

  it('第一张不能上移', () => {
    setup({ index: 0 });
    expect(up()).toBeDisabled();
    expect(down()).not.toBeDisabled();
  });

  it('最后一张不能下移', () => {
    setup({ index: 2, total: 3 });
    expect(down()).toBeDisabled();
    expect(up()).not.toBeDisabled();
  });

  it('生成或采纳进行中,卡上的操作都不能动', () => {
    setup({ busy: true });
    expect(up()).toBeDisabled();
    expect(down()).toBeDisabled();
    expect(swap()).toBeDisabled();
    expect(line()).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('取消勾选通知外层', async () => {
    const handlers = setup();
    await userEvent.click(screen.getByRole('checkbox', { name: '取消采纳这一项' }));
    expect(handlers.onToggleSelected).toHaveBeenCalledTimes(1);
  });
});
