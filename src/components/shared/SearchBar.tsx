import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getTasks } from '../../lib/db';
import { useUIStore } from '../../stores/uiStore';
import type { Task } from '../../types/task';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Task[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const tasks = await getTasks({ search_query: query });
        setResults(tasks.slice(0, 8));
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Global Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = (task: Task) => {
    setSelectedTaskId(task.id);
    setIsOpen(false);
    setQuery('');
    // Navigate to the appropriate page
    if (task.list_id) {
      navigate(`/list/${task.list_id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md border bg-muted hover:bg-muted transition-colors min-w-[200px]"
      >
        <Search size={14} />
        <span>Search tasks...</span>
        <kbd className="ml-auto text-[10px] px-1 py-0.5 rounded bg-muted-foreground/10 border">
          Ctrl+K
        </kbd>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setIsOpen(false)} />
          <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[480px] max-w-[90vw] bg-background border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center gap-2 p-3 border-b">
              <Search size={16} className="text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Search tasks by title or description..."
                className="flex-1 bg-transparent text-sm outline-none"
                autoFocus
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              )}
              <kbd className="text-[10px] px-1 py-0.5 rounded bg-muted border text-muted-foreground">
                ESC
              </kbd>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {results.length === 0 && query.length >= 2 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No tasks found.
                </p>
              )}
              {results.length > 0 && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground border-b">
                  {results.length} result{results.length !== 1 ? 's' : ''} — top matches
                </div>
              )}
              {results.map((task, i) => (
                <button
                  key={task.id}
                  onClick={() => handleSelect(task)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors',
                    i === selectedIndex ? 'bg-accent' : 'hover:bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'w-3 h-3 rounded-full flex-shrink-0',
                      task.is_completed ? 'bg-muted' : 'bg-primary'
                    )}
                  />
                  <span className={cn(task.is_completed && 'line-through text-muted-foreground')}>
                    {task.title}
                  </span>
                  {task.due_date && (
                    <span className="ml-auto text-xs text-muted-foreground">{task.due_date}</span>
                  )}
                </button>
              ))}
            </div>
            {results.length > 0 && (
              <button
                onClick={() => {
                  navigate(`/search?q=${encodeURIComponent(query)}`);
                  setIsOpen(false);
                  setQuery('');
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-primary hover:bg-accent border-t transition-colors font-medium"
              >
                Show all results
                <ArrowRight size={14} />
              </button>
            )}
            {query.length < 2 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Search size={24} className="mx-auto mb-2 opacity-30" />
                Type at least 2 characters to search tasks.
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
