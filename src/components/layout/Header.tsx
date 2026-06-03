import { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Sun, Moon, Monitor, Sparkles, PanelBottom } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTheme } from '../../hooks/useTheme';
import { useUIStore } from '../../stores/uiStore';
import { SearchBar } from '../shared/SearchBar';
import { hideToTray } from '../../lib/db';

const themes: { key: 'light' | 'dark' | 'system' | 'glass'; icon: typeof Sun; label: string }[] = [
  { key: 'light', icon: Sun, label: 'Light' },
  { key: 'dark', icon: Moon, label: 'Dark' },
  { key: 'glass', icon: Sparkles, label: 'Glass' },
  { key: 'system', icon: Monitor, label: 'System' },
];

export function Header() {
  const { setTheme } = useTheme();
  const theme = useUIStore((s) => s.theme);
  const isGlass = theme === 'glass';
  const currentIdx = themes.findIndex((t) => t.key === theme);
  const nextTheme = themes[(currentIdx + 1) % themes.length];
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized).catch(() => {});
    let unlisten: (() => void) | null = null;
    win.onResized(() => {
      win.isMaximized().then(setMaximized).catch(() => {});
    }).then((u) => { unlisten = u; }).catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  return (
    <header
      className={`h-10 flex items-center shrink-0 select-none border-b ${
        isGlass
          ? 'bg-[rgba(10,10,30,0.55)] backdrop-blur-[20px] border-white/[0.06]'
          : 'bg-white dark:bg-[#1e1e32] border-[#F3F4F6] dark:border-white/[0.06]'
      }`}
      data-tauri-drag-region
      onDoubleClick={() => { getCurrentWindow().toggleMaximize().catch(() => {}); }}
    >
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        <SearchBar />
        <div className="flex items-center gap-0.5">
        <button onClick={() => setTheme(nextTheme.key)} className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors" title={`主题: ${theme}`} aria-label={`切换主题: ${theme}`}>
          {(() => { const Icon = themes.find((t) => t.key === theme)?.icon || Sun; return <Icon size={15} className="text-[#9CA3AF]" />; })()}
        </button>
        <button onClick={() => hideToTray()} className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors" title="隐藏到浮窗" aria-label="隐藏到浮窗">
          <PanelBottom size={16} className="text-[#9CA3AF]" />
        </button>
        <button onClick={() => { getCurrentWindow().minimize().catch(() => {}); }} className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors" title="最小化" aria-label="最小化">
          <Minus size={14} className="text-[#9CA3AF]" />
        </button>
        <button onClick={() => { getCurrentWindow().toggleMaximize().catch(() => {}); }} className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors" title={maximized ? '还原' : '最大化'} aria-label={maximized ? '还原' : '最大化'}>
          {maximized ? <Copy size={12} className="text-[#9CA3AF]" /> : <Square size={12} className="text-[#9CA3AF]" />}
        </button>
        <button onClick={() => { getCurrentWindow().close().catch(() => {}); }} className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-red-500 hover:text-white transition-colors" title="关闭" aria-label="关闭">
          <X size={16} className="text-[#9CA3AF]" />
        </button>
        </div>
      </div>
    </header>
  );
}
