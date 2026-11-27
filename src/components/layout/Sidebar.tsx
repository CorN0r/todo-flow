import { NavLink, useLocation } from 'react-router-dom';
import {
  Sun, Plus, PanelLeftClose, PanelLeft,
  Settings, Pencil, Trash2,
  CalendarRange, BarChart3, Target, ListTodo, CalendarDays,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag, useReorderTags } from '../../hooks/useTags';
import { useUpdateTask } from '../../hooks/useTasks';
import { getTask } from '../../lib/db';
import { isPlannedRange } from '../../lib/dateRanges';
import type { TagWithCount } from '../../types/tag';

import { useUIStore } from '../../stores/uiStore';
import { WorkspaceSwitcher } from '../workspace/WorkspaceSwitcher';
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ─── Style constants matching Pixso design ─── */

// 两级层级:目的地 14px / 34px,标签 13px / 30px。三组文字的颜色在六套主题下都不低于 4.5:1
const NAV_STYLE = 'flex items-center gap-[10px] px-3 rounded-lg text-[14px] transition-colors';
const ACTIVE_NAV = 'bg-[rgba(124,114,246,0.1)] sidebar-selected font-medium dark:bg-[rgba(124,114,246,0.125)] dark:text-white';
const INACTIVE_NAV = 'text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827] dark:text-[#C4C4CC] dark:hover:bg-white/[0.04] dark:hover:text-white';
const TAG_STYLE = 'flex items-center gap-[10px] px-3 rounded-lg text-[13px] transition-colors';
const INACTIVE_TAG = 'text-[#5F6C7A] hover:bg-[#F3F4F6] hover:text-[#111827] dark:text-[#9CA3AF] dark:hover:bg-white/[0.04] dark:hover:text-white';

/* ─── Sortable tag item ─── */

function SortableTagItem({ tag, onEdit, onDelete, onAddChild }: {
  tag: { id: string; name: string; color: string; incomplete_count: number };
  onEdit: () => void;
  onDelete: () => void;
  onAddChild?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tag.id });
  const updateTask = useUpdateTask();
  const [dragOver, setDragOver] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; rawX: number; rawY: number } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  // 测量菜单实际尺寸并调整位置，确保完全在视口内
  useLayoutEffect(() => {
    if (!ctxMenu || !ctxMenuRef.current) return;
    const menu = ctxMenuRef.current;
    const rect = menu.getBoundingClientRect();
    const padding = 8;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let { x, y } = ctxMenu;

    if (x + rect.width + padding > viewportW) x = viewportW - rect.width - padding;
    if (x - padding < 0) x = padding;
    if (y + rect.height + padding > viewportH) y = viewportH - rect.height - padding;
    if (y - padding < 0) y = padding;

    if (x !== ctxMenu.x || y !== ctxMenu.y) {
      setCtxMenu(prev => prev ? { ...prev, x, y } : null);
    }
  }, [ctxMenu?.x, ctxMenu?.y]);

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
        onDrop={async (e) => { e.preventDefault(); setDragOver(false); const taskId = e.dataTransfer.getData('text/plain'); if (!taskId) return; try { const detail = await getTask(taskId); const current = detail.task.tag_ids || []; const next = current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id]; updateTask.mutate({ id: taskId, tag_ids: next }); } catch (err) { console.error('[Sidebar] drop tag failed:', err); } }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, rawX: e.clientX, rawY: e.clientY }); }}
      >
        <NavLink to={`/tag/${tag.id}`}
          className={({ isActive }) => cn(
            TAG_STYLE, 'h-[30px]',
            isActive ? ACTIVE_NAV : INACTIVE_TAG,
          )}
        >
          {/* 圆点放在和目的地图标同宽的格子里,两级的左边缘对齐 */}
          <span className="w-4 h-4 shrink-0 flex items-center justify-center">
            <span className="w-[10px] h-[10px] rounded-full" style={{ backgroundColor: tag.color }} />
          </span>
          <span className="flex-1 truncate">{tag.name}</span>
          {tag.incomplete_count > 0 && (
            <span className="text-[11px] font-medium tabular-nums opacity-70">{tag.incomplete_count}</span>
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
            <Pencil size={13} /> 重命名
          </button>
          {onAddChild && (
            <button onClick={(e) => { e.stopPropagation(); setCtxMenu(null); onAddChild(); }}
              className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#C4C4CC] hover:bg-white/10">
              <Plus size={13} /> 添加子标签
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); setCtxMenu(null); onDelete(); }}
            className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-[13px] text-red-400 hover:bg-white/10">
            <Trash2 size={13} /> 删除
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Recursive tag tree item ─── */

function TagTreeItem({ tag, depth, editingTagId, editName, setEditName, setEditingTagId, creatingChildUnder, setCreatingChildUnder, newChildName, setNewChildName, handleCreateChild, updateTag, deleteTag }: {
  tag: TagWithCount;
  depth: number;
  editingTagId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  setEditingTagId: (v: string | null) => void;
  creatingChildUnder: string | null;
  setCreatingChildUnder: (v: string | null) => void;
  newChildName: string;
  setNewChildName: (v: string) => void;
  handleCreateChild: (parentId: string) => void;
  updateTag: ReturnType<typeof useUpdateTag>;
  deleteTag: ReturnType<typeof useDeleteTag>;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = tag.children && tag.children.length > 0;

  return (
    <div>
      <div className="relative group/tag" style={{ paddingLeft: depth * 12 }}>
        {editingTagId === tag.id ? (
          <div className="flex items-center gap-[10px] px-3 h-[30px]">
            <span className="w-4 h-4 shrink-0 flex items-center justify-center">
              <span className="w-[10px] h-[10px] rounded-full" style={{ backgroundColor: tag.color }} />
            </span>
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
                onDelete={() => { if (confirm(`确定删除"${tag.name}"？`)) deleteTag.mutate(tag.id); }}
                onAddChild={depth === 0 ? () => { setCreatingChildUnder(tag.id); setNewChildName(''); setExpanded(true); } : undefined}
              />
            </div>
          </div>
        )}
      </div>
      {/* Inline input for creating child tag */}
      {creatingChildUnder === tag.id && (
        <div style={{ paddingLeft: (depth + 1) * 12 }} className="flex items-center gap-[10px] px-3 h-[30px] mt-[2px]">
          <span className="w-4 h-4 shrink-0 flex items-center justify-center">
            <span className="w-[10px] h-[10px] rounded-full" style={{ backgroundColor: tag.color }} />
          </span>
          <input
            autoFocus
            value={newChildName}
            onChange={(e) => setNewChildName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateChild(tag.id);
              if (e.key === 'Escape') setCreatingChildUnder(null);
            }}
            onBlur={() => { if (!newChildName.trim()) setCreatingChildUnder(null); }}
            placeholder="子标签名称..."
            className="flex-1 text-[13px] px-1 py-0.5 rounded border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.04] text-[#111827] dark:text-white outline-none focus:ring-1 focus:ring-[#7C72F6] placeholder:text-[#9CA3AF]"
          />
        </div>
      )}
      {hasChildren && expanded && tag.children.map((child) => (
        <TagTreeItem
          key={child.id}
          tag={child}
          depth={depth + 1}
          editingTagId={editingTagId}
          editName={editName}
          setEditName={setEditName}
          setEditingTagId={setEditingTagId}
          creatingChildUnder={creatingChildUnder}
          setCreatingChildUnder={setCreatingChildUnder}
          newChildName={newChildName}
          setNewChildName={setNewChildName}
          handleCreateChild={handleCreateChild}
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
  const reorderTags = useReorderTags();
  const { sidebarOpen, toggleSidebar, theme } = useUIStore();
  const lastPlannedRange = useUIStore((s) => s.lastPlannedRange);
  const location = useLocation();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleTagsDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const rootTags = tags ?? [];
    const oldIndex = rootTags.findIndex((t) => t.id === active.id);
    const newIndex = rootTags.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rootTags, oldIndex, newIndex);
    reorderTags.mutate(reordered.map((t, i) => ({ id: t.id, sort_order: i })));
  };
  const isGlass = theme === 'glass';
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingChildUnder, setCreatingChildUnder] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  // 折叠状态只在本次会话内保持
  const [tagsExpanded, setTagsExpanded] = useState(true);

  const handleCreateTag = () => { if (newName.trim()) { createTag.mutate({ name: newName.trim() }); setNewName(''); setIsCreating(false); } };
  const handleCreateChild = (parentId: string) => {
    if (newChildName.trim()) {
      createTag.mutate({ name: newChildName.trim(), parent_tag_id: parentId });
      setNewChildName('');
      setCreatingChildUnder(null);
    }
  };
  const secHeaderCls = 'sidebar-section-label';

  // 已在某个计划范围时指向当前地址(选中态才正确),否则指向上次查看的范围
  const currentFilter = location.pathname.startsWith('/date/') ? location.pathname.slice('/date/'.length) : '';
  const plannedTo = isPlannedRange(currentFilter) ? location.pathname : `/date/${lastPlannedRange}`;

  if (!sidebarOpen) {
    const collapsedBtnCls = 'p-2 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] dark:text-[#C4C4CC] dark:hover:text-white dark:hover:bg-white/[0.04]';
    return (
      <aside className={`flex flex-col h-full transition-all duration-200 shrink-0 w-14 items-center ${isGlass ? 'glass-panel' : 'bg-[#F3F2FA] dark:bg-[#16162A]'}`} role="navigation">
        <button onClick={toggleSidebar} className="mt-4 p-1.5 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] dark:text-[#C4C4CC] dark:hover:text-white dark:hover:bg-white/10 transition-colors" aria-label="展开侧边栏">
          <PanelLeft size={18} />
        </button>
        <WorkspaceSwitcher collapsed />
        <nav className="flex-1 flex flex-col gap-[2px] mt-2" aria-label="主导航">
          <NavLink to="/date/all" className={collapsedBtnCls} aria-label="全部任务"><ListTodo size={16} /></NavLink>
          <NavLink to="/myday" className={collapsedBtnCls} aria-label="我的一天"><Sun size={16} /></NavLink>
          <NavLink to={plannedTo} className={collapsedBtnCls} aria-label="计划"><CalendarRange size={16} /></NavLink>
          <NavLink to="/calendar" className={collapsedBtnCls} aria-label="日历"><CalendarDays size={16} /></NavLink>
          <NavLink to="/habits" className={collapsedBtnCls} aria-label="习惯追踪"><Target size={16} /></NavLink>
        </nav>
        <NavLink to="/dashboard" className={collapsedBtnCls} aria-label="数据面板"><BarChart3 size={16} /></NavLink>
        <NavLink to="/settings" className="mb-4 p-2 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] dark:text-[#9CA3AF] dark:hover:text-white dark:hover:bg-white/[0.04]" aria-label="设置"><Settings size={16} /></NavLink>
      </aside>
    );
  }

  const sidebarBg = isGlass ? 'glass-panel' : 'bg-[#F3F2FA] dark:bg-[#16162A]';
  const settingsBg = 'bg-[#EEECF8] dark:bg-[rgba(255,255,255,0.03)]';
  const footerLink = 'flex items-center gap-[10px] text-[13px] transition-colors';
  const footerLinkActive = 'sidebar-selected dark:text-white font-medium';
  const footerLinkInactive = 'text-[#374151] hover:text-[#111827] dark:text-[#9CA3AF] dark:hover:text-white';
  const logoText = 'text-[#111827] dark:text-white';

  return (
    <aside className={`flex flex-col h-full transition-all shrink-0 w-[240px] overflow-hidden ${sidebarBg}`} role="navigation">
      {/* 顶行:折叠按钮 + 当前工作区(点开可切换或管理);切换器不可用时这里显示应用名 */}
      <div className="h-12 shrink-0 flex items-center gap-1 pl-2 pr-3">
        <button onClick={toggleSidebar} className="shrink-0 p-1 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] dark:text-[#C4C4CC] dark:hover:text-white dark:hover:bg-white/10" aria-label="Collapse sidebar">
          <PanelLeftClose size={18} />
        </button>
        <WorkspaceSwitcher collapsed={false} fallback={<span className={`text-[16px] font-bold truncate ${logoText}`}>TodoFlow</span>} />
      </div>

      {/* 目的地:只放日常任务流要去的五个地方。日期范围在“计划”页内切换,看板与四象限是页头的视图 */}
      <nav className="flex flex-col gap-[2px]" style={{ padding: '8px 12px' }} aria-label="主导航">
        <NavLink to="/date/all" className={({ isActive }) => cn(NAV_STYLE, 'h-[34px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <ListTodo size={16} /><span className="flex-1">全部任务</span>
        </NavLink>
        <NavLink to="/myday" className={({ isActive }) => cn(NAV_STYLE, 'h-[34px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <Sun size={16} /><span className="flex-1">我的一天</span>
        </NavLink>
        <NavLink to={plannedTo} end className={({ isActive }) => cn(NAV_STYLE, 'h-[34px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <CalendarRange size={16} /><span className="flex-1">计划</span>
        </NavLink>
        <NavLink to="/calendar" className={({ isActive }) => cn(NAV_STYLE, 'h-[34px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <CalendarDays size={16} /><span className="flex-1">日历</span>
        </NavLink>
        <NavLink to="/habits" className={({ isActive }) => cn(NAV_STYLE, 'h-[34px]', isActive ? ACTIVE_NAV : INACTIVE_NAV)}>
          <Target size={16} /><span className="flex-1">习惯追踪</span>
        </NavLink>
      </nav>

      {/* 标签:用户自己的分组,可折叠;占据其余全部高度 */}
      <div style={{ padding: '8px 12px 4px 12px' }} className="flex items-center justify-between shrink-0">
        <button onClick={() => setTagsExpanded(!tagsExpanded)} aria-expanded={tagsExpanded}
          className={cn('flex items-center gap-1 hover:text-[#111827] dark:hover:text-white transition-colors', secHeaderCls)}>
          {tagsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          标签
        </button>
        <button onClick={() => { setTagsExpanded(true); setIsCreating(true); }} className="p-0.5 rounded hover:bg-[#F3F4F6] dark:hover:bg-white/10" aria-label="新建标签"><Plus size={14} className="text-[#6B7280]" /></button>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {tagsExpanded && (
          <div className="flex flex-col gap-[2px]" style={{ padding: '0px 12px' }}>
            {isCreating && (
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTag(); if (e.key === 'Escape') setIsCreating(false); }}
                onBlur={() => { if (!newName.trim()) setIsCreating(false); }}
                placeholder="标签名称..." className="mt-1 w-full text-[13px] px-2 py-1 rounded border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.04] text-[#111827] dark:text-white outline-none focus:ring-1 focus:ring-[#7C72F6] placeholder:text-[#9CA3AF]" />
            )}
            {tags?.length === 0 && !isCreating && <p className="text-xs text-[#9CA3AF] px-3 py-1 italic">暂无标签</p>}
            {tags && tags.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTagsDragEnd}>
                <SortableContext items={tags.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-[2px]">
                    {tags.map((tag) => (
                      <TagTreeItem
                        key={tag.id}
                        tag={tag}
                        depth={0}
                        editingTagId={editingTagId}
                        editName={editName}
                        setEditName={setEditName}
                        setEditingTagId={setEditingTagId}
                        creatingChildUnder={creatingChildUnder}
                        setCreatingChildUnder={setCreatingChildUnder}
                        newChildName={newChildName}
                        setNewChildName={setNewChildName}
                        handleCreateChild={handleCreateChild}
                        updateTag={updateTag}
                        deleteTag={deleteTag}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}
      </div>

      {/* 底部组:不常去的目的地 */}
      <div className={`shrink-0 ${settingsBg}`} style={{ padding: '4px 16px 0 16px' }}>
        <NavLink to="/dashboard" className={({ isActive }) => cn(footerLink, 'h-8', isActive ? footerLinkActive : footerLinkInactive)}>
          <BarChart3 size={16} /><span>数据面板</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => cn(footerLink, 'h-12', isActive ? footerLinkActive : footerLinkInactive)}>
          <Settings size={16} /><span>设置</span>
        </NavLink>
      </div>
    </aside>
  );
}
