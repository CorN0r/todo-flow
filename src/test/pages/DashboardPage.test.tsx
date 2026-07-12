import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { DashboardPage } from '../../pages/DashboardPage';
import { renderWithProviders } from '../test-utils';

const { mockStats } = vi.hoisted(() => ({
  mockStats: {
    total_tasks: 10,
    completed_tasks: 4,
    incomplete_tasks: 6,
    overdue_tasks: 2,
    suspended_tasks: 1,
    abandoned_tasks: 1,
    streak_days: 3,
    today_completed: 1,
    completion_by_date: [
      { date: '2026-05-25', completed: 1 },
      { date: '2026-05-24', completed: 2 },
    ],
    tasks_by_tag: [
      { tag_id: 't1', tag_name: 'Work', tag_color: '#ff0000', count: 6 },
      { tag_id: 't2', tag_name: 'Home', tag_color: '#00ff00', count: 4 },
    ],
  },
}));

vi.mock('../../lib/db', () => ({
  getDashboardStats: vi.fn().mockResolvedValue(mockStats),
  getSetting: vi.fn(() => Promise.resolve(null)),
  setSetting: vi.fn(),
}));

describe('DashboardPage', () => {
  it('renders dashboard header', async () => {
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('\u6570\u636e\u770b\u677f')).toBeInTheDocument();
    });
  });

  it('shows stat cards with values', async () => {
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('\u5df2\u5b8c\u6210')).toBeInTheDocument();
    });
    expect(screen.getByText('\u672a\u5b8c\u6210')).toBeInTheDocument();
    expect(screen.getByText('\u8d85\u671f')).toBeInTheDocument();
    // Numeric values may appear in both stat cards and list distribution
    expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('6').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  it('shows completion rate', async () => {
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('10 \u603b\u4efb\u52a1')).toBeInTheDocument();
    });
    expect(screen.getByText('\u4eca\u65e5\u5b8c\u6210 1')).toBeInTheDocument();
  });
});
