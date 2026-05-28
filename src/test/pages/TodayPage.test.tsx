import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { TodayPage } from '../../pages/TodayPage';
import { renderWithProviders, buildTask } from '../test-utils';

const mockState = { data: null as any, isLoading: false, isError: false };

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => mockState,
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

describe('TodayPage', () => {
  beforeEach(() => {
    mockState.data = null;
    mockState.isLoading = false;
    mockState.isError = false;
  });

  it('shows loading skeleton when isLoading', () => {
    mockState.isLoading = true;
    mockState.data = undefined;
    renderWithProviders(<TodayPage />);
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders header with 今天 text', () => {
    mockState.data = [];
    renderWithProviders(<TodayPage />);
    expect(screen.getByText('今天')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    mockState.data = [];
    renderWithProviders(<TodayPage />);
    expect(screen.getByText('今天没有到期任务')).toBeInTheDocument();
  });

  it('shows task count when tasks exist', () => {
    mockState.data = [
      buildTask({ id: 't1', title: 'Task 1', due_date: '2026-05-25' }),
    ];
    renderWithProviders(<TodayPage />);
    expect(screen.getByText('0/1 项')).toBeInTheDocument();
  });

  it('shows plural task count', () => {
    mockState.data = [
      buildTask({ id: 't1', title: 'T1', due_date: '2026-05-25' }),
      buildTask({ id: 't2', title: 'T2', due_date: '2026-05-25' }),
    ];
    renderWithProviders(<TodayPage />);
    expect(screen.getByText('0/2 项')).toBeInTheDocument();
  });
});
