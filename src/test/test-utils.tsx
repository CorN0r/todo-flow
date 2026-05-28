/* eslint-disable react-refresh/only-export-components */
import { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { Task } from '../types/task';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface WrapperProps {
  children: ReactElement;
  initialEntries?: string[];
}

export function AllProviders({ children, initialEntries = ['/'] }: WrapperProps) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { initialEntries?: string[] },
) {
  const { initialEntries, ...renderOptions } = options || {};
  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders initialEntries={initialEntries}>{children as ReactElement}</AllProviders>
    ),
    ...renderOptions,
  });
}

export function renderWithTheme(
  ui: ReactElement,
  theme: 'light' | 'dark' = 'light',
  options?: Omit<RenderOptions, 'wrapper'> & { initialEntries?: string[] },
) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const result = renderWithProviders(ui, options);
  return result;
}

/** Set a deterministic system time for all tests. Call in beforeAll/beforeEach. */
export function setTestDate(isoDate: string) {
  vi.setSystemTime(new Date(isoDate));
}

/** Reset theme class between tests. Call in afterEach. */
export function resetTheme() {
  document.documentElement.classList.remove('dark');
}

// ─── Fixture factories ────────────────────────────────────────────

let _factoryIdCounter = 0;
function fid() {
  _factoryIdCounter += 1;
  return `test-${_factoryIdCounter}`;
}

export function resetFactoryIds() {
  _factoryIdCounter = 0;
}

export function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: fid(),
    title: 'Test Task',
    description: '',
    is_completed: false,
    is_archived: false,
    priority: 0,
    due_date: null,
    reminder: null,
    tag_id: null,
    parent_task_id: null,
    sort_order: 0,
    recurrence: null,
    my_day_date: null,
    children_count: 0,
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    ...overrides,
  };
}

export function buildTag(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: fid(),
    name: 'Test Tag',
    color: '#6366f1',
    icon: 'tag',
    sort_order: 0,
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    ...overrides,
  };
}

export { createTestQueryClient };
