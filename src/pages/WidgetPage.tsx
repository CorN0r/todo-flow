import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { getTasks, hideToTray, showMainFromWidget } from '../lib/db';
import { todayISO, isOverdue } from '../lib/date';
import { useTheme } from '../hooks/useTheme';
import { cn } from '../lib/cn';
import { ListChecks, X, ChevronRight, AlertTriangle } from 'lucide-react';

export function WidgetPage() {
  const today = todayISO();

  const { data: tasks, isLoading, isError } = useQuery({
    queryKey: ['widget-today-tasks'],
    queryFn: () =>
      getTasks({ due_date_from: today, due_date_to: today, is_completed: false }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Transparent body for frameless widget
  useEffect(() => {
    const root = document.getElementById('root');
    const prevBg = document.body.style.backgroundColor;
    const prevOverflow = document.body.style.overflow;

    document.body.style.backgroundColor = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.overflow = 'hidden';
    if (root) {
      root.style.minHeight = 'auto';
      root.style.height = '100vh';
    }

    return () => {
      document.body.style.backgroundColor = prevBg;
      document.body.style.overflow = prevOverflow;
      if (root) {
        root.style.minHeight = '';
        root.style.height = '';
      }
    };
  }, []);

  const incompleteTasks = isError ? [] : (tasks || []);
  const count = incompleteTasks.length;
  const overdueCount = incompleteTasks.filter((t) => isOverdue(t.due_date)).length;

  const message =
    isLoading ? ''
    : count === 0 ? 'All caught up!'
    : count <= 3 ? 'You got this!'
    : count <= 7 ? 'Stay focused!'
    : 'Busy day ahead!';

  return (
    <div
      className="h-screen w-screen select-none p-2.5"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={cn(
          'h-full rounded-2xl border shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl',
          isDark
            ? 'bg-zinc-900/90 border-white/10 shadow-black/60'
            : 'bg-white/90 border-black/10 shadow-black/10',
        )}
      >
        {/* Header bar — only the empty spacer is a drag region */}
        <div className="flex items-center justify-between px-3.5 pt-3 pb-1">
          <div className="flex items-center gap-2 flex-1" data-tauri-drag-region>
            <div className={cn(
              'w-5 h-5 rounded-md flex items-center justify-center',
              isDark ? 'bg-violet-500/20' : 'bg-violet-100',
            )}>
              <ListChecks size={12} className="text-violet-500" />
            </div>
            <span className={cn(
              'text-[11px] font-semibold',
              isDark ? 'text-zinc-300' : 'text-zinc-700',
            )}>
              TodoFlow
            </span>
          </div>
          <button
            onClick={() => hideToTray()}
            className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center transition-colors flex-shrink-0',
              isDark ? 'hover:bg-white/10 text-zinc-500' : 'hover:bg-black/5 text-zinc-400',
            )}
          >
            <X size={11} />
          </button>
        </div>

        {/* Count bubble — click to restore */}
        <motion.button
          onClick={() => showMainFromWidget()}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className="mx-auto my-2 w-[84px] h-[84px] rounded-full bg-gradient-to-br from-indigo-400 via-purple-500 to-pink-500 flex flex-col items-center justify-center cursor-pointer shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-shadow flex-shrink-0"
        >
          <span className="text-[36px] font-extrabold text-white leading-none drop-shadow-sm tabular-nums">
            {isLoading ? '...' : count}
          </span>
          <span className="text-[9px] text-white/75 font-medium">
            {isLoading ? 'loading' : count === 1 ? 'task' : 'tasks'}
          </span>
        </motion.button>

        {/* Message */}
        <p className={cn(
          'text-center text-[11px] font-medium px-4',
          isDark ? 'text-zinc-400' : 'text-zinc-500',
        )}>
          {message}
        </p>

        {/* Mini task list */}
        <div className="flex-1 min-h-0 px-3 mt-2 mb-1 overflow-hidden">
          {incompleteTasks.length > 0 ? (
            <>
              <div className="space-y-0.5">
                {incompleteTasks.slice(0, 4).map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs truncate',
                      isDark
                        ? 'bg-white/5 text-zinc-300'
                        : 'bg-black/[0.03] text-zinc-600',
                    )}
                  >
                    <div className={cn(
                      'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0',
                      isOverdue(task.due_date)
                        ? 'border-red-400'
                        : isDark ? 'border-zinc-600' : 'border-zinc-300',
                    )} />
                    <span className="truncate">{task.title}</span>
                  </div>
                ))}
              </div>
              {incompleteTasks.length > 4 && (
                <p className={cn(
                  'text-[10px] text-center pt-1.5',
                  isDark ? 'text-zinc-500' : 'text-zinc-400',
                )}>
                  +{incompleteTasks.length - 4} more
                </p>
              )}
            </>
          ) : isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className={cn(
                'w-4 h-4 border-2 rounded-full animate-spin border-t-transparent',
                isDark ? 'border-zinc-500' : 'border-zinc-400',
              )} />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className={cn(
                'text-[11px]',
                isDark ? 'text-zinc-500' : 'text-zinc-400',
              )}>
                No tasks due today
              </p>
            </div>
          )}
        </div>

        {/* Footer: overdue warning + restore button */}
        <div className="px-3 pb-3 space-y-2 flex-shrink-0">
          {overdueCount > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-red-400 px-1">
              <AlertTriangle size={10} />
              <span>{overdueCount} overdue</span>
            </div>
          )}
          <button
            onClick={() => showMainFromWidget()}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors',
              isDark
                ? 'bg-white/10 hover:bg-white/15 text-zinc-300'
                : 'bg-black/[0.04] hover:bg-black/[0.08] text-zinc-600',
            )}
          >
            Open TodoFlow
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
