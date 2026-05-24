import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import { getSetting, setSetting } from '../lib/db';

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useUIStore();

  // Load saved theme
  useEffect(() => {
    getSetting('theme').then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setTheme(saved);
      }
    });
  }, [setTheme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');

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

  const changeTheme = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    setSetting('theme', newTheme);
  };

  return { theme, resolvedTheme, setTheme: changeTheme };
}
