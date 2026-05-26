import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecurrencePicker } from '../../components/shared/RecurrencePicker';
import { renderWithProviders } from '../test-utils';

describe('RecurrencePicker', () => {
  it('renders trigger button with default text "No repeat"', () => {
    renderWithProviders(<RecurrencePicker value="" onChange={vi.fn()} />);
    expect(screen.getByText('No repeat')).toBeInTheDocument();
  });

  it('renders presets when clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecurrencePicker value="" onChange={vi.fn()} />);
    await user.click(screen.getByText('No repeat'));
    expect(screen.getByText('Every day')).toBeInTheDocument();
    expect(screen.getByText('Every week')).toBeInTheDocument();
    expect(screen.getByText('Every month')).toBeInTheDocument();
  });

  it('shows formatted value in trigger', () => {
    renderWithProviders(<RecurrencePicker value='{"type":"daily","interval":1}' onChange={vi.fn()} />);
    expect(screen.getByText('Every day')).toBeInTheDocument();
  });

  it('calls onChange when preset selected', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<RecurrencePicker value="" onChange={onChange} />);
    await user.click(screen.getByText('No repeat'));
    await user.click(screen.getByText('Every week'));
    expect(onChange).toHaveBeenCalled();
  });
});
