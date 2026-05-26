import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskQuickAdd } from '../../components/tasks/TaskQuickAdd';
import { renderWithProviders } from '../test-utils';

vi.mock('../../hooks/useTasks', () => ({
  useCreateTask: () => ({
    mutate: vi.fn(),
    isLoading: false,
    isError: false,
    isSuccess: false,
  }),
}));

vi.mock('../../hooks/useLists', () => ({
  useLists: () => ({
    data: [
      { id: 'l1', name: 'Work', color: '#ff0000', icon: 'list', sort_order: 0, created_at: '', updated_at: '' },
      { id: 'l2', name: 'Home', color: '#00ff00', icon: 'list', sort_order: 1, created_at: '', updated_at: '' },
    ],
    isLoading: false,
  }),
}));

describe('TaskQuickAdd', () => {
  it('renders input with placeholder', () => {
    renderWithProviders(<TaskQuickAdd />);
    expect(screen.getByPlaceholderText('Add a task...')).toBeInTheDocument();
  });

  it('accepts custom placeholder', () => {
    renderWithProviders(<TaskQuickAdd placeholder="New subtask..." />);
    expect(screen.getByPlaceholderText('New subtask...')).toBeInTheDocument();
  });

  it('shows list picker when showListPicker is true', () => {
    renderWithProviders(<TaskQuickAdd showListPicker />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('does not show list picker by default', () => {
    renderWithProviders(<TaskQuickAdd />);
    expect(screen.queryByText('Work')).not.toBeInTheDocument();
  });

  it('has date-related elements when showDatePicker is true', () => {
    renderWithProviders(<TaskQuickAdd showDatePicker />);
    // Date input should be visible
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(1);
  });
});
