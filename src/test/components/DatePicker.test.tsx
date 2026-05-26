import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePicker } from '../../components/shared/DatePicker';
import { renderWithProviders } from '../test-utils';

describe('DatePicker', () => {
  it('renders trigger button', () => {
    renderWithProviders(<DatePicker value="" onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows formatted date in trigger when value is set', () => {
    renderWithProviders(<DatePicker value="2026-06-15" onChange={vi.fn()} />);
    // Trigger should show the date text
    expect(screen.getByText('2026-06-15')).toBeInTheDocument();
  });

  it('opens calendar on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DatePicker value="" onChange={vi.fn()} />);
    const trigger = screen.getAllByRole('button')[0];
    await user.click(trigger);
    expect(screen.getByText('Su')).toBeInTheDocument();
    expect(screen.getByText('Mo')).toBeInTheDocument();
  });
});
