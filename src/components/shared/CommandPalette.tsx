import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  House, CalendarDays, Settings, Sun, Moon, Monitor,
  PanelLeft, PanelLeftClose, Plus, Search, Sparkles,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useCreateTask } from '../../hooks/useTasks';
import { useTheme } from '../../hooks/useTheme';

interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  category: string;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const { commandPaletteOpen, setCommandPaletteOpen, sidebarOpen, toggleSidebar } = useUIStore();
  const { setTheme } = useTheme();
  const createTask = useCreateTask();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery(''); // eslint-disable-line react-hooks/set-state-in-effect
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!commandPaletteOpen) return;
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const commands = useMemo<Command[]>(() => [
    { id: 'today', label: 'Go to Today', icon: <House size={16} />, shortcut: '1', action: () => navigate('/'), category: 'Navigation' },
    { id: 'calendar', label: 'Go to Calendar', icon: <CalendarDays size={16} />, shortcut: '2', action: () => navigate('/calendar'), category: 'Navigation' },
    { id: 'settings', label: 'Go to Settings', icon: <Settings size={16} />, shortcut: '3', action: () => navigate('/settings'), category: 'Navigation' },
    { id: 'toggle-sidebar', label: sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar', icon: sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />, shortcut: '⌘B', action: toggleSidebar, category: 'View' },
    { id: 'light', label: 'Light Theme', icon: <Sun size={16} />, action: () => setTheme('light'), category: 'View' },
    { id: 'dark', label: 'Dark Theme', icon: <Moon size={16} />, action: () => setTheme('dark'), category: 'View' },
    { id: 'system-theme', label: 'System Theme', icon: <Monitor size={16} />, action: () => setTheme('system'), category: 'View' },
    { id: 'glass', label: 'Glass Theme', icon: <Sparkles size={16} />, action: () => setTheme('glass'), category: 'View' },
    { id: 'new-task', label: 'Create New Task', icon: <Plus size={16} />, action: () => { createTask.mutate({ title: 'New task' }); setCommandPaletteOpen(false); }, category: 'Actions' },
  ], [navigate, sidebarOpen, toggleSidebar, setTheme, createTask, setCommandPaletteOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
  }, [query, commands]);

  const activeClamped = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeClamped];
      if (cmd) { cmd.action(); setCommandPaletteOpen(false); }
    }
  };

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="命令面板"
          className="fixed inset-0 bg-black/40 z-[150] flex items-start justify-center pt-[15vh]"
          onClick={() => setCommandPaletteOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Accent bar */}
            <div className="h-0.5 bg-gradient-to-r from-[#7C72F6] to-[#A78BFA]" />

            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#F3F4F6] dark:border-white/[0.06]">
              <Search size={16} className="text-[#9CA3AF] flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Type a command..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#9CA3AF]"
              />
              <kbd className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#F3F4F6] dark:bg-white/[0.06] text-[#9CA3AF] font-mono">esc</kbd>
            </div>

            {/* Command list */}
            <div className="max-h-[300px] overflow-y-auto p-1">
              {filtered.length === 0 && (
                <p className="text-sm text-[#9CA3AF] text-center py-8">No matching commands</p>
              )}
              {filtered.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onClick={() => { cmd.action(); setCommandPaletteOpen(false); }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                    i === activeClamped
                      ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6]'
                      : 'text-[#111827] dark:text-white/90 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={i === activeClamped ? 'text-[#7C72F6]' : 'text-[#9CA3AF]'}>
                    {cmd.icon}
                  </span>
                  <span className="flex-1">{cmd.label}</span>
                  {cmd.shortcut && (
                    <kbd className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#F3F4F6] dark:bg-white/[0.06] text-[#9CA3AF] font-mono">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-[#F3F4F6] dark:border-white/[0.06] flex items-center gap-4 text-[10px] text-[#9CA3AF]">
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-[#F3F4F6] dark:bg-white/[0.06] font-mono text-[#6B7280]">↑↓</kbd> Navigate</span>
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-[#F3F4F6] dark:bg-white/[0.06] font-mono text-[#6B7280]">↵</kbd> Select</span>
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-[#F3F4F6] dark:bg-white/[0.06] font-mono text-[#6B7280]">Esc</kbd> Close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
