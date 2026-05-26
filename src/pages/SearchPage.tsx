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
      doSearch(initialQuery);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {/* Search header */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-primary bg-card shadow-sm">
          <Search size={20} className="text-primary flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks by title or description..."
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <X size={16} className="text-muted-foreground" />
            </button>
          )}
        </div>
        {hasSearched && !loading && query && (
          <p className="text-xs text-muted-foreground mt-2 ml-1">
            Found {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
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
            <TaskQuickAdd showListPicker showDatePicker />
          </div>
        </>
      ) : hasSearched && query ? (
        <EmptyState
          icon={<Search size={40} />}
          title="No tasks found"
          description={`Try a different keyword or create a new task`}
        />
      ) : !query ? (
        <div className="max-w-2xl mx-auto">
          <EmptyState
            icon={<Search size={40} />}
            title="Search your tasks"
            description="Type a keyword to search across all task titles and descriptions"
          />
          {/* Quick actions */}
          <div className="mt-6 grid grid-cols-2 gap-2">
            {[
              { label: 'Overdue', query: 'overdue', hint: 'find overdue items' },
              { label: 'High priority', query: 'urgent', hint: 'filter by priority' },
              { label: 'Recent', query: 'meeting', hint: 'search by keyword' },
              { label: 'Completed', query: 'done', hint: 'find finished tasks' },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => setQuery(item.query)}
                className="flex items-center gap-2 p-3 rounded-xl border bg-card hover:bg-accent transition-colors text-left group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.hint}</div>
                </div>
                <ArrowRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
