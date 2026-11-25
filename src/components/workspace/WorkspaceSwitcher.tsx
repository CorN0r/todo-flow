import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Layers, Settings2 } from 'lucide-react';
import '../../i18n';
import { getRepositories } from '../../domain/repositories/current';
import type { WorkspaceInfo } from '../../domain/models/workspace';
import { useWorkspaces, useWorkspaceActions } from '../../hooks/useWorkspaces';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../lib/cn';
import { Portal } from '../shared/Portal';
import { menuSurface } from './popupSurface';
import { WorkspaceManagerDialog } from './WorkspaceManagerDialog';

interface MenuPlacement {
  left: number;
  top: number;
  width: number;
}

/**
 * 侧边栏顶部的工作区切换器:始终显示当前工作区的名称,点开可以切换或进入管理。
 * 切换会重启应用,进行中的番茄钟会保留;提醒只对当前工作区生效。
 *
 * 菜单按项目约定用 Portal + 固定定位:侧边栏是带毛玻璃的层叠上下文,
 * 把菜单放在它里面会被后面的导航项盖住。
 */
export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const isGlass = useUIStore((s) => s.theme) === 'glass';
  const { data: workspaces } = useWorkspaces();
  const actions = useWorkspaceActions();
  const [open, setOpen] = useState(false);
  const [menuAt, setMenuAt] = useState<MenuPlacement | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // 工作区只在桌面端提供
  if (getRepositories().platform.kind !== 'desktop') return null;
  const list = workspaces ?? [];
  const active = list.find((workspace) => workspace.is_active) ?? list[0];
  // 清单还没读到(或读取失败):先不显示,不影响侧边栏其余部分
  if (!active) return null;

  const toggleMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    // 展开时菜单在按钮正下方、与按钮同宽;折叠成图标栏时显示在按钮右侧
    setMenuAt(
      collapsed
        ? { left: rect.right + 6, top: rect.top, width: 216 }
        : { left: rect.left, top: rect.bottom + 4, width: rect.width },
    );
    setOpen(true);
  };

  const choose = (workspace: WorkspaceInfo) => {
    setOpen(false);
    if (!workspace.is_active) void actions.activate(workspace.id);
  };

  const menu = open && menuAt && (
    <Portal>
      <div className="fixed inset-0 z-[190]" onClick={() => setOpen(false)} aria-hidden="true" data-testid="workspace-menu-backdrop" />
      <div
        role="menu"
        aria-label={t('workspace.switcherLabel', { name: active.name })}
        style={{ left: menuAt.left, top: menuAt.top, width: menuAt.width }}
        className={cn('fixed z-[200] rounded-xl shadow-xl p-1.5', menuSurface(isGlass))}
        data-testid="workspace-menu"
      >
        {list.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            role="menuitem"
            onClick={() => choose(workspace)}
            className={cn(
              'w-full h-8 flex items-center gap-2 px-2.5 rounded-lg text-[13px] text-left transition-colors',
              workspace.is_active
                ? 'bg-[rgba(124,114,246,0.1)] text-[#7C72F6] font-medium'
                : 'text-[#374151] dark:text-[#C4C4CC] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]',
            )}
            aria-current={workspace.is_active ? 'true' : undefined}
            data-testid="workspace-menu-item"
          >
            <Layers size={14} className="shrink-0" />
            <span className="flex-1 truncate">{workspace.name}</span>
            {workspace.is_active && <span className="shrink-0 text-[11px]">{t('workspace.current')}</span>}
          </button>
        ))}
        <div className="my-1 h-px bg-[#E5E7EB] dark:bg-white/[0.07]" />
        <button
          type="button"
          role="menuitem"
          onClick={() => { setOpen(false); setManagerOpen(true); }}
          className="w-full h-8 flex items-center gap-2 px-2.5 rounded-lg text-[13px] text-left text-[#374151] dark:text-[#C4C4CC] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors"
          data-testid="workspace-open-manager"
        >
          <Settings2 size={14} />
          <span className="flex-1">{t('workspace.manage')}</span>
        </button>
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] leading-relaxed text-[#9CA3AF]">
          <span className="block">{t('workspace.restartHint')}</span>
          <span className="block">{t('workspace.reminderHint')}</span>
        </p>
      </div>
    </Portal>
  );

  if (collapsed) {
    return (
      <div className="shrink-0 w-full flex flex-col items-center">
        <button
          type="button"
          onClick={toggleMenu}
          aria-haspopup="menu"
          aria-expanded={open}
          title={active.name}
          aria-label={t('workspace.switcherLabel', { name: active.name })}
          className={cn(
            'mt-2 w-10 px-0.5 py-1.5 rounded-lg text-[10px] leading-[1.2] text-[#374151] dark:text-[#C4C4CC] hover:bg-[#F3F4F6] dark:hover:bg-white/10 transition-colors',
            open && 'bg-[#F3F4F6] dark:bg-white/10',
          )}
          data-testid="workspace-switcher-collapsed"
        >
          {/* 折叠时也要能看到名称:小字换行显示 */}
          <span className="block break-all max-h-[48px] overflow-hidden">{active.name}</span>
        </button>
        {menu}
        <WorkspaceManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} />
      </div>
    );
  }

  return (
    <div className="shrink-0 px-3 pb-2">
      <button
        type="button"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('workspace.switcherLabel', { name: active.name })}
        className="w-full h-9 flex items-center gap-2 px-2.5 rounded-lg text-[13px] text-[#111827] dark:text-white/90 bg-white/70 dark:bg-white/[0.04] border border-[#E5E7EB] dark:border-white/[0.07] hover:border-[#7C72F6]/50 transition-colors"
        data-testid="workspace-switcher"
      >
        <Layers size={14} className="text-[#7C72F6] shrink-0" />
        <span className="flex-1 text-left truncate">{active.name}</span>
        <ChevronDown size={14} className={cn('text-[#9CA3AF] shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {menu}
      <WorkspaceManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
}
