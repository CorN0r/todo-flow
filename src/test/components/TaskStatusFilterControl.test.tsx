import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { TaskStatusFilterControl } from '../../components/shared/TaskStatusFilterControl';
import type { TaskStatusCounts } from '../../lib/taskStatusFilter';
import { renderWithProviders } from '../test-utils';

const counts: TaskStatusCounts = {
  all: 9,
  active: 3,
  completed: 2,
  suspended: 1,
  abandoned: 1,
  overdue: 2,
};

afterEach(async () => {
  await i18n.changeLanguage('zh-CN');
});

describe('TaskStatusFilterControl', () => {
  it('renders primary choices with accessible selected state', () => {
    renderWithProviders(<TaskStatusFilterControl value="active" counts={counts} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '进行中 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '全部 9' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('chooses a secondary status from the menu', () => {
    const onChange = vi.fn();
    renderWithProviders(<TaskStatusFilterControl value="all" counts={counts} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '更多状态' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /挂起/ }));
    expect(onChange).toHaveBeenCalledWith('suspended');
  });

  it('keeps the selected secondary status visible on the trigger', () => {
    renderWithProviders(<TaskStatusFilterControl value="suspended" counts={counts} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '更多状态' })).toHaveTextContent('挂起 1');
    expect(screen.getByRole('button', { name: '更多状态' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses localized labels after changing language', async () => {
    await i18n.changeLanguage('en-US');
    renderWithProviders(<TaskStatusFilterControl value="completed" counts={counts} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Completed 2' })).toHaveAttribute('aria-pressed', 'true');
  });
});
