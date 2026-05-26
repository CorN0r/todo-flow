import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { MyDayPage } from '../../pages/MyDayPage';
import { renderWithProviders, buildTask } from '../test-utils';

const mockState = { data: null as any, isLoading: false };

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => mockState,
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useLists', () => ({
  useLists: () => ({ data: [], isLoading: false }),
}));

describe('MyDayPage', () => {
  beforeEach(() => {
    mockState.data = null;
    mockState.isLoading = false;
  });

  it('shows loading skeleton when isLoading', () => {
    mockState.isLoading = true;
    mockState.data = undefined;
    renderWithProviders(<MyDayPage />);
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders header with My Day text', () => {
    mockState.data = [];
    renderWithProviders(<MyDayPage />);
    expect(screen.getByText('My Day')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    mockState.data = [];
    renderWithProviders(<MyDayPage />);
    expect(screen.getByText('Focus on what matters today')).toBeInTheDocument();
  });

  it('shows task count when tasks exist', () => {
    mockState.data = [buildTask({ id: 't1', title: 'T1' })];
    renderWithProviders(<MyDayPage />);
    expect(screen.getByText('1 task focused today')).toBeInTheDocument();
  });
});
