import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MyDayPage } from '../../pages/MyDayPage';
import { buildTask, renderWithProviders } from '../test-utils';
import { useUIStore } from '../../stores/uiStore';

const mockState = { data: null as any, isLoading: false, isError: false };

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

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

describe('MyDayPage', () => {
  beforeEach(() => {
    mockState.data = null;
    mockState.isLoading = false;
    mockState.isError = false;
    sessionStorage.clear();
    useUIStore.setState({ taskStatusFilter: 'all', selectedTaskId: null, selectedTaskIds: new Set() });
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
    expect(screen.getByText('\u6211\u7684\u4e00\u5929')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    mockState.data = [];
    renderWithProviders(<MyDayPage />);
    expect(screen.getByText('\u4eca\u5929\u6ca1\u6709\u4efb\u52a1')).toBeInTheDocument();
  });

  it('shows task count when tasks exist', () => {
    mockState.data = [buildTask({ id: 't1', title: 'T1' })];
    renderWithProviders(<MyDayPage />);
    expect(screen.getByRole('button', { name: '\u5168\u90e8 1' })).toBeInTheDocument();
  });
});
