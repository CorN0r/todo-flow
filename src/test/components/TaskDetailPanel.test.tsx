import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskDetailPanel } from '../../components/layout/TaskDetailPanel';
import { renderWithProviders } from '../test-utils';

const mockStoreState = {
  selectedTaskId: null as string | null,
  setSelectedTaskId: vi.fn(),
  isDetailDirty: false,
  detailSaveStatus: 'idle' as string,
  theme: 'light',
  taskViewMode: 'list',
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

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

describe('TaskDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.selectedTaskId = null;
    mockStoreState.isDetailDirty = false;
    mockStoreState.detailSaveStatus = 'idle';
    mockStoreState.taskViewMode = 'list';
  });

  it('renders nothing when no task is selected', () => {
    const { container } = renderWithProviders(<TaskDetailPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders panel shell when task is selected', () => {
    mockStoreState.selectedTaskId = 'task-1';
    renderWithProviders(<TaskDetailPanel />);
    expect(document.querySelector('aside')).toBeInTheDocument();
  });

  it('renders close button when open', () => {
    mockStoreState.selectedTaskId = 'task-1';
    renderWithProviders(<TaskDetailPanel />);
    expect(screen.getByLabelText('\u5173\u95ed')).toBeInTheDocument();
  });

  it('keeps the panel mounted while detail edits are dirty', () => {
    mockStoreState.selectedTaskId = 'task-1';
    mockStoreState.isDetailDirty = true;
    mockStoreState.detailSaveStatus = 'saving';
    renderWithProviders(<TaskDetailPanel />);
    expect(document.querySelector('aside')).toBeInTheDocument();
  });
});
