import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, GripVertical } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { TaskDetail } from '../tasks/TaskDetail';
import { ErrorBoundary } from '../shared/ErrorBoundary';

/** 面板宽度持久化 key */
const PANEL_WIDTH_KEY = 'taskDetailPanelWidth';
const DEFAULT_WIDTH = 540;
const MIN_WIDTH = 400;
const MAX_WIDTH = 800;

function getSavedWidth(): number {
  try {
    const saved = localStorage.getItem(PANEL_WIDTH_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch { /* localStorage 不可用时忽略 */ }
  return DEFAULT_WIDTH;
}

function saveWidth(width: number) {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(width));
  } catch { /* 忽略 */ }
}

export function TaskDetailPanel() {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId);
  const theme = useUIStore((s) => s.theme);
  const taskViewMode = useUIStore((s) => s.taskViewMode);
  const isGlass = theme === 'glass';
  const isOpen = !!selectedTaskId && taskViewMode !== 'unified';

  // ── 可拖拽宽度 ──
  const [width, setWidth] = useState(() => getSavedWidth());
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startXRef.current - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // 拖拽结束时持久化宽度
        setWidth((w) => { saveWidth(w); return w; });
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // 面板打开时始终使用已保存的宽度（用户可能在关闭后调整过）
  useEffect(() => {
    if (isOpen) {
      setWidth(getSavedWidth());
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`fixed inset-0 z-30 ${isGlass ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/40'}`}
            onClick={() => setSelectedTaskId(null)}
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            style={{ width }}
            className={`fixed right-0 top-0 h-full border-l z-40 overflow-y-auto shadow-2xl ${isGlass ? 'glass-panel-strong border-white/[0.08]' : 'bg-white dark:bg-[#1e1e32] border-[#F3F4F6] dark:border-white/[0.06]'}`}
          >
            {/* ── 左侧拖拽手柄 ── */}
            <div
              onMouseDown={onMouseDown}
              className="absolute left-0 top-0 bottom-0 w-[5px] cursor-ew-resize z-50 group"
              title="拖拽调整面板宽度"
            >
              {/* 可见的拖拽指示条 */}
              <div className="absolute inset-y-0 left-0 w-[2px] bg-transparent group-hover:bg-[#7C72F6]/40 transition-colors" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-10 rounded-full bg-[#E5E7EB] dark:bg-white/[0.08] opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center shadow-sm">
                <GripVertical size={12} className="text-[#6B7280]" />
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => setSelectedTaskId(null)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors"
              aria-label="关闭"
            >
              <X size={16} className="text-[#6B7280]" />
            </button>

            {/* Content */}
            <div className="p-6">
              <ErrorBoundary>
                <TaskDetail />
              </ErrorBoundary>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
