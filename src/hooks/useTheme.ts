import { useEffect } from 'react';
import { emit } from '@tauri-apps/api/event';
import { useUIStore } from '../stores/uiStore';
import { getSetting, setSetting } from '../lib/db';

const VALID_THEMES = ['light', 'dark', 'system', 'glass', 'warm', 'lumina'] as const;

type Theme = 'light' | 'dark' | 'system' | 'glass' | 'warm' | 'lumina';

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useUIStore();

  // Load saved theme
  useEffect(() => {
    getSetting('theme').then((saved) => {
      if (saved && (VALID_THEMES as readonly string[]).includes(saved)) {
        setTheme(saved as Theme);
      }
    });
  }, [setTheme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.classList.toggle('glass', theme === 'glass');
    root.classList.toggle('warm', theme === 'warm');
    root.classList.toggle('lumina', theme === 'lumina');

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

  const changeTheme = (newTheme: 'light' | 'dark' | 'system' | 'glass' | 'warm' | 'lumina') => {
    setTheme(newTheme);
    setSetting('theme', newTheme);
    emit('theme-changed', { theme: newTheme }).catch(() => {});
  };

  return { theme, resolvedTheme, setTheme: changeTheme };
}
