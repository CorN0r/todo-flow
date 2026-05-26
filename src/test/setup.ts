import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// jsdom doesn't implement matchMedia — stub it for components/hooks that query system theme
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.remove('light');
});
