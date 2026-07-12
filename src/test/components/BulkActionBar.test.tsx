import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { BulkActionBar } from '../../components/shared/BulkActionBar';
import { renderWithProviders } from '../test-utils';

const mockStoreState = {
  selectionMode: true,
  selectedTaskIds: new Set(['t1', 't2', 't3']),
  selectableIds: ['t1', 't2', 't3'],
  exitSelectionMode: vi.fn(),
  selectAllTasks: vi.fn(),
};

vi.mock('../../stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: any) => {
    if (typeof selector === 'function') return selector(mockStoreState);
    return mockStoreState;
  }),
}));

const mockMutate = vi.fn();

vi.mock('../../hooks/useTasks', () => ({
  useUpdateTask: () => ({ mutate: mockMutate }),
  useDeleteTask: () => ({ mutate: mockMutate }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({
    data: [{ id: 't1', name: 'Work', color: '#ff0000', icon: 'tag', sort_order: 0, created_at: '', updated_at: '' }],
    isLoading: false,
  }),
}));

describe('BulkActionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.selectionMode = true;
    mockStoreState.selectedTaskIds = new Set(['t1', 't2', 't3']);
    mockStoreState.selectableIds = ['t1', 't2', 't3'];
  });

  it('renders selected count', () => {
    renderWithProviders(<BulkActionBar />);
    expect(screen.getByText(/\u5df2\u9009\s*3\s*\u9879/)).toBeInTheDocument();
  });

  it('renders Complete button', () => {
    renderWithProviders(<BulkActionBar />);
    expect(screen.getByText('\u5b8c\u6210')).toBeInTheDocument();
  });

  it('renders Delete button', () => {
    renderWithProviders(<BulkActionBar />);
    expect(screen.getByText('\u5220\u9664')).toBeInTheDocument();
  });

  it('renders Move to tag button', () => {
    renderWithProviders(<BulkActionBar />);
    expect(screen.getByText(/\u79fb\u52a8\u5230\u6807\u7b7e/)).toBeInTheDocument();
  });

  it('does not render when selectionMode is false', () => {
    mockStoreState.selectionMode = false;
    mockStoreState.selectedTaskIds = new Set();
    const { container } = renderWithProviders(<BulkActionBar />);
    expect(container.innerHTML).toBe('');
  });
});
