import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, ArrowRight } from 'lucide-react';
import { getTasks } from '../lib/db';
import { TaskList } from '../components/tasks/TaskList';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { EmptyState } from '../components/shared/EmptyState';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import type { Task } from '../types/task';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      setHasSearched(false);
      setSearchParams({});
      return;
    }
    setLoading(true);
    setHasSearched(true);
    setSearchParams({ q });
    try {
      const tasks = await getTasks({ search_query: q });
      setResults(tasks);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [setSearchParams]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  // Handle initial query from URL
  useEffect(() => {
    if (initialQuery) {
      doSearch(initialQuery); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {/* Search header */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-[#1e1e32] border-2 border-[#F3F4F6] dark:border-white/[0.07] shadow-sm transition-colors focus-within:border-[#7C72F6] dark:focus-within:border-[#7C72F6]/60">
          <div className="w-10 h-10 rounded-xl bg-[#7C72F6]/[0.1] flex items-center justify-center flex-shrink-0">
            <Search size={18} className="text-[#7C72F6]" />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks by title or description..."
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#9CA3AF]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors"
            >
              <X size={16} className="text-[#9CA3AF]" />
            </button>
          )}
        </div>
        {hasSearched && !loading && query && (
          <p className="section-label mt-3 ml-1">
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <LoadingSkeleton count={5} />
      ) : hasSearched && results.length > 0 ? (
        <>
          <TaskList tasks={results} />
          <div className="mt-2">
            <TaskQuickAdd />
          </div>
        </>
      ) : hasSearched && query ? (
        <EmptyState
          icon={<Search size={40} />}
          title="No tasks found"
          description="Try a different keyword or create a new task"
        />
      ) : !query ? (
        <div className="max-w-2xl mx-auto">
          <EmptyState
            icon={<Search size={40} />}
            title="Search your tasks"
            description="Type a keyword to search across all task titles and descriptions"
          />
          {/* Quick actions */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              { label: 'Overdue', query: 'overdue', hint: 'find overdue items', icon: '!' },
              { label: 'High priority', query: 'urgent', hint: 'filter by priority', icon: '!!' },
              { label: 'Recent', query: 'meeting', hint: 'search by keyword', icon: '#' },
              { label: 'Completed', query: 'done', hint: 'find finished tasks', icon: '✓' },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => setQuery(item.query)}
                className="flex items-center gap-3 p-4 rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] hover:border-[#E5E7EB] dark:hover:border-white/[0.1] transition-all text-left group shadow-sm"
              >
                <div className="w-9 h-9 rounded-lg bg-[#F3F4F6] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-[#6B7280] text-sm font-bold group-hover:text-[#7C72F6] transition-colors">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#111827] dark:text-white/90">{item.label}</div>
                  <div className="text-[12px] text-[#9CA3AF]">{item.hint}</div>
                </div>
                <ArrowRight size={14} className="text-[#D1D5DB] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
