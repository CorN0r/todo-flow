import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Header } from '../../components/layout/Header';
import { renderWithProviders } from '../test-utils';

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => ({
    data: [
      { id: 't1', title: 'Task 1', is_completed: false, due_date: '2026-05-25', is_archived: false, priority: 0, sort_order: 0, parent_task_id: null, list_id: null, tags: [], my_day_date: null, reminder: null, recurrence: null, children_count: 0, created_at: '', updated_at: '', description: '' },
    ],
    isLoading: false,
  }),
}));

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));

vi.mock('../../lib/db', () => ({
  hideToTray: vi.fn(),
}));

vi.mock('../../lib/date', () => ({
  todayISO: () => '2026-05-25',
}));

describe('Header', () => {
  it('renders task counts on today page', () => {
    renderWithProviders(<Header />, { initialEntries: ['/'] });
    expect(screen.getByText(/due today/)).toBeInTheDocument();
  });

  it('renders context label on calendar page', () => {
    renderWithProviders(<Header />, { initialEntries: ['/calendar/month'] });
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('renders theme toggle button', () => {
    renderWithProviders(<Header />);
    const buttons = screen.getAllByRole('button');
    const themeBtn = buttons.find((b) => b.getAttribute('title') === 'Toggle theme');
    expect(themeBtn).toBeInTheDocument();
  });

  it('renders minimize to tray button', () => {
    renderWithProviders(<Header />);
    const buttons = screen.getAllByRole('button');
    const minimizeBtn = buttons.find((b) => b.getAttribute('title') === 'Minimize to tray');
    expect(minimizeBtn).toBeInTheDocument();
  });
});
