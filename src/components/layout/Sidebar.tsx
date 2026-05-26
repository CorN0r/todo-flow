import { NavLink } from 'react-router-dom';
import {
  House,
  CalendarDays,
  Plus,
  PanelLeftClose,
  PanelLeft,
  Settings,
  MoreHorizontal,
  Pencil,
  Trash2,
  GripVertical,
  Inbox,
  Sun,
  Sunrise,
  CalendarRange,
  CalendarFold,
  ChevronDown,
  ChevronRight,
  Search,
  BarChart3,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useLists, useCreateList, useUpdateList, useDeleteList, useReorderLists } from '../../hooks/useLists';
import { useUpdateTask } from '../../hooks/useTasks';
import { useTags, useCreateTag } from '../../hooks/useTags';
import { useUIStore } from '../../stores/uiStore';
import { useState, useRef, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableListItem({ list, onMenuOpen }: {
  list: { id: string; name: string; color: string; incomplete_count: number };
  onMenuOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id });

  const updateTask = useUpdateTask();
  const [dragOver, setDragOver] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group/list',
        isDragging && 'opacity-50 z-50',
        dragOver && 'ring-2 ring-primary rounded-md',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) {
          updateTask.mutate({ id: taskId, list_id: list.id });
        }
      }}
    >
      <div className="flex items-center">
        <button
          {...attributes}
          {...listeners}
          className="p-0.5 text-muted-foreground opacity-0 group-hover/list:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing transition-opacity flex-shrink-0"
        >
          <GripVertical size={12} />
        </button>
        <NavLink
          to={`/list/${list.id}`}
          className={({ isActive: linkActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors flex-1',
              linkActive
                ? 'bg-accent text-primary font-medium'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground',
            )
          }
        >
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: list.color }}
          />
          <span className="flex-1 truncate">{list.name}</span>
          {list.incomplete_count > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {list.incomplete_count}
            </span>
          )}
        </NavLink>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMenuOpen();
          }}
          className="p-0.5 rounded hover:bg-accent opacity-0 group-hover/list:opacity-100 transition-opacity"
          title="List options"
          aria-label={`Options for ${list.name}`}
        >
          <MoreHorizontal size={14} className="text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

function SectionToggle({ label, expanded, onToggle, onAdd, addLabel }: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {label}
      </button>
      {onAdd && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          className="p-0.5 rounded hover:bg-accent transition-colors"
          aria-label={addLabel}
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
    isActive
      ? 'bg-accent text-primary font-medium'
      : 'hover:bg-accent text-muted-foreground hover:text-foreground',
  );

export function Sidebar() {
  const { data: lists } = useLists();
  const { data: tags } = useTags();
  const createList = useCreateList();
  const createTag = useCreateTag();
  const updateList = useUpdateList();
  const deleteList = useDeleteList();
  const reorderLists = useReorderLists();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const [scheduledExpanded, setScheduledExpanded] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCreateList = () => {
    if (newName.trim()) {
      createList.mutate({ name: newName.trim() });
      setNewName('');
      setIsCreating(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !lists) return;

    const oldIndex = lists.findIndex((l) => l.id === active.id);
    const newIndex = lists.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(lists, oldIndex, newIndex);
    reorderLists.mutate(reordered.map((l, i) => ({ id: l.id, sort_order: i })));
  };

  const scheduledLinks = [
    { to: '/date/tomorrow', icon: <Sunrise size={16} />, label: 'Tomorrow' },
    { to: '/date/next-3', icon: <CalendarRange size={16} />, label: 'Next 3 Days' },
    { to: '/date/next-7', icon: <CalendarDays size={16} />, label: 'Next 7 Days' },
    { to: '/date/next-year', icon: <CalendarFold size={16} />, label: 'This Year' },
  ];

  return (
    <aside
      className={cn(
        'border-r bg-sidebar text-sidebar-foreground flex flex-col h-full transition-all duration-200',
        sidebarOpen ? 'w-60' : 'w-14',
      )}
      role="navigation"
      aria-label="Sidebar"
    >
      {/* Header */}
      <div className="h-14 border-b flex items-center px-3 gap-2">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>
        {sidebarOpen && (
          <h1 className="text-lg font-semibold tracking-tight whitespace-nowrap">TodoFlow</h1>
        )}
      </div>

      {/* Core Navigation */}
      <nav className="p-2 space-y-0.5" role="menubar">
        <NavLink to="/myday" className={navLinkClass} role="menuitem" aria-label="My Day">
          <Sun size={18} />
          {sidebarOpen && <span>My Day</span>}
        </NavLink>
        <NavLink to="/" end className={navLinkClass} role="menuitem" aria-label="Today">
          <House size={18} />
          {sidebarOpen && <span>Today</span>}
        </NavLink>
        <NavLink to="/calendar" className={navLinkClass} role="menuitem" aria-label="Calendar">
          <CalendarDays size={18} />
          {sidebarOpen && <span>Calendar</span>}
        </NavLink>
        <NavLink to="/dashboard" className={navLinkClass} role="menuitem" aria-label="Dashboard">
          <BarChart3 size={18} />
          {sidebarOpen && <span>Dashboard</span>}
        </NavLink>
        <NavLink to="/search" className={navLinkClass} role="menuitem" aria-label="Search">
          <Search size={18} />
          {sidebarOpen && <span>Search</span>}
        </NavLink>
        <NavLink to="/date/all" className={navLinkClass} role="menuitem" aria-label="All Tasks">
          <Inbox size={18} />
          {sidebarOpen && <span>All Tasks</span>}
        </NavLink>
      </nav>

      {sidebarOpen && (
        <>
          {/* Scheduled section — collapsible */}
          <div className="pt-1">
            <SectionToggle
              label="Scheduled"
              expanded={scheduledExpanded}
              onToggle={() => setScheduledExpanded(!scheduledExpanded)}
            />
          </div>
          {scheduledExpanded && (
            <div className="px-2 pb-1 space-y-0.5">
              {scheduledLinks.map((link) => (
                <NavLink key={link.to} to={link.to} className={navLinkClass} role="menuitem" aria-label={link.label}>
                  {link.icon}
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </div>
          )}

          <div className="h-px bg-border mx-3 my-1" />

          {/* Tags section — collapsible */}
          <div className="pt-1">
            <SectionToggle
              label={`Tags${tags?.length ? ` (${tags.length})` : ''}`}
              expanded={tagsExpanded}
              onToggle={() => setTagsExpanded(!tagsExpanded)}
              onAdd={() => setIsCreatingTag(true)}
              addLabel="Create new tag"
            />
          </div>
          {tagsExpanded && (
            <div className="px-2 pb-1">
              {isCreatingTag && (
                <div className="mb-1">
                  <input
                    autoFocus
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTagName.trim()) {
                        createTag.mutate({ name: newTagName.trim(), color: '#6366f1' });
                        setNewTagName('');
                        setIsCreatingTag(false);
                      }
                      if (e.key === 'Escape') { setNewTagName(''); setIsCreatingTag(false); }
                    }}
                    onBlur={() => { if (!newTagName.trim()) setIsCreatingTag(false); }}
                    placeholder="Tag name..."
                    aria-label="New tag name"
                    className="w-full text-sm px-2 py-1 rounded border bg-background outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
              <div className="space-y-0.5">
                {tags?.map((tag) => (
                  <NavLink key={tag.id} to={`/tag/${tag.id}`} className={navLinkClass}>
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 truncate">{tag.name}</span>
                    {(tag.task_count ?? 0) > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">{tag.task_count}</span>
                    )}
                  </NavLink>
                ))}
                {tags?.length === 0 && !isCreatingTag && (
                  <p className="text-xs text-muted-foreground px-3 py-1">No tags yet</p>
                )}
              </div>
            </div>
          )}

          <div className="h-px bg-border mx-3 my-1" />

          {/* Lists section */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                My Lists
              </span>
              <button
                onClick={() => setIsCreating(true)}
                className="p-0.5 rounded hover:bg-accent transition-colors"
                aria-label="Create new list"
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
                  aria-label="New list name"
                  className="w-full text-sm px-2 py-1 rounded border bg-background outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={lists?.map((l) => l.id) || []}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-0.5">
                  {lists?.map((list) => (
                    <div key={list.id} className="relative group/list">
                      {editingListId === list.id ? (
                        <div className="flex items-center gap-2 px-3 py-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: list.color }}
                          />
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (editName.trim()) updateList.mutate({ id: list.id, name: editName.trim() });
                                setEditingListId(null);
                              }
                              if (e.key === 'Escape') setEditingListId(null);
                            }}
                            onBlur={() => setEditingListId(null)}
                            aria-label="Edit list name"
                            className="flex-1 text-sm px-1 py-0.5 rounded border bg-background outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      ) : (
                        <SortableListItem
                          list={list}
                          onMenuOpen={() => setMenuOpenId(list.id)}
                        />
                      )}
                      {menuOpenId === list.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg z-50 py-1 min-w-[120px]"
                        >
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMenuOpenId(null);
                              setEditingListId(list.id);
                              setEditName(list.name);
                            }}
                            className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                          >
                            <Pencil size={13} />
                            Rename
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMenuOpenId(null);
                              if (confirm(`Delete list "${list.name}"?`)) {
                                deleteList.mutate(list.id);
                              }
                            }}
                            className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-red-500 transition-colors"
                          >
                            <Trash2 size={13} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {lists?.length === 0 && !isCreating && (
              <p className="text-xs text-muted-foreground px-2 py-2">
                No lists yet. Click <Plus size={10} className="inline" /> to create one.
              </p>
            )}
          </div>

          {/* Settings at bottom */}
          <div className="p-2 border-t border-border">
            <NavLink to="/settings" className={navLinkClass} role="menuitem" aria-label="Settings">
              <Settings size={18} />
              <span>Settings</span>
            </NavLink>
          </div>
        </>
      )}
    </aside>
  );
}
