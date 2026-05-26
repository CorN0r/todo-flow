import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskDetailPanel } from '../../components/layout/TaskDetailPanel';
import { renderWithProviders } from '../test-utils';

const mockStoreState = {
  selectedTaskId: null as string | null,
  setSelectedTaskId: vi.fn(),
  isDetailDirty: false,
  detailSaveStatus: 'idle' as string,
};

vi.mock('../../stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: any) => {
    if (typeof selector === 'function') return selector(mockStoreState);
    return mockStoreState;
  }),
}));

vi.mock('../../hooks/useTasks', () => ({
  useTask: () => ({ data: null, isLoading: true }),
  useTasks: () => ({ data: null, isLoading: false }),
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useLists', () => ({
  useLists: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
  useCreateTag: () => ({ mutate: vi.fn() }),
}));

describe('TaskDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.selectedTaskId = null;
    mockStoreState.isDetailDirty = false;
    mockStoreState.detailSaveStatus = 'idle';
  });

  it('renders nothing when no task is selected', () => {
    const { container } = renderWithProviders(<TaskDetailPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders panel when task is selected', () => {
    mockStoreState.selectedTaskId = 'task-1';
    renderWithProviders(<TaskDetailPanel />);
    expect(screen.getByText('Task Details')).toBeInTheDocument();
  });

  it('renders close button when open', () => {
    mockStoreState.selectedTaskId = 'task-1';
    renderWithProviders(<TaskDetailPanel />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows saving indicator when dirty', () => {
    mockStoreState.selectedTaskId = 'task-1';
    mockStoreState.isDetailDirty = true;
    mockStoreState.detailSaveStatus = 'saving';
    renderWithProviders(<TaskDetailPanel />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });
});
