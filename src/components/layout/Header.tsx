import { useLocation } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { SearchBar } from '../shared/SearchBar';

const pageTitles: Record<string, string> = {
  '/': 'Today',
  '/calendar': 'Calendar',
};

export function Header() {
  const location = useLocation();
  const { resolvedTheme, setTheme } = useTheme();

  const title =
    pageTitles[location.pathname] ||
    (location.pathname.startsWith('/list/') ? 'List' : 'TodoFlow');

  return (
    <header className="h-14 border-b flex items-center justify-between px-6 flex-shrink-0">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="flex items-center gap-2">
        <SearchBar />
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
