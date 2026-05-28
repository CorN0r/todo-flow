import { NavLink } from 'react-router-dom';
import {
  Sun, Plus, PanelLeftClose, PanelLeft,
  Settings, Pencil, Trash2,
  CalendarRange, BarChart3, LayoutGrid, Layout, Target,
  ChevronDown, ChevronRight, CalendarCheck, Sunrise, CalendarDays, Globe,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '../../hooks/useTags';
import { useUpdateTask } from '../../hooks/useTasks';
import type { TagWithCount } from '../../types/tag';

import { useUIStore } from '../../stores/uiStore';
import { useState, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ─── Style constants matching Pixso design ─── */

const NAV_STYLE = 'flex items-center gap-[10px] px-3 rounded-lg text-[14px] transition-colors';
const ACTIVE_NAV = 'bg-[rgba(124,114,246,0.1)] text-[#7C72F6] font-medium dark:bg-[rgba(124,114,246,0.125)] dark:text-white';
const INACTIVE_NAV = 'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] dark:text-[#C4C4CC] dark:hover:bg-white/[0.04] dark:hover:text-white';

/* ─── Sortable tag item ─── */

function SortableTagItem({ tag, onEdit, onDelete }: {
  tag: { id: string; name: string; color: string; incomplete_count: number };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tag.id });
  const updateTask = useUpdateTask();
  const [dragOver, setDragOver] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  return (
    <>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn('relative group/tag cursor-grab active:cursor-grabbing', isDragging && 'opacity-50 z-50', dragOver && 'ring-2 ring-[#7C72F6] rounded-lg')}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const taskId = e.dataTransfer.getData('text/plain'); if (taskId) updateTask.mutate({ id: taskId, tag_id: tag.id }); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
      >
        <NavLink to={`/tag/${tag.id}`}
          className={({ isActive }) => cn(
            NAV_STYLE, 'h-[34px] text-[13px]',
            isActive ? ACTIVE_NAV : INACTIVE_NAV,
          )}
        >
          <span className="w-[10px] h-[10px] rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
          <span className="flex-1 truncate">{tag.name}</span>
          {tag.incomplete_count > 0 && (
            <span className="text-[12px] text-[#6B7280] font-medium tabular-nums">{tag.incomplete_count}</span>
          )}
        </NavLink>
      </div>
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="fixed z-[100] bg-[#1E1E32] border border-white/[0.07] rounded-lg shadow-xl py-1 min-w-[120px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button onClick={(e) => { e.stopPropagation(); setCtxMenu(null); onEdit(); }}
            className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#C4C4CC] hover:bg-white/10">
            <Pencil size={13} /> Rename
          </button>
          <button onClick={(e) => { e.stopPropagation(); setCtxMenu(null); onDelete(); }}
            className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-[13px] text-red-400 hover:bg-white/10">
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Recursive tag tree item ─── */

function TagTreeItem({ tag, depth, editingTagId, editName, setEditName, setEditingTagId, updateTag, deleteTag }: {
  tag: TagWithCount;
  depth: number;
  editingTagId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  setEditingTagId: (v: string | null) => void;
  updateTag: ReturnType<typeof useUpdateTag>;
  deleteTag: ReturnType<typeof useDeleteTag>;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = tag.children && tag.children.length > 0;

  return (
    <div>
      <div className="relative group/tag" style={{ paddingLeft: depth * 12 }}>
        {editingTagId === tag.id ? (
          <div className="flex items-center gap-[10px] px-3 h-[34px]">
            <span className="w-[10px] h-[10px] rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
            <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { if (editName.trim()) updateTag.mutate({ id: tag.id, name: editName.trim() }); setEditingTagId(null); } if (e.key === 'Escape') setEditingTagId(null); }}
              onBlur={() => setEditingTagId(null)}
              className="flex-1 text-[13px] px-1 py-0.5 rounded border border-white/[0.07] bg-white/[0.04] text-white outline-none focus:ring-1 focus:ring-[#7C72F6]" />
          </div>
        ) : (
          <div className="flex items-center">
            {hasChildren && (
              <button onClick={() => setExpanded(!expanded)} className="p-0.5 text-[#6B7280] hover:text-white">
                {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </button>
            )}
            <div className="flex-1">
              <SortableTagItem
                tag={tag}
                onEdit={() => { setEditingTagId(tag.id); setEditName(tag.name); }}
                onDelete={() => { if (confirm(`Delete "${tag.name}"?`)) deleteTag.mutate(tag.id); }}
              />
            </div>
          </div>
        )}
      </div>
      {hasChildren && expanded && tag.children.map((child) => (
        <TagTreeItem
          key={child.id}
          tag={child}
          depth={depth + 1}
          editingTagId={editingTagId}
          editName={editName}
          setEditName={setEditName}
          setEditingTagId={setEditingTagId}
          updateTag={updateTag}
          deleteTag={deleteTag}
        />
      ))}
    </div>
  );
}

/* ─── Sidebar ─── */

export function Sidebar() {
  const { data: tags } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const { sidebarOpen, toggleSidebar, theme } = useUIStore();
  const isGlass = theme === 'glass';
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [scheduledExpanded, setScheduledExpanded] = useState(true);

  const handleCreateTag = () => { if (newName.trim()) { createTag.mutate({ name: newName.trim() }); setNewName(''); setIsCreating(false); } };
  const secHeaderCls = 'section-label';

  if (!sidebarOpen) {
    const collapsedBtnCls = 'p-2 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] dark:text-[#C4C4CC] dark:hover:text-white dark:hover:bg-white/[0.04]';
    return (
      <aside className={`flex flex-col h-full transition-all duration-200 shrink-0 w-14 items-center ${isGlass ? 'glass-panel' : 'bg-[#F3F2FA] dark:bg-[#16162A]'}`} role="navigation">
        <button onClick={toggleSidebar} className="mt-4 p-1.5 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] dark:text-[#C4C4CC] dark:hover:text-white dark:hover:bg-white/10 transition-colors" aria-label="展开侧边栏">
          <PanelLeft size={18} />
        </button>
        <nav className="flex-1 flex flex-col gap-[2px] mt-2">
          <NavLink to="/date/all" className={collapsedBtnCls} aria-label="全部任务"><span className="text-xs font-bold">☰</span></NavLink>
          <NavLink to="/myday" className={collapsedBtnCls} aria-label="我的一天"><Sun size={16} /></NavLink>
          <NavLink to="/" end className={collapsedBtnCls} aria-label="今天"><CalendarCheck size={16} /></NavLink>
          <NavLink to="/calendar" className={collapsedBtnCls} aria-label="日历"><CalendarRange size={16} /></NavLink>
          <NavLink to="/matrix" className={collapsedBtnCls} aria-label="四象限"><LayoutGrid size={16} /></NavLink>
          <NavLink to="/kanban" className={collapsedBtnCls} aria-label="看板"><Layout size={16} /></NavLink>
          <NavLink to="/habits" className={collapsedBtnCls} aria-label="习惯追踪"><Target size={16} /></NavLink>
          <NavLink to="/dashboard" className={collapsedBtnCls} aria-label="数据面板"><BarChart3 size={16} /></NavLink>
        </nav>
        <NavLink to="/settings" className="mb-4 p-2 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] dark:text-[#9CA3AF] dark:hover:text-white dark:hover:bg-white/[0.04]" aria-label="设置"><Settings size={16} /></NavLink>
      </aside>
    );
  }

  const sidebarBg = isGlass ? 'glass-panel' : 'bg-[#F3F2FA] dark:bg-[#16162A]';
  const dividerCls = 'mx-3 h-px bg-[#E5E7EB] dark:bg-[rgba(255,255,255,0.07)]';
  const settingsBg = 'bg-[#EEECF8] dark:bg-[rgba(255,255,255,0.03)]';
  const settingsLinkInactive = 'text-[#6B7280] hover:text-[#111827] dark:text-[#9CA3AF] dark:hover:text-white';
  const logoText = 'text-[#111827] dark:text-white';

  return (
    <aside className={`flex flex-col h-full transition-all shrink-0 w-[240px] overflow-hidden ${sidebarBg}`} role="navigation">
      {/* Logo — h:56, p:0 16, gap:10 */}
      <div className="h-14 flex items-center gap-[10px] px-4 shrink-0">
        <button onClick={toggleSidebar} className="p-1 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] dark:text-[#C4C4CC] dark:hover:text-white dark:hover:bg-white/10" aria-label="Collapse sidebar">
          <PanelLeftClose size={18} />
        </button>
        <span className={`text-[16px] font-bold ${logoText}`}>TodoFlow</span>
      </div>

      {/* Main Nav — p:8px 12px, gap:2px */}
      <nav className="flex flex-col gap-[2px]" style={{ padding: '8px 12px' }}>
        <NavLink to="/date/all" className={({ isActive }) => cn(NAV_STYLE, 'h-[38px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <span className="w-4 h-4 shrink-0 flex items-center justify-center text-xs font-bold">☰</span>
          <span className="flex-1">全部任务</span>
        </NavLink>
        <NavLink to="/myday" className={({ isActive }) => cn(NAV_STYLE, 'h-[38px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <Sun size={16} /><span className="flex-1">我的一天</span>
        </NavLink>
        <NavLink to="/calendar" className={({ isActive }) => cn(NAV_STYLE, 'h-[38px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <CalendarRange size={16} /><span className="flex-1">日历</span>
        </NavLink>
        <NavLink to="/matrix" className={({ isActive }) => cn(NAV_STYLE, 'h-[38px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <LayoutGrid size={16} /><span className="flex-1">四象限</span>
        </NavLink>
        <NavLink to="/kanban" className={({ isActive }) => cn(NAV_STYLE, 'h-[38px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <Layout size={16} /><span className="flex-1">看板</span>
        </NavLink>
        <NavLink to="/habits" className={({ isActive }) => cn(NAV_STYLE, 'h-[38px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <Target size={16} /><span className="flex-1">习惯追踪</span>
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => cn(NAV_STYLE, 'h-[38px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <BarChart3 size={16} /><span className="flex-1">数据面板</span>
        </NavLink>
      </nav>

      {/* Divider */}
      <div className={dividerCls} />

      {/* Scheduled — p:12px 12px 4px 12px, gap:2px */}
      <div style={{ padding: '12px 12px 4px 12px' }} className="flex items-center justify-between">
        <button onClick={() => setScheduledExpanded(!scheduledExpanded)} className={cn('flex items-center gap-1', secHeaderCls)}>
          {scheduledExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          计划中
        </button>
      </div>
      {scheduledExpanded && (
        <div className="flex flex-col gap-[2px]" style={{ padding: '0px 12px' }}>
          {[
            { to: '/', end: true, label: '今天', icon: <CalendarCheck size={14} /> },
            { to: '/date/tomorrow', label: '明天', icon: <Sunrise size={14} /> },
            { to: '/date/next-3', label: '未来 3 天', icon: <CalendarRange size={14} /> },
            { to: '/date/next-7', label: '未来 7 天', icon: <CalendarDays size={14} /> },
            { to: '/date/next-year', label: '今年', icon: <Globe size={14} /> },
          ].map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}
              className={({ isActive }) => cn(NAV_STYLE, 'h-[36px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
              <span className="shrink-0 opacity-70">{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className={dividerCls} />

      {/* Tags */}
      <div style={{ padding: '12px 12px 4px 12px' }} className="flex items-center justify-between">
        <span className={secHeaderCls}>标签</span>
        <button onClick={() => setIsCreating(true)} className="p-0.5 rounded hover:bg-[#F3F4F6] dark:hover:bg-white/10" aria-label="Create tag"><Plus size={14} className="text-[#6B7280]" /></button>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        <div className="flex flex-col gap-[4px]" style={{ padding: '0px 12px' }}>
          {isCreating && (
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTag(); if (e.key === 'Escape') setIsCreating(false); }}
              onBlur={() => { if (!newName.trim()) setIsCreating(false); }}
              placeholder="Tag name..." className="w-full text-[13px] px-2 py-1 rounded border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.04] text-[#111827] dark:text-white outline-none focus:ring-1 focus:ring-[#7C72F6] placeholder:text-[#9CA3AF]" />
          )}
          {tags?.map((tag) => (
            <TagTreeItem
              key={tag.id}
              tag={tag}
              depth={0}
              editingTagId={editingTagId}
              editName={editName}
              setEditName={setEditName}
              setEditingTagId={setEditingTagId}
              updateTag={updateTag}
              deleteTag={deleteTag}
            />
          ))}
          {tags?.length === 0 && !isCreating && <p className="text-xs text-[#9CA3AF] px-3 py-1 italic">No tags yet</p>}
        </div>
      </div>

      {/* Settings */}
      <div className={`shrink-0 h-12 flex items-center ${settingsBg}`} style={{ padding: '0px 16px' }}>
        <NavLink to="/settings" className={({ isActive }) => cn('flex items-center gap-[10px] text-[13px] transition-colors', isActive ? 'text-[#7C72F6] dark:text-white font-medium' : settingsLinkInactive)}>
          <Settings size={16} /><span>设置</span>
        </NavLink>
      </div>
    </aside>
  );
}
