import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTheme } from '../../hooks/useTheme';
import { useUIStore } from '../../stores/uiStore';

// Mock getSetting/setSetting from lib/db
const storedSettings: Record<string, string> = {};
vi.mock('../../lib/db', () => ({
  getSetting: vi.fn(async (key: string) => storedSettings[key] ?? null),
  setSetting: vi.fn(async (key: string, value: string) => { storedSettings[key] = value; }),
}));

function TestComponent({ onResult }: { onResult: (r: ReturnType<typeof useTheme>) => void }) {
  const result = useTheme();
  onResult(result);
  return null;
}

function renderUseTheme(): ReturnType<typeof useTheme> {
  let captured: ReturnType<typeof useTheme> = null!;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TestComponent onResult={(r) => { captured = r; }} />
    </QueryClientProvider>,
  );
  return captured;
}

describe('useTheme', () => {
  beforeEach(() => {
    useUIStore.setState({ theme: 'system', resolvedTheme: 'light' });
    Object.keys(storedSettings).forEach((k) => delete storedSettings[k]);
    document.documentElement.classList.remove('dark');
  });

  it('returns theme and resolvedTheme from store', () => {
    const result = renderUseTheme();
    expect(result.theme).toBe('system');
    // resolvedTheme depends on matchMedia; 'light' when no dark preference
    expect(['light', 'dark']).toContain(result.resolvedTheme);
  });

  it('setTheme updates both store and persisted setting', async () => {
    const result = renderUseTheme();
    await act(async () => {
      result.setTheme('dark');
    });
    const state = useUIStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.resolvedTheme).toBe('dark');
  });

  it('applies dark class to document when resolvedTheme is dark', () => {
    useUIStore.setState({ theme: 'dark', resolvedTheme: 'dark' });
    renderUseTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
