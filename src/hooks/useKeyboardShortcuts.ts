import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../stores/uiStore';

interface ShortcutCallbacks {
  onNewTask?: () => void;
  onToggleComplete?: () => void;
  onDeleteTask?: () => void;
  onToggleMyDay?: () => void;
}

export function useKeyboardShortcuts(callbacks?: ShortcutCallbacks) {
  const navigate = useNavigate();
  const { setSelectedTaskId, selectedTaskId, sidebarOpen, toggleSidebar, setCommandPaletteOpen, selectionMode, exitSelectionMode } = useUIStore();
  const callbacksRef = useRef(callbacks);
  useEffect(() => { callbacksRef.current = callbacks; });

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

      // New task: N key
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        callbacksRef.current?.onNewTask?.();
      }

      // Toggle complete: Ctrl+Enter
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && selectedTaskId) {
        e.preventDefault();
        callbacksRef.current?.onToggleComplete?.();
      }

      // Delete selected task: Delete key
      if (e.key === 'Delete' && selectedTaskId) {
        e.preventDefault();
        callbacksRef.current?.onDeleteTask?.();
      }

      // Toggle My Day: D key
      if (e.key === 'd' && !e.ctrlKey && !e.metaKey && selectedTaskId) {
        e.preventDefault();
        callbacksRef.current?.onToggleMyDay?.();
      }

      // Escape: exit selection mode first, then close panel
      if (e.key === 'Escape') {
        if (selectionMode) {
          e.preventDefault();
          exitSelectionMode();
          return;
        }
        if (selectedTaskId) {
          e.preventDefault();
          setSelectedTaskId(null);
        }
      }

      // Sidebar toggle
      if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleSidebar();
      }

      // Settings page
      if (e.key === '3' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigate('/settings');
      }

      // Command palette
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }

      // Show shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigate('/settings');
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, selectedTaskId, sidebarOpen, toggleSidebar, setCommandPaletteOpen, setSelectedTaskId, selectionMode, exitSelectionMode]);
}
