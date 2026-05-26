import { useState, useEffect, useRef, useMemo } from 'react';
import { cn } from '../../lib/cn';
import type { Task } from '../../types/task';
import { formatDate, isOverdue } from '../../lib/date';
import { Calendar, Flag, ListTree, Check, RotateCcw, Trash2, Copy, Sun, SunDim } from 'lucide-react';
import { useUpdateTask, useDeleteTask, useDuplicateTask } from '../../hooks/useTasks';
import { useLists } from '../../hooks/useLists';
import { useUIStore } from '../../stores/uiStore';
import { todayISO } from '../../lib/date';

const priorityColors: Record<number, string> = {
  0: 'text-muted-foreground',
  1: 'text-blue-500',
  2: 'text-yellow-500',
  3: 'text-orange-500',
  4: 'text-red-500',
};

const priorityLabels: Record<number, string> = {
  0: '',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Urgent',
};

export function TaskCard({ task }: { task: Task }) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const duplicateTask = useDuplicateTask();
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const selectedTaskIds = useUIStore((s) => s.selectedTaskIds);
  const enterSelectionMode = useUIStore((s) => s.enterSelectionMode);
  const toggleTaskSelection = useUIStore((s) => s.toggleTaskSelection);
  const isSelected = selectedTaskIds.has(task.id);
  const overdue = isOverdue(task.due_date);
  const { data: lists } = useLists();
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listMap = useMemo(() => {
    if (!lists) return new Map();
    return new Map(lists.map((l) => [l.id, l]));
  }, [lists]);

  const taskList = task.list_id ? listMap.get(task.list_id) : undefined;

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const menuW = 180;
    const menuH = 250;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
    setContextMenu({ x, y });
  };

  const handleToggleComplete = () => {
    updateTask.mutate({ id: task.id, is_completed: !task.is_completed });
    setContextMenu(null);
  };

  const handleDelete = () => {
    deleteTask.mutate(task.id);
    setContextMenu(null);
  };

  const handleDuplicate = () => {
    duplicateTask.mutate(task.id);
    setContextMenu(null);
  };

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-all duration-150 group select-none',
          task.is_completed && 'opacity-80 bg-muted',
          overdue && !task.is_completed && 'border-l-2 border-l-red-400',
          isSelected && 'ring-2 ring-primary bg-accent',
        )}
      >
        {/* Selection checkbox */}
        {selectionMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleTaskSelection(task.id);
            }}
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
              isSelected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-muted-foreground hover:border-primary',
            )}
          >
            {isSelected && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        )}
        {/* Checkbox */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            updateTask.mutate({ id: task.id, is_completed: !task.is_completed });
          }}
          className={cn(
            'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200',
            task.is_completed
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-muted-foreground hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950'
          )}
        >
          {task.is_completed && (
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        {/* Content + badges zone — left click to open detail panel, drag to move to list */}
        <div
          className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer"
          onClick={() => {
            if (selectionMode) {
              toggleTaskSelection(task.id);
            } else {
              setSelectedTaskId(task.id);
            }
          }}
          onPointerDown={() => {
            if (!selectionMode) {
              longPressRef.current = setTimeout(() => {
                enterSelectionMode(task.id);
              }, 500);
            }
          }}
          onPointerUp={() => {
            if (longPressRef.current) {
              clearTimeout(longPressRef.current);
              longPressRef.current = null;
            }
          }}
          onPointerLeave={() => {
            if (longPressRef.current) {
              clearTimeout(longPressRef.current);
              longPressRef.current = null;
            }
          }}
          role="button"
          tabIndex={0}
          draggable={!selectionMode}
          onDragStart={(e) => {
            if (selectionMode) return;
            e.dataTransfer.setData('text/plain', task.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') setSelectedTaskId(task.id); }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-sm truncate',
                  task.is_completed && 'line-through text-muted-foreground'
                )}
              >
                {task.title}
              </span>
              {taskList && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 inline-flex items-center gap-1"
                  style={{
                    backgroundColor: taskList.color,
                    color: 'white',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: taskList.color }}
                  />
                  {taskList.name}
                </span>
              )}
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {task.description}
              </p>
            )}
            {task.tags && task.tags.length > 0 && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {task.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1"
                    style={{ backgroundColor: tag.color, color: 'white' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </span>
                ))}
                {task.tags.length > 2 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                    +{task.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {(task.children_count ?? 0) > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ListTree size={12} />
                {task.children_count}
              </span>
            )}
            {task.priority > 0 && (
              <span className={cn('text-xs', priorityColors[task.priority])} title={priorityLabels[task.priority]}>
                <Flag size={14} />
              </span>
            )}
            {task.due_date && (
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded',
                  overdue
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <Calendar size={12} className="inline mr-1" />
                {formatDate(task.due_date)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-[100] bg-background border rounded-lg shadow-xl py-1 min-w-[180px] max-h-[280px] overflow-y-auto animate-in fade-in zoom-in-95 origin-top-left"
        >
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b mb-1 truncate">
            {task.title}
          </div>
          <button
            onClick={handleToggleComplete}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            {task.is_completed ? (
              <>
                <RotateCcw size={15} className="text-muted-foreground" />
                Mark incomplete
              </>
            ) : (
              <>
                <Check size={15} className="text-primary" />
                Mark complete
              </>
            )}
          </button>
          <button
            onClick={() => {
              updateTask.mutate({ id: task.id, my_day_date: task.my_day_date ? null : todayISO() });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            {task.my_day_date ? (
              <>
                <SunDim size={15} className="text-muted-foreground" />
                Remove from My Day
              </>
            ) : (
              <>
                <Sun size={15} className="text-amber-500" />
                Add to My Day
              </>
            )}
          </button>
          <button
            onClick={handleDuplicate}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            <Copy size={15} className="text-muted-foreground" />
            Duplicate
          </button>
          <button
            onClick={() => {
              const isMyDay = task.my_day_date === todayISO();
              if (isMyDay) {
                updateTask.mutate({ id: task.id, my_day_date: null });
              } else {
                updateTask.mutate({ id: task.id, my_day_date: todayISO() });
              }
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            {task.my_day_date === todayISO() ? (
              <>
                <SunDim size={15} className="text-muted-foreground" />
                Remove from My Day
              </>
            ) : (
              <>
                <Sun size={15} className="text-amber-500" />
                Add to My Day
              </>
            )}
          </button>
          <div className="border-t mt-1 pt-1">
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-red-50 text-red-600 transition-colors"
            >
              <Trash2 size={15} />
              Delete
            </button>
          </div>
        </div>
      )}
    </>
  );
}
