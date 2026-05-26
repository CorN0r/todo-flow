import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { getTodayTaskCount, showMainFromWidget, hideToTray } from '../lib/db';
import { ListChecks, X } from 'lucide-react';

export function WidgetPage() {
  const { data: count } = useQuery({
    queryKey: ['todayTaskCount'],
    queryFn: getTodayTaskCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Make body transparent for frameless widget
  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    const prevOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const prevMinHeight = root?.style.minHeight;
    const prevBgBody = document.body.style.background;

    document.body.style.backgroundColor = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.overflow = 'hidden';
    if (root) {
      root.style.minHeight = 'auto';
      root.style.height = '100vh';
    }

    return () => {
      document.body.style.backgroundColor = prevBg;
      document.body.style.background = prevBgBody;
      document.body.style.overflow = prevOverflow;
      if (root) {
        root.style.minHeight = prevMinHeight || '';
        root.style.height = '';
      }
    };
  }, []);

  const taskCount = count ?? 0;

  const handleBubbleClick = () => {
    showMainFromWidget();
  };

  const message =
    taskCount === 0
      ? 'All caught up!'
      : taskCount <= 3
        ? 'You got this!'
        : taskCount <= 7
          ? 'Stay focused!'
          : 'Busy day ahead!';

  return (
    <div
      className="h-screen w-screen select-none relative"
      data-tauri-drag-region
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Close button */}
      <button
        onClick={() => hideToTray()}
        className="absolute top-3 right-3 w-5 h-5 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center z-10 transition-colors"
      >
        <X size={10} className="text-white/80" />
      </button>

      {/* Floating bubble */}
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <motion.button
          onClick={handleBubbleClick}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          animate={
            taskCount > 0
              ? {
                  boxShadow: [
                    '0 0 0 0 rgba(139,92,246,0.5)',
                    '0 0 0 14px rgba(139,92,246,0)',
                    '0 0 0 0 rgba(139,92,246,0)',
                  ],
                }
              : {}
          }
          transition={
            taskCount > 0
              ? { repeat: Infinity, duration: 2.8, ease: 'easeInOut' }
              : {}
          }
          className="w-[110px] h-[110px] rounded-full bg-gradient-to-br from-indigo-400 via-purple-500 to-pink-500 flex flex-col items-center justify-center cursor-pointer shadow-lg shadow-purple-500/40 hover:shadow-xl hover:shadow-purple-500/50 transition-shadow"
        >
          <span className="text-[42px] font-extrabold text-white leading-none drop-shadow-sm">
            {taskCount}
          </span>
          <span className="text-[10px] text-white/75 mt-0.5 font-medium">
            {taskCount === 1 ? 'task' : 'tasks'}
          </span>
        </motion.button>

        {/* Label */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-white/70">
            <ListChecks size={11} />
            <span>Today</span>
          </div>
          <p className="text-[10px] text-white/50 mt-0.5">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
