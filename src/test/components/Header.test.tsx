import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Header } from '../../components/layout/Header';
import { renderWithProviders } from '../test-utils';

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));

vi.mock('../../lib/db', () => ({
  hideToTray: vi.fn(),
  getTasks: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../lib/date', () => ({
  todayISO: () => '2026-05-25',
}));

describe('Header', () => {
  it('renders search bar trigger', () => {
    renderWithProviders(<Header />, { initialEntries: ['/'] });
    expect(screen.getByText('\u641c\u7d22\u4efb\u52a1...')).toBeInTheDocument();
  });

  it('renders theme toggle button', () => {
    renderWithProviders(<Header />);
    const themeBtn = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('title')?.startsWith('\u4e3b\u9898:'));
    expect(themeBtn).toBeInTheDocument();
  });

  it('renders minimize to tray button', () => {
    renderWithProviders(<Header />);
    expect(screen.getByTitle('\u9690\u85cf\u5230\u6d6e\u7a97')).toBeInTheDocument();
  });

  it('renders window control buttons', () => {
    renderWithProviders(<Header />);
    expect(screen.getByLabelText('\u6700\u5c0f\u5316')).toBeInTheDocument();
    expect(screen.getByLabelText('\u6700\u5927\u5316')).toBeInTheDocument();
    expect(screen.getByLabelText('\u5173\u95ed')).toBeInTheDocument();
  });
});
