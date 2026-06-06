import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getTasks } from '../../lib/db';
import { useUIStore } from '../../stores/uiStore';
import { Portal } from './Portal';
import type { Task } from '../../types/task';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Task[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setTotalCount(0);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const tasks = await getTasks({ search_query: query, include_children: true });
        if (mountedRef.current) {
          const list = Array.isArray(tasks) ? tasks : [];
          setTotalCount(list.length);
          setResults(list.slice(0, 8));
        }
      } catch (err) {
        if (mountedRef.current) {
          console.error('[SearchBar] search failed:', err);
          setResults([]);
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (task: Task) => {
    setSelectedTaskId(task.id);
    setIsOpen(false);
    setQuery('');
    // Navigate to the appropriate page
    if (task.tag_id) {
      navigate(`/tag/${task.tag_id}`);
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
        className="flex items-center gap-2 text-[13px] text-[#9CA3AF] hover:text-[#6B7280] h-8 px-3 rounded-lg border border-[#E5E7EB] bg-[#F3F4F6] hover:bg-[#E5E7EB] transition-colors min-w-[180px] dark:bg-white/[0.06] dark:border-white/[0.07] dark:hover:bg-white/[0.1]"
      >
        <Search size={14} />
        <span className="flex-1 text-left">搜索任务...</span>
        <kbd className="text-[10px] px-1 py-0.5 rounded bg-white dark:bg-white/10 border border-[#E5E7EB] dark:border-white/10 text-[#D1D5DB] flex-shrink-0">
          /
        </kbd>
      </button>

      {isOpen && (
        <Portal>
          <div className={`fixed inset-0 z-[200] ${isGlass ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/40'}`} onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div className={`fixed top-[20%] left-1/2 -translate-x-1/2 w-[480px] max-w-[90vw] rounded-2xl shadow-2xl z-[200] overflow-hidden ${isGlass ? 'glass-panel-strong' : 'bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07]'}`}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#F3F4F6] dark:border-white/[0.06]">
              <Search size={16} className="text-[#9CA3AF]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="搜索任务..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#9CA3AF]"
                autoFocus
                role="combobox"
                aria-expanded={isOpen}
                aria-autocomplete="list"
                aria-controls="search-results-list"
              />
              {query && (
                <button onClick={() => setQuery('')} className="p-1 rounded-md hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors">
                  <X size={14} className="text-[#9CA3AF]" />
                </button>
              )}
              <kbd className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#F3F4F6] dark:bg-white/[0.06] text-[#9CA3AF] font-mono">
                ESC
              </kbd>
            </div>
            <div className="max-h-[380px] overflow-y-auto p-1">
              {results.length === 0 && query.length >= 2 && (
                <p className="text-sm text-[#9CA3AF] text-center py-10">
                  未找到 "{query}" 相关任务
                </p>
              )}
              {results.length > 0 && (
                <div role="listbox" id="search-results-list" className="px-3 py-2 section-label">
                  任务 — {results.length}{totalCount > 8 ? ` / ${totalCount}` : ''} 条
                </div>
              )}
              {results.map((task, i) => (
                <button
                  key={task.id}
                  onClick={() => handleSelect(task)}
                  role="option"
                  aria-selected={i === selectedIndex}
                  className={cn(
                    'w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm rounded-lg transition-colors',
                    i === selectedIndex
                      ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6]'
                      : 'hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]'
                  )}
                >
                  <span
                    className={cn(
                      'w-2.5 h-2.5 rounded-full flex-shrink-0',
                      task.is_completed ? 'bg-[#D1D5DB]' : 'bg-[#7C72F6]'
                    )}
                  />
                  <span className={cn(
                    'flex-1 truncate',
                    task.is_completed && 'line-through text-[#9CA3AF]'
                  )}>
                    {task.title}
                  </span>
                  {task.due_date && (
                    <span className="text-[11px] text-[#9CA3AF] flex-shrink-0">{task.due_date}</span>
                  )}
                </button>
              ))}
            </div>
            {query.length < 2 && (
              <div className="py-10 text-center">
                <Search size={28} className="mx-auto mb-3 text-[#D1D5DB]" />
                <p className="text-sm text-[#9CA3AF]">
                  输入至少 2 个字符进行搜索
                </p>
              </div>
            )}
            <div className="flex items-center justify-end px-4 py-2.5 border-t border-[#F3F4F6] dark:border-white/[0.06]">
              {totalCount > 8 ? (
                <button
                  onClick={() => {
                    navigate(`/search?q=${encodeURIComponent(query)}`);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className="text-[11px] text-[#7C72F6] hover:text-[#6D63E6] transition-colors"
                >
                  显示全部 {totalCount} 条结果 →
                </button>
              ) : (
                <button
                  onClick={() => {
                    navigate(query.length >= 2 ? `/search?q=${encodeURIComponent(query)}` : '/search');
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className="text-[11px] text-[#7C72F6] hover:text-[#6D63E6] transition-colors"
                >
                  更多筛选条件 →
                </button>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
