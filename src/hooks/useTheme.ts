import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import { getSetting, setSetting } from '../lib/db';

const VALID_THEMES = ['light', 'dark', 'system', 'glass'] as const;

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useUIStore();

  // Load saved theme
  useEffect(() => {
    getSetting('theme').then((saved) => {
      if (saved && (VALID_THEMES as readonly string[]).includes(saved)) {
        setTheme(saved as 'light' | 'dark' | 'system' | 'glass');
      }
    });
  }, [setTheme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const isGlass = theme === 'glass';
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.classList.toggle('glass', isGlass);

    // Listen for system preference changes
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        root.classList.toggle('dark', e.matches);
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [resolvedTheme, theme]);

  const changeTheme = (newTheme: 'light' | 'dark' | 'system' | 'glass') => {
    setTheme(newTheme);
    setSetting('theme', newTheme);
  };

  return { theme, resolvedTheme, setTheme: changeTheme };
}
