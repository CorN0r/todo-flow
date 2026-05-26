import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithTheme, resetTheme } from '../test-utils';
import { TaskDetail } from '../../components/tasks/TaskDetail';

const storeState = {
  selectedTaskId: 'task-1' as string | null,
};

vi.mock('../../stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: any) => {
    const state = {
      ...storeState,
      setSelectedTaskId: vi.fn(),
      isDetailDirty: false,
      detailSaveStatus: 'idle',
      selectionMode: false,
      selectedTaskIds: new Set<string>(),
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  }),
}));

vi.mock('../../hooks/useTasks', () => ({
  useTask: () => ({ data: null, isLoading: true }),
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

vi.mock('motion/react', () => ({
  motion: { div: 'div', button: 'button', span: 'span', section: 'section' },
  AnimatePresence: ({ children }: any) => children,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const snapshot = (el: HTMLElement) => el.innerHTML;

describe('TaskDetail visual modes', () => {
  afterEach(() => {
    resetTheme();
    storeState.selectedTaskId = 'task-1';
  });

  it('light: loading', () => {
    const { container } = renderWithTheme(<TaskDetail />, 'light');
    expect(snapshot(container)).toMatchSnapshot();
  });

  it('dark: loading', () => {
    const { container } = renderWithTheme(<TaskDetail />, 'dark');
    expect(snapshot(container)).toMatchSnapshot();
  });
});
