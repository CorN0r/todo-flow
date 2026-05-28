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
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('shows stat cards with values', async () => {
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Day streak')).toBeInTheDocument();
    // Numeric values may appear in both stat cards and list distribution
    expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('6').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows completion rate', async () => {
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('10 total tasks')).toBeInTheDocument();
    });
    expect(screen.getByText('1 completed today')).toBeInTheDocument();
  });
});
