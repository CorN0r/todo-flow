import { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { motion } from 'motion/react';
import { getTasks, createTask, updateTask, getSetting, setSetting, showMainFromWidget, showWidgetContextMenu } from '../lib/db';
import { todayISO, isOverdue, subDays } from '../lib/date';
import { cn } from '../lib/cn';
import { ListChecks, X, Check, Plus, AlertTriangle, ExternalLink } from 'lucide-react';


type TabKey = 'myday' | 'overdue' | 'today' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'myday', label: '我的一天' },
  { key: 'overdue', label: '逾期' },
  { key: 'today', label: '今天' },
  { key: 'all', label: '全部任务' },
];

export function WidgetPage() {
  const today = todayISO();
  const yesterday = subDays(new Date(), 1).toISOString().split('T')[0];
  const queryClient = useQueryClient();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    getSetting('theme').then((saved) => {
      if (saved === 'dark' || saved === 'glass') setIsDark(true);
      else if (saved === 'light') setIsDark(false);
      else setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }).catch(() => setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches));
  }, []);

  const createTaskMutation = useMutation({
    mutationFn: (input: { title: string; due_date?: string; my_day_date?: string }) =>
      createTask({ title: input.title, due_date: input.due_date, my_day_date: input.my_day_date }),
    onSuccess: () => { queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' }); },
  });
  const updateTaskMutation = useMutation({
    mutationFn: (input: { id: string; is_completed: boolean }) =>
      updateTask({ id: input.id, is_completed: input.is_completed }),
    onSuccess: () => { queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' }); },
  });

  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [sizeMode, setSizeMode] = useState<'compact' | 'normal'>('compact');
  const [inputValue, setInputValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  useEffect(() => {
    getSetting('widget_size').then((s) => {
      if (s === 'compact' || s === 'normal') setSizeMode(s);
    }).catch(() => {});
  }, []);
  const collapsingRef = useRef(false);
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const win = getCurrentWindow();
    win.onFocusChanged(async ({ payload: focused }) => {
      if (focused || sizeMode !== 'normal' || collapsingRef.current) return;
      try {
        const pos = await win.outerPosition();
        setSetting('widget_x', String(Math.round(pos.x))).catch(() => {});
        setSetting('widget_y', String(Math.round(pos.y))).catch(() => {});
        setSizeMode('compact');
        await win.setSize(new LogicalSize(60, 60));
        await new Promise(r => setTimeout(r, 50));
        await win.setPosition(pos);
      } catch {}
    }).then((u) => { unlisten = u; }).catch(() => {});
    return () => { unlisten?.(); };
  }, [sizeMode]);

  const filters = useMemo(() => {
    switch (activeTab) {
      case 'myday':
        return { my_day_date: today, is_completed: false };
      case 'overdue':
        return { is_completed: false, due_date_to: yesterday };
      case 'today':
        return { due_date_from: today, due_date_to: today, is_completed: false };
      case 'all':
        return { is_completed: false };
    }
  }, [activeTab, today, yesterday]);

  const { data: tasks, isLoading, isError } = useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => getTasks(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen('task-changed', () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' });
    }).then((u) => {
      if (cancelled) { u(); return; }
      unlisten = u;
    }).catch(() => {});
    return () => { cancelled = true; unlisten?.(); };
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const win = getCurrentWindow();
    win.onMoved((event) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setSetting('widget_x', String(Math.round(event.payload.x))).catch(() => {});
        setSetting('widget_y', String(Math.round(event.payload.y))).catch(() => {});
      }, 300);
    }).then((u) => {
      if (cancelled) { u(); return; }
      unlisten = u;
    }).catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const root = document.getElementById('root');
    const prev = {
      bg: document.body.style.backgroundColor,
      overflow: document.body.style.overflow,
      margin: document.body.style.margin,
      outline: document.body.style.outline,
      border: document.body.style.border,
    };
    document.body.style.backgroundColor = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.outline = 'none';
    document.body.style.border = 'none';
    if (root) {
      root.style.minHeight = 'auto';
      root.style.height = '100vh';
      root.style.outline = 'none';
      root.style.border = 'none';
      root.style.margin = '0';
    }
    return () => {
      document.body.style.backgroundColor = prev.bg;
      document.body.style.overflow = prev.overflow;
      document.body.style.margin = prev.margin;
      document.body.style.outline = prev.outline;
      document.body.style.border = prev.border;
      if (root) {
        root.style.minHeight = '';
        root.style.height = '';
      }
    };
  }, []);

  const tasksList = tasks || [];
  const count = tasksList.length;
  const overdueCount = tasksList.filter((t) => isOverdue(t.due_date)).length;

  const expandToNormal = async () => {
    if (sizeMode !== 'compact') return;
    setSizeMode('normal');
    try {
      await getCurrentWindow().setSize(new LogicalSize(300, 420));
    } catch {}
    setSetting('widget_size', 'normal').catch(() => {});
  };

  const collapseToBubble = async () => {
    if (sizeMode !== 'normal') return;
    collapsingRef.current = true;
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      setSetting('widget_x', String(Math.round(pos.x))).catch(() => {});
      setSetting('widget_y', String(Math.round(pos.y))).catch(() => {});
      setSizeMode('compact');
      await win.setSize(new LogicalSize(60, 60));
      await new Promise(r => setTimeout(r, 50));
      await win.setPosition(pos);
    } catch {}
    setSetting('widget_size', 'compact').catch(() => {});
    setTimeout(() => { collapsingRef.current = false; }, 500);
  };

  const handleCheck = (id: string, completed: boolean) => {
    updateTaskMutation.mutate({ id, is_completed: !completed });
  };

  const handleQuickAdd = () => {
    const title = inputValue.trim();
    if (!title) return;
    const extra: Record<string, string> = {};
    if (activeTab === 'today' || activeTab === 'overdue') extra.due_date = today;
    else if (activeTab === 'myday') extra.my_day_date = today;
    createTaskMutation.mutate({ title, ...extra });
    setInputValue('');
    inputRef.current?.focus();
  };

  return (
    <div className={cn(
      'h-screen w-screen select-none flex flex-col',
      sizeMode !== 'compact' && (isDark ? 'bg-[#1e1e32]' : 'bg-white'),
      sizeMode === 'compact' && 'items-center justify-center',
    )} onContextMenu={(e) => e.preventDefault()}>
        {/* Header — hidden in compact mode */}
        {sizeMode !== 'compact' && (
        <div className="flex items-center justify-between px-3.5 pt-3 pb-1 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1" data-tauri-drag-region>
            <div className="w-5 h-5 rounded-md flex items-center justify-center bg-violet-500/20">
              <ListChecks size={12} className="text-violet-500" />
            </div>
            <span className={cn('text-[11px] font-semibold', isDark ? 'text-white/90' : 'text-[#111827]')}>TodoFlow</span>
          </div>
          <button onClick={() => showMainFromWidget()}
            className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[#6B7280] transition-colors flex-shrink-0', isDark ? 'hover:bg-white/10' : 'hover:bg-[#F3F4F6]')}
            title="打开主界面">
            <ExternalLink size={11} />
          </button>
          <button onClick={collapseToBubble}
            className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[#6B7280] transition-colors flex-shrink-0 ml-1', isDark ? 'hover:bg-white/10' : 'hover:bg-[#F3F4F6]')}
            title="还原为气泡">
            <X size={11} />
          </button>
        </div>
        )}

        {sizeMode === 'compact' ? (
          <>
          <motion.div
            key={sizeMode}
            onMouseDown={async (e: React.MouseEvent) => {
              if (e.button === 2) return;
              const sx = e.clientX; const sy = e.clientY;
              let dragged = false;
              const onMove = (ev: MouseEvent) => {
                if (!dragged && (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3)) {
                  dragged = true;
                  getCurrentWindow().startDragging().catch(() => {});
                }
              };
              const onUp = (ev: MouseEvent) => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                if (!dragged && Math.abs(ev.clientX - sx) < 4 && Math.abs(ev.clientY - sy) < 4) { setSetting('widget_enabled', '1').catch(() => {}); expandToNormal(); }
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
            onContextMenu={async (e) => {
              e.preventDefault();
              if (sizeMode === 'compact') {
                showWidgetContextMenu(e.clientX, e.clientY);
              } else {
                setContextMenu({ x: e.clientX, y: e.clientY });
              }
            }}
            whileHover={{ scale: 1.15 }}
            className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer pointer-events-auto select-none"
            style={{
              background: 'linear-gradient(135deg, rgba(129,140,248,0.85), rgba(168,85,247,0.85), rgba(236,72,153,0.85))',
              clipPath: 'circle(50% at 50% 50%)',
            }}
          >
            <span className="text-[16px] font-bold text-white/95 leading-none tabular-nums select-none"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>
              {isLoading ? '...' : count}
            </span>
          </motion.div>
          </>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center gap-1 px-3 pb-1 flex-shrink-0">
              {TABS.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                    activeTab === tab.key
                      ? (isDark ? 'bg-violet-500/20 text-violet-300' : 'bg-[#7C72F6]/15 text-[#7C72F6]')
                      : (isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5' : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6]'),
                  )}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Task list */}
            <div className="flex-1 min-h-0 px-3 overflow-y-auto">
              {isLoading ? (
                <div className="h-full flex items-center justify-center">
                  <div className={cn('w-4 h-4 border-2 rounded-full animate-spin border-t-transparent', isDark ? 'border-zinc-500' : 'border-[#D1D5DB]')} />
                </div>
              ) : isError ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[11px] text-[#9CA3AF]">加载失败</p>
                </div>
              ) : tasksList.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[11px] text-[#9CA3AF]">
                    {activeTab === 'myday' ? '今天还没有安排' : activeTab === 'overdue' ? '没有逾期的任务 ✓' : activeTab === 'today' ? '今天没有待办事项' : '没有待办任务 ✓'}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5 pb-1">
                  {tasksList.map((task) => (
                    <div key={task.id}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs group transition-colors',
                        isDark ? 'bg-white/5 hover:bg-white/[0.08]' : 'bg-[#F9FAFB] hover:bg-[#F3F4F6]',
                        updateTaskMutation.isPending && updateTaskMutation.variables?.id === task.id && 'opacity-50',
                      )}>
                      <button
                        onClick={() => handleCheck(task.id, task.is_completed)}
                        className={cn(
                          'w-[15px] h-[15px] rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors',
                          task.is_completed
                            ? 'bg-[#7C72F6] border-[#7C72F6] text-white'
                            : (isDark ? 'border-zinc-600 hover:border-[#7C72F6]' : 'border-[#D1D5DB] hover:border-[#7C72F6]'),
                        )}>
                        {task.is_completed && <Check size={9} style={{ strokeWidth: 3 }} />}
                      </button>
                      <span className={cn(
                        'truncate flex-1',
                        task.is_completed ? 'line-through text-[#9CA3AF]' : (isDark ? 'text-white/90' : 'text-[#111827]'),
                      )}>
                        {task.title}
                      </span>
                      {isOverdue(task.due_date) && !task.is_completed && (
                        <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer info */}
            {overdueCount > 0 && (
              <div className="px-3 pb-1 flex-shrink-0">
                <div className="flex items-center gap-1 text-[10px] text-red-400 justify-center mb-1">
                  <AlertTriangle size={10} /><span>{overdueCount} 超期</span>
                </div>
              </div>
            )}

            {/* Quick-add */}
            <div className="px-2.5 pb-2.5 flex-shrink-0">
              <div className={cn(
                'flex items-center gap-1.5 px-2.5 py-2 rounded-xl border transition-colors focus-within:border-[#7C72F6]/50',
                isDark ? 'bg-white/[0.06] border-white/[0.08]' : 'bg-[#F9FAFB] border-[#E5E7EB]',
              )}>
                <Plus size={12} className="text-[#6B7280] flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
                  placeholder="添加任务..."
                  className={cn('flex-1 bg-transparent text-xs placeholder:text-[#9CA3AF] outline-none', isDark ? 'text-white/90' : 'text-[#111827]')}
                />
              </div>
            </div>
          </>
        )}
        {contextMenu && sizeMode !== 'compact' && (
          <div ref={menuRef}
            className="absolute z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-lg shadow-xl py-1"
            style={{ left: contextMenu.x, top: contextMenu.y, minWidth: 150 }}>
            <button onClick={() => { showMainFromWidget(); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors text-[#111827] dark:text-white/90">
              <ExternalLink size={12} className="text-[#6B7280]" /> 打开主界面
            </button>
            <div className="border-t border-[#F3F4F6] dark:border-white/[0.07] my-0.5" />
            <button onClick={() => { setSetting('widget_enabled', '0').catch(() => {}); setContextMenu(null); getCurrentWindow().hide().catch(() => {}); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 transition-colors">
              <X size={12} /> 不再显示悬浮窗
            </button>
          </div>
        )}
    </div>
  );
}
