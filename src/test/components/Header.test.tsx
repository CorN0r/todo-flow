import { describe, it, expect, vi } from 'vitest';
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
    expect(screen.getByText('搜索任务...')).toBeInTheDocument();
  });

  it('renders theme toggle button', () => {
    renderWithProviders(<Header />);
    const buttons = screen.getAllByRole('button');
    const themeBtn = buttons.find((b) => b.getAttribute('title')?.startsWith('主题:'));
    expect(themeBtn).toBeInTheDocument();
  });

  it('renders minimize to tray button', () => {
    renderWithProviders(<Header />);
    const buttons = screen.getAllByRole('button');
    const minimizeBtn = buttons.find((b) => b.getAttribute('title') === '隐藏到浮窗');
    expect(minimizeBtn).toBeInTheDocument();
  });

  it('renders window control buttons', () => {
    renderWithProviders(<Header />);
    const buttons = screen.getAllByRole('button');
    const minimizeBtn = buttons.find((b) => b.getAttribute('aria-label') === '最小化');
    const maximizeBtn = buttons.find((b) => b.getAttribute('aria-label') === '最大化');
    const closeBtn = buttons.find((b) => b.getAttribute('aria-label') === '关闭');
    expect(minimizeBtn).toBeInTheDocument();
    expect(maximizeBtn).toBeInTheDocument();
    expect(closeBtn).toBeInTheDocument();
  });
});
