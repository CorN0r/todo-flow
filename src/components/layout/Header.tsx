import { useLocation, useParams } from 'react-router-dom';
import { Sun, Moon, Minimize2 } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useTasks } from '../../hooks/useTasks';
import { SearchBar } from '../shared/SearchBar';
import { hideToTray } from '../../lib/db';
import { todayISO } from '../../lib/date';
import { useMemo } from 'react';

export function Header() {
  const location = useLocation();
  const params = useParams<{ listId?: string; tagId?: string; filter?: string }>();
  const { resolvedTheme, setTheme } = useTheme();
  const today = todayISO();

  const { data: todayTasks } = useTasks({
    due_date_from: today,
    due_date_to: today,
  });
  const { data: overdueTasks } = useTasks({
    due_date_to: today,
    is_completed: false,
  });

  const incompleteToday = todayTasks?.filter((t) => !t.is_completed).length ?? 0;
  const overdueCount = overdueTasks?.filter((t) => t.due_date && t.due_date < today).length ?? 0;

  const contextLabel = useMemo(() => {
    const path = location.pathname;
    if (path === '/' || path === '') return null; // Today — use task counts
    if (path === '/myday') return null;
    if (path.startsWith('/calendar')) return 'Calendar';
    if (path === '/settings') return 'Settings';
    if (path === '/dashboard') return 'Dashboard';
    if (path.startsWith('/list/') && params.listId) return null; // uses list name from hook
    if (path.startsWith('/tag/') && params.tagId) return null;
    if (path.startsWith('/date/')) {
      const labels: Record<string, string> = {
        all: 'All Tasks',
        tomorrow: 'Tomorrow',
        '3days': 'Next 3 Days',
        week: 'Next 7 Days',
        year: 'This Year',
      };
      return labels[params.filter || ''] || 'Tasks';
    }
    return null;
  }, [location.pathname, params]);

  // For task/list counts on the main pages
  const showTaskCounts = location.pathname === '/' || location.pathname === '' || location.pathname === '/myday';

  return (
    <header className="h-14 border-b flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-4 text-sm min-w-0">
        {showTaskCounts ? (
          <span className="text-muted-foreground truncate">
            <span className="font-semibold text-foreground">{incompleteToday}</span>
            {' '}due today
            {overdueCount > 0 && (
              <span className="text-red-500 ml-1.5">({overdueCount} overdue)</span>
            )}
          </span>
        ) : contextLabel ? (
          <span className="text-muted-foreground font-medium">{contextLabel}</span>
        ) : (
          <span className="text-muted-foreground truncate">{getDetailLabel(location.pathname, params)}</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <SearchBar />
        <button
          onClick={() => hideToTray()}
          className="p-2 rounded-md hover:bg-accent transition-colors"
          title="Minimize to tray"
        >
          <Minimize2 size={16} />
        </button>
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-md hover:bg-accent transition-colors"
          title="Toggle theme"
        >
          {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}

function getDetailLabel(pathname: string, params: { listId?: string; tagId?: string }): string {
  if (pathname.startsWith('/list/') && params.listId) return 'List details';
  if (pathname.startsWith('/tag/') && params.tagId) return 'Tag details';
  return 'TodoFlow';
}
