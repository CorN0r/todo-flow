import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../stores/uiStore';

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const { setSelectedTaskId, selectedTaskId, sidebarOpen, toggleSidebar } = useUIStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Escape still works in inputs
        if (e.key !== 'Escape') return;
      }

      // Navigation
      if (e.key === '1' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigate('/');
      }
      if (e.key === '2' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigate('/calendar');
      }

      // Panel close
      if (e.key === 'Escape' && selectedTaskId) {
        e.preventDefault();
        setSelectedTaskId(null);
      }

      // Sidebar toggle
      if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, setSelectedTaskId, selectedTaskId, sidebarOpen, toggleSidebar]);
}
