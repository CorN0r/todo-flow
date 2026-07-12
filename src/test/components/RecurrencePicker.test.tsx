import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecurrencePicker } from '../../components/shared/RecurrencePicker';
import { renderWithProviders } from '../test-utils';

describe('RecurrencePicker', () => {
  it('renders trigger button with default text', () => {
    renderWithProviders(<RecurrencePicker value="" onChange={vi.fn()} />);
    expect(screen.getByText('\u4e0d\u91cd\u590d')).toBeInTheDocument();
  });

  it('renders presets when clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecurrencePicker value="" onChange={vi.fn()} />);
    await user.click(screen.getByText('\u4e0d\u91cd\u590d'));
    expect(screen.getByText('\u6bcf\u5929')).toBeInTheDocument();
    expect(screen.getByText('\u6bcf\u5468')).toBeInTheDocument();
    expect(screen.getByText('\u6bcf\u6708')).toBeInTheDocument();
  });

  it('shows formatted value in trigger', () => {
    renderWithProviders(<RecurrencePicker value='{"type":"daily","interval":1}' onChange={vi.fn()} />);
    expect(screen.getByText('\u6bcf\u5929')).toBeInTheDocument();
  });

  it('calls onChange when preset selected', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<RecurrencePicker value="" onChange={onChange} />);
    await user.click(screen.getByText('\u4e0d\u91cd\u590d'));
    await user.click(screen.getByText('\u6bcf\u5468'));
    expect(onChange).toHaveBeenCalled();
  });
});
