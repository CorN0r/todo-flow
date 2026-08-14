import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { useTask } from '../hooks/useTasks';
import {
  closeTaskNote,
  getTaskNote,
  setNoteAlwaysOnTop,
  setNoteCollapsed,
  setNoteStyle,
} from '../lib/db';
import type { NoteStyle } from '../types/note';
import { NoteCard } from '../components/notes/NoteCard';
import { Portal } from '../components/shared/Portal';
import { cn } from '../lib/cn';

const STYLE_OPTIONS: { key: NoteStyle; label: string }[] = [
  { key: 'glass', label: '玻璃' },
  { key: 'paper', label: '便签纸' },
  { key: 'minimal', label: '极简' },
];

// 右键菜单跟随便签皮肤:玻璃便签上的白菜单太刺眼。全部显式色值,不跟随应用主题。
interface MenuSkin {
  menuClass: string;
  menuStyle?: CSSProperties;
  itemClass: string;
  dangerClass: string;
  dividerClass: string;
  checkClass: string;
}

const MENU_SKINS: Record<NoteStyle, MenuSkin> = {
  glass: {
    menuClass: 'border border-[rgba(255,255,255,0.1)] shadow-[0_12px_32px_rgba(0,0,0,0.4)]',
    menuStyle: {
      background: 'rgba(24,24,38,0.88)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    },
    itemClass: 'text-[rgba(255,255,255,0.88)] hover:bg-[rgba(255,255,255,0.1)]',
    dangerClass: 'text-[#FF8A80] hover:bg-[rgba(239,68,68,0.15)]',
    dividerClass: 'border-[rgba(255,255,255,0.08)]',
    checkClass: 'text-[#A5A0FF]',
  },
  paper: {
    menuClass: 'bg-[#FFF6D9] border border-[rgba(93,78,55,0.15)] shadow-xl',
    itemClass: 'text-[#5D4E37] hover:bg-[rgba(93,78,55,0.08)]',
    dangerClass: 'text-[#EF4444] hover:bg-[rgba(93,78,55,0.08)]',
    dividerClass: 'border-[rgba(93,78,55,0.12)]',
    checkClass: 'text-[#F97316]',
  },
  minimal: {
    menuClass: 'bg-white border border-[#E8E8ED] shadow-xl',
    itemClass: 'text-[#1D1D1F] hover:bg-[#F3F4F6]',
    dangerClass: 'text-[#EF4444] hover:bg-red-50',
    dividerClass: 'border-[#F3F4F6]',
    checkClass: 'text-[#7C72F6]',
  },
};

function getTaskIdFromSearch(): string | null {
  return new URLSearchParams(window.location.search).get('note');
}

export function NotePage() {
  const queryClient = useQueryClient();
  const taskId = getTaskIdFromSearch();

  // 便签窗口不挂 dark/glass 等 documentElement class:皮肤自带底色、不跟随应用主题,
  // 也避免 index.css 的主题 override(如 .warm .bg-white)污染卡片和右键菜单。

  // ---- 数据 ----
  const { data: note, isPending: notePending } = useQuery({
    queryKey: ['task-note', taskId],
    queryFn: () => getTaskNote(taskId!),
    enabled: !!taskId,
    staleTime: 30_000,
  });
  const collapsed = note?.collapsed ?? false;

  const { data: taskDetail } = useTask(taskId);

  // 皮肤热切换(来自其它窗口的 set_note_style)
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen('note-style-changed', () => {
      queryClient.invalidateQueries({ queryKey: ['task-note'] });
    }).then((u) => {
      if (cancelled) { u(); return; }
      unlisten = u;
    }).catch(() => {});
    return () => { cancelled = true; unlisten?.(); };
  }, [queryClient]);

  // 任务变更跨窗口同步
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen('task-changed', () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks' });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'task' });
    }).then((u) => {
      if (cancelled) { u(); return; }
      unlisten = u;
    }).catch(() => {});
    return () => { cancelled = true; unlisten?.(); };
  }, [queryClient]);

  // 便签行变更跨窗口同步(置顶/折叠/皮肤/取消固定等,来自其它窗口)
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen('task-notes-changed', () => {
      queryClient.invalidateQueries({ queryKey: ['task-note', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task-notes'] });
    }).then((u) => {
      if (cancelled) { u(); return; }
      unlisten = u;
    }).catch(() => {});
    return () => { cancelled = true; unlisten?.(); };
  }, [queryClient, taskId]);

  // ---- 透明窗口体样式 ----
  useEffect(() => {
    const root = document.getElementById('root');
    const prev = {
      bg: document.body.style.backgroundColor,
      overflow: document.body.style.overflow,
      margin: document.body.style.margin,
    };
    document.body.style.backgroundColor = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    if (root) {
      root.style.minHeight = 'auto';
      root.style.margin = '0';
    }
    return () => {
      document.body.style.backgroundColor = prev.bg;
      document.body.style.overflow = prev.overflow;
      document.body.style.margin = prev.margin;
      if (root) {
        root.style.minHeight = '';
        root.style.margin = '';
      }
    };
  }, []);

  // ---- 窗口高度随内容自适应(宽度固定 280) ----
  // 折叠态跳过:迷你条 36px 由 Rust set_note_collapsed 设定,且低于这里 140px 的 clamp 下限。
  // note 未加载完成前也跳过:折叠便签建窗即 36px,避免加载态被误量成 ≥140px。
  const cardWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined' || notePending || collapsed) return;
    const win = getCurrentWindow();
    const observer = new ResizeObserver(() => {
      const height = Math.min(640, Math.max(140, Math.ceil(el.getBoundingClientRect().height)));
      win.setSize(new LogicalSize(280, height)).catch(() => {});
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [notePending, collapsed]);

  // ---- 右键菜单 ----
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuWasOpenRef = useRef(false);
  const skipRestoreRef = useRef(false);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    // capture 阶段:Tauri 拖区处理器在 document 冒泡阶段先注册并 stopImmediatePropagation,
    // 冒泡监听收不到拖到卡片上的 mousedown,菜单外点不消失。
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', onKey);
    // 便签是独立窗口:点到另一张便签或别的应用时本窗口失焦,菜单也应关闭
    const onBlur = () => setMenu(null);
    window.addEventListener('blur', onBlur);
    // 失焦事件在无边框小窗上不可靠(可能从未获得 DOM focus);
    // 跨便签的"外点"改用广播:任何便签窗口内的 mousedown 都会广播,其它便签据此关菜单
    let unlistenInteract: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const u = await listen<{ id: string }>('note-interact', (event) => {
        if (event.payload.id !== taskId) setMenu(null);
      });
      if (cancelled) { u(); return; }
      unlistenInteract = u;
    })();
    return () => {
      cancelled = true;
      unlistenInteract?.();
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [menu, taskId]);

  // 本窗口内任何 mousedown 都广播给其它便签(用于关掉它们开着的右键菜单)
  useEffect(() => {
    if (!taskId) return;
    const broadcast = () => { void emit('note-interact', { id: taskId }); };
    document.addEventListener('mousedown', broadcast, true);
    return () => document.removeEventListener('mousedown', broadcast, true);
  }, [taskId]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const padding = 8;
    let { x, y } = menu;
    if (x + rect.width + padding > window.innerWidth) x = window.innerWidth - rect.width - padding;
    if (x < padding) x = padding;
    if (y + rect.height + padding > window.innerHeight) y = window.innerHeight - rect.height - padding;
    if (y < padding) y = padding;
    // 便签窗口可能只有 140px(折叠态 36px),装不下约 200px 的菜单:
    // 临时把窗口加高到能容纳整个菜单,菜单关闭后再恢复内容高度。
    const neededHeight = Math.ceil(y + rect.height + padding);
    if (neededHeight > window.innerHeight) {
      getCurrentWindow()
        .setSize(new LogicalSize(280, neededHeight))
        .catch(() => {});
    }
    if (x !== menu.x || y !== menu.y) setMenu({ x, y });
  }, [menu]);

  // 菜单关闭(选择菜单项/外点/Esc 都经 setMenu(null))后恢复窗口到内容实际高度。
  // 折叠/展开切换由 Rust set_note_collapsed 直接定窗口尺寸,跳过恢复避免竞态。
  useEffect(() => {
    if (menu) {
      menuWasOpenRef.current = true;
      return;
    }
    if (!menuWasOpenRef.current) return;
    menuWasOpenRef.current = false;
    if (skipRestoreRef.current) {
      skipRestoreRef.current = false;
      return;
    }
    const win = getCurrentWindow();
    if (collapsed) {
      win.setSize(new LogicalSize(280, 36)).catch(() => {});
      return;
    }
    const el = cardWrapRef.current;
    if (!el) return;
    const height = Math.min(640, Math.max(140, Math.ceil(el.getBoundingClientRect().height)));
    win.setSize(new LogicalSize(280, height)).catch(() => {});
  }, [menu, collapsed]);

  const invalidateNote = () => queryClient.invalidateQueries({ queryKey: ['task-note', taskId] });

  const handleToggleAlwaysOnTop = async () => {
    if (!taskId) return;
    try {
      await setNoteAlwaysOnTop(taskId, !(note?.always_on_top ?? false));
      invalidateNote();
    } catch (e) {
      toast.error(String(e));
    }
    setMenu(null);
  };

  const handleStyleChange = async (style: NoteStyle) => {
    if (!taskId) return;
    try {
      await setNoteStyle(taskId, style);
      invalidateNote();
    } catch (e) {
      toast.error(String(e));
    }
    setMenu(null);
  };

  const handleToggleCollapsed = async () => {
    if (!taskId) return;
    try {
      await setNoteCollapsed(taskId, !collapsed);
      invalidateNote();
    } catch (e) {
      toast.error(String(e));
    }
    // 折叠/展开的窗口尺寸由 Rust 侧设定,菜单关闭不走高度恢复
    skipRestoreRef.current = true;
    setMenu(null);
  };

  const handleClose = async () => {
    if (!taskId) return;
    try {
      await closeTaskNote(taskId);
    } catch (e) {
      toast.error(String(e));
    }
    setMenu(null);
  };

  const task = taskDetail?.task;
  const children = taskDetail?.children || [];
  const currentStyle: NoteStyle = note?.style ?? 'paper';
  const menuSkin = MENU_SKINS[currentStyle];

  return (
    <div
      className="w-screen min-h-screen flex items-start justify-center select-none"
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
    >
      <div ref={cardWrapRef} className="w-[280px]">
        {!taskId ? (
          <div className="w-[280px] rounded-[12px] border border-[#E5E5EA] bg-[#FFFFFF] p-4 text-center text-[12px] text-[#8E8E93]">
            便签缺少任务参数
          </div>
        ) : !task || notePending ? (
          <div className="w-[280px] rounded-[12px] border border-[#E5E5EA] bg-[#FFFFFF] p-4 flex items-center justify-center">
            <div className="w-4 h-4 border-2 rounded-full animate-spin border-t-transparent border-[#D1D5DB]" />
          </div>
        ) : (
          <NoteCard
            task={task}
            children={children}
            style={currentStyle}
            alwaysOnTop={note?.always_on_top ?? false}
            collapsed={collapsed}
            onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
            onToggleCollapsed={handleToggleCollapsed}
            onClose={handleClose}
          />
        )}
      </div>

      {menu && (
        <Portal>
          <div ref={menuRef} style={{ left: menu.x, top: menu.y, ...menuSkin.menuStyle }}
            className={cn('fixed z-[200] rounded-[10px] py-1 w-[152px]', menuSkin.menuClass)}>
            {STYLE_OPTIONS.map((opt) => (
              <button key={opt.key} onClick={() => handleStyleChange(opt.key)}
                className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors', menuSkin.itemClass)}>
                <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                  {currentStyle === opt.key && <Check size={12} className={menuSkin.checkClass} />}
                </span>
                <span className="flex-1 text-left">{opt.label}</span>
              </button>
            ))}
            <div className={cn('border-t my-1', menuSkin.dividerClass)} />
            <button onClick={handleToggleAlwaysOnTop}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors', menuSkin.itemClass)}>
              <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                {(note?.always_on_top ?? false) && <Check size={12} className={menuSkin.checkClass} />}
              </span>
              <span className="flex-1 text-left">置顶显示</span>
            </button>
            <button onClick={handleToggleCollapsed}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors', menuSkin.itemClass)}>
              <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                {collapsed && <Check size={12} className={menuSkin.checkClass} />}
              </span>
              <span className="flex-1 text-left">{collapsed ? '展开便签' : '折叠便签'}</span>
            </button>
            <div className={cn('border-t my-1', menuSkin.dividerClass)} />
            <button onClick={handleClose}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors', menuSkin.dangerClass)}>
              <span className="w-3.5 flex-shrink-0" />
              <span className="flex-1 text-left">取消固定</span>
            </button>
          </div>
        </Portal>
      )}
    </div>
  );
}
