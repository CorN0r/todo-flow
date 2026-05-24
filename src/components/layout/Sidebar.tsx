import { NavLink } from 'react-router-dom';
import {
  House,
  CalendarDays,
  Plus,
  PanelLeftClose,
  PanelLeft,
  Settings,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useLists, useCreateList } from '../../hooks/useLists';
import { useUIStore } from '../../stores/uiStore';
import { useState } from 'react';

export function Sidebar() {
  const { data: lists } = useLists();
  const createList = useCreateList();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreateList = () => {
    if (newName.trim()) {
      createList.mutate({ name: newName.trim() });
      setNewName('');
      setIsCreating(false);
    }
  };

  return (
    <aside
      className={cn(
        'border-r bg-sidebar text-sidebar-foreground flex flex-col h-full transition-all duration-200',
        sidebarOpen ? 'w-60' : 'w-14'
      )}
    >
      {/* Header */}
      <div className="h-14 border-b flex items-center px-3 gap-2">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>
        {sidebarOpen && (
          <h1 className="text-lg font-semibold tracking-tight whitespace-nowrap">TodoFlow</h1>
        )}
      </div>

      {/* Navigation */}
      <nav className="p-2 space-y-0.5">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground'
            )
          }
        >
          <House size={18} />
          {sidebarOpen && <span>Today</span>}
        </NavLink>
        <NavLink
          to="/calendar"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground'
            )
          }
        >
          <CalendarDays size={18} />
          {sidebarOpen && <span>Calendar</span>}
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground'
            )
          }
        >
          <Settings size={18} />
          {sidebarOpen && <span>Settings</span>}
        </NavLink>
      </nav>

      {sidebarOpen && (
        <>
          <div className="h-px bg-border mx-3" />

          {/* Lists section */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                My Lists
              </span>
              <button
                onClick={() => setIsCreating(true)}
                className="p-0.5 rounded hover:bg-accent transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>

            {isCreating && (
              <div className="px-2 mb-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateList();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                  onBlur={() => {
                    if (!newName.trim()) setIsCreating(false);
                  }}
                  placeholder="List name..."
                  className="w-full text-sm px-2 py-1 rounded border bg-background outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            <div className="space-y-0.5">
              {lists?.map((list) => (
                <NavLink
                  key={list.id}
                  to={`/list/${list.id}`}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                    )
                  }
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: list.color }}
                  />
                  {sidebarOpen && (
                    <>
                      <span className="flex-1 truncate">{list.name}</span>
                      {list.incomplete_count > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {list.incomplete_count}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>

            {lists?.length === 0 && !isCreating && (
              <p className="text-xs text-muted-foreground px-2 py-2">
                No lists yet. Click <Plus size={10} className="inline" /> to create one.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
