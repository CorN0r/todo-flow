import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar } from '../../components/shared/SearchBar';
import { renderWithProviders } from '../test-utils';

vi.mock('../../stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: any) => {
    const state = { setSelectedTaskId: vi.fn() };
    if (typeof selector === 'function') return selector(state);
    return state;
  }),
}));

vi.mock('../../lib/db', () => ({
  getTasks: vi.fn(() => Promise.resolve([])),
}));

describe('SearchBar', () => {
  it('renders search trigger button', () => {
    renderWithProviders(<SearchBar />);
    expect(screen.getByText('Search tasks...')).toBeInTheDocument();
  });

  it('shows keyboard shortcut hint', () => {
    renderWithProviders(<SearchBar />);
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
  });

  it('opens search overlay on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchBar />);
    await user.click(screen.getByText('Search tasks...'));
    expect(screen.getByPlaceholderText(/Search tasks by title/)).toBeInTheDocument();
  });

  it('shows type prompt when query is empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchBar />);
    await user.click(screen.getByText('Search tasks...'));
    expect(screen.getByText(/Type at least 2 characters/)).toBeInTheDocument();
  });
});
