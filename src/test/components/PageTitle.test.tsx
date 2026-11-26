import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { PageTitle } from '../../components/shared/PageTitle';
import { renderWithProviders } from '../test-utils';

describe('PageTitle view menu', () => {
  it('视图入口显示当前视图,菜单里五种视图都在并标出当前项', () => {
    const onViewChange = vi.fn();
    renderWithProviders(<PageTitle title="全部任务" taskCount={2} taskViewMode="list" onViewChange={onViewChange} />);

    const trigger = screen.getByRole('button', { name: '视图：列表' });
    expect(trigger).toHaveTextContent('列表');

    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual(['列表', '便签墙', '一体式', '看板', '四象限']);
    expect(within(menu).getByRole('menuitemradio', { name: '列表' })).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByRole('menuitemradio', { name: '看板' })).toHaveAttribute('aria-checked', 'false');
  });

  it('选择看板后回调收到 kanban,菜单关闭', () => {
    const onViewChange = vi.fn();
    renderWithProviders(<PageTitle title="全部任务" taskCount={2} taskViewMode="list" onViewChange={onViewChange} />);

    fireEvent.click(screen.getByRole('button', { name: '视图：列表' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '看板' }));

    expect(onViewChange).toHaveBeenCalledWith('kanban');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('当前是看板时入口显示看板', () => {
    renderWithProviders(<PageTitle title="全部任务" taskCount={2} taskViewMode="kanban" onViewChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '视图：看板' })).toHaveTextContent('看板');
  });

  it('看板与四象限下没有多选和展开子任务', () => {
    for (const mode of ['kanban', 'matrix'] as const) {
      const { unmount } = renderWithProviders(
        <PageTitle title="全部任务" taskCount={2} taskViewMode={mode} onViewChange={vi.fn()} onToggleSelection={vi.fn()} />,
      );
      expect(screen.queryByRole('button', { name: /多选/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /子任务/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('列表下多选和展开子任务都在', () => {
    renderWithProviders(
      <PageTitle title="全部任务" taskCount={2} taskViewMode="list" onViewChange={vi.fn()} onToggleSelection={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /多选/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /子任务/ })).toBeInTheDocument();
  });

  it('菜单渲染在页面顶层并用固定定位,点外面关闭', () => {
    renderWithProviders(<PageTitle title="全部任务" taskCount={2} taskViewMode="list" onViewChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: '视图：列表' });

    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(menu).toHaveClass('fixed');
    expect(trigger.parentElement?.contains(menu)).toBe(false);

    // 点外面关闭靠的是菜单下面那层全屏遮罩
    const backdrop = document.querySelector('.z-40');
    expect(backdrop).toHaveClass('fixed');
    fireEvent.click(backdrop!);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('排序下拉照常可用', () => {
    renderWithProviders(<PageTitle title="全部任务" taskCount={2} sortMode="manual" onSortChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '手动排序' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitemradio')).toHaveLength(9);
  });
});
