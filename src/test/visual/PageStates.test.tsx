import { describe, it, expect, vi, afterEach } from 'vitest';

import { renderWithTheme, resetTheme } from '../test-utils';
import { TodayPage } from '../../pages/TodayPage';
import { MyDayPage } from '../../pages/MyDayPage';
import { TagPage } from '../../pages/TagPage';

import { DateFilterPage } from '../../pages/DateFilterPage';

// Common mocks for pages that use useTasks
const mockTasks = { data: null as any, isLoading: false };
const mockStats = {
  total_tasks: 10, completed_tasks: 4, incomplete_tasks: 6,
  overdue_tasks: 2, streak_days: 3, today_completed: 1,
  completion_by_date: [], tasks_by_tag: [],
};

vi.mock('../../hooks/useTasks', () => ({
  useTasks: () => mockTasks,
  useTask: () => ({ data: null, isLoading: true }),
  useCreateTask: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useDuplicateTask: () => ({ mutate: vi.fn() }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../hooks/useCalendarEvents', () => ({
  useCalendarEvents: () => ({ events: [], eventsByDate: {}, isLoading: false }),
}));

vi.mock('../../lib/db', () => ({
  getTasks: vi.fn(() => Promise.resolve([])),
  getDashboardStats: vi.fn().mockResolvedValue(mockStats),
  getSetting: vi.fn(() => Promise.resolve(null)),
  setSetting: vi.fn(),
  getAllSettings: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: any) => {
    const state = {
      theme: 'system', resolvedTheme: 'light', sidebarOpen: true,
      selectedTaskId: null, selectionMode: false, selectedTaskIds: new Set(),
      setSelectedTaskId: vi.fn(), isDetailDirty: false, detailSaveStatus: 'idle',
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  }),
}));

vi.mock('../../stores/calendarStore', () => ({
  useCalendarStore: vi.fn((selector?: any) => {
    const state = { viewMode: 'month', currentDate: '2026-05-26' };
    if (typeof selector === 'function') return selector(state);
    return state;
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({}), useNavigate: () => vi.fn() };
});

const snapshot = (el: HTMLElement) => el.innerHTML;

function snapshotLoading(page: React.ReactElement, name: string, theme: 'light' | 'dark') {
  it(`${theme}: ${name} loading`, () => {
    mockTasks.isLoading = true;
    mockTasks.data = undefined;
    const { container } = renderWithTheme(page, theme, { initialEntries: ['/'] });
    expect(snapshot(container)).toMatchSnapshot();
  });
}

function snapshotEmpty(page: React.ReactElement, name: string, theme: 'light' | 'dark') {
  it(`${theme}: ${name} empty`, () => {
    mockTasks.isLoading = false;
    mockTasks.data = [];
    const { container } = renderWithTheme(page, theme, { initialEntries: ['/'] });
    expect(snapshot(container)).toMatchSnapshot();
  });
}

describe('Page visual states', () => {
  afterEach(() => { resetTheme(); mockTasks.isLoading = false; mockTasks.data = null; });

  // Light theme
  describe('light theme', () => {
    snapshotLoading(<TodayPage />, 'TodayPage', 'light');
    snapshotEmpty(<TodayPage />, 'TodayPage', 'light');
    snapshotLoading(<MyDayPage />, 'MyDayPage', 'light');
    snapshotEmpty(<MyDayPage />, 'MyDayPage', 'light');
    snapshotLoading(<TagPage />, 'TagPage', 'light');
    snapshotEmpty(<TagPage />, 'TagPage', 'light');

    snapshotLoading(<DateFilterPage />, 'DateFilterPage', 'light');
    snapshotEmpty(<DateFilterPage />, 'DateFilterPage', 'light');
  });

  // Dark theme
  describe('dark theme', () => {
    snapshotLoading(<TodayPage />, 'TodayPage', 'dark');
    snapshotEmpty(<TodayPage />, 'TodayPage', 'dark');
    snapshotLoading(<MyDayPage />, 'MyDayPage', 'dark');
    snapshotEmpty(<MyDayPage />, 'MyDayPage', 'dark');
    snapshotLoading(<TagPage />, 'TagPage', 'dark');
    snapshotEmpty(<TagPage />, 'TagPage', 'dark');

    snapshotLoading(<DateFilterPage />, 'DateFilterPage', 'dark');
    snapshotEmpty(<DateFilterPage />, 'DateFilterPage', 'dark');
  });
});
