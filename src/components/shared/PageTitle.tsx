import { useState } from 'react';
import { ArrowUpDown, Plus, CheckSquare, ListCollapse, ListTree, LayoutList, Columns3, SplitSquareHorizontal, Layout, LayoutGrid, Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { Portal } from './Portal';
import { useUIStore, type TaskViewMode } from '../../stores/uiStore';
import type { TaskStatusCounts, TaskStatusFilter } from '../../lib/taskStatusFilter';
import { TaskStatusFilterControl } from './TaskStatusFilterControl';
import { cn } from '../../lib/cn';

export type SortMode = 'manual' | 'date-asc' | 'date-desc' | 'priority' | 'alpha-asc' | 'alpha-desc' | 'created-desc' | 'created-asc' | 'status';

const sortOptions: { value: SortMode; label: string }[] = [
  { value: 'manual', label: '手动排序' },
  { value: 'status', label: '按状态排序' },
  { value: 'date-asc', label: '截止日期 (近→远)' },
  { value: 'date-desc', label: '截止日期 (远→近)' },
  { value: 'priority', label: '优先级 (高→低)' },
  { value: 'alpha-asc', label: '字母 (A→Z)' },
  { value: 'alpha-desc', label: '字母 (Z→A)' },
  { value: 'created-desc', label: '创建时间 (新→旧)' },
  { value: 'created-asc', label: '创建时间 (旧→新)' },
];

// 视图作用于当前范围的任务:同一批任务,换一种看法
const viewOptions: { value: TaskViewMode; label: string; icon: LucideIcon }[] = [
  { value: 'list', label: '列表', icon: LayoutList },
  { value: 'wall', label: '便签墙', icon: Columns3 },
  { value: 'unified', label: '一体式', icon: SplitSquareHorizontal },
  { value: 'kanban', label: '看板', icon: Layout },
  { value: 'matrix', label: '四象限', icon: LayoutGrid },
];

const MENU_TRIGGER_CLASS = 'h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md bg-white dark:bg-[#1e1e32] border border-[#E5E7EB] dark:border-white/[0.07] text-[12px] font-medium text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06] transition-colors';

interface HeaderDropdownProps<T extends string> {
  // 触发按钮上的图标和当前项的名称
  trigger: React.ReactNode;
  // 触发按钮的无障碍名称;不传时名称取按钮里的文字
  label?: string;
  items: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onSelect: (value: T) => void;
}

// 页头的下拉(排序、视图)。浮层按项目约定用 Portal + 固定定位
function HeaderDropdown<T extends string>({ trigger, label, items, value, onSelect }: HeaderDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 4, left: 8 });

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={(event) => {
          if (!open) {
            const rect = event.currentTarget.getBoundingClientRect();
            setPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 200) });
          }
          setOpen(!open);
        }}
        className={MENU_TRIGGER_CLASS}
      >
        {trigger}
      </button>
      {open && (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[200px]"
            style={position}
          >
            {items.map((item) => (
              <button
                key={item.value}
                role="menuitemradio"
                aria-checked={item.value === value}
                onClick={() => { onSelect(item.value); setOpen(false); }}
                className={cn(
                  'w-full text-left flex items-center gap-2 px-3 py-2 text-[13px] transition-colors',
                  item.value === value
                    ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6] font-medium'
                    : 'text-[#111827] dark:text-white/90 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]',
                )}
              >
                {item.icon && <item.icon size={14} className="shrink-0" />}
                <span className="flex-1">{item.label}</span>
                {item.value === value && <Check size={13} className="shrink-0" />}
              </button>
            ))}
          </div>
        </Portal>
      )}
    </div>
  );
}

interface PageTitleProps {
  title: string;
  taskCount: number;
  statusCounts?: TaskStatusCounts;
  statusFilter?: TaskStatusFilter;
  onStatusFilterChange?: (mode: TaskStatusFilter) => void;
  sortMode?: SortMode;
  onSortChange?: (mode: SortMode) => void;
  onNewTask?: () => void;
  selectionMode?: boolean;
  onToggleSelection?: () => void;
  taskViewMode?: TaskViewMode;
  onViewChange?: (mode: TaskViewMode) => void;
}

export function PageTitle({
  title,
  taskCount,
  statusCounts,
  statusFilter,
  onStatusFilterChange,
  sortMode = 'manual',
  onSortChange,
  onNewTask,
  selectionMode,
  onToggleSelection,
  taskViewMode,
  onViewChange,
}: PageTitleProps) {
  const globalSubtasksExpanded = useUIStore((s) => s.globalSubtasksExpanded);
  const toggleGlobalSubtasksExpanded = useUIStore((s) => s.toggleGlobalSubtasksExpanded);
  // 看板与四象限只有根任务卡片:没有子任务可展开,也没有批量选择
  const isBoard = taskViewMode === 'kanban' || taskViewMode === 'matrix';
  const currentView = viewOptions.find((option) => option.value === taskViewMode);

  return (
    <div className="flex items-center gap-3 w-full flex-wrap">
      <h1 className="text-[20px] font-bold text-[#111827] dark:text-white">{title}</h1>
      {taskCount > 0 && statusCounts && statusFilter && onStatusFilterChange && (
        <TaskStatusFilterControl value={statusFilter} counts={statusCounts} onChange={onStatusFilterChange} />
      )}
      {taskCount > 0 && !onStatusFilterChange && (
        <span className="h-[22px] inline-flex items-center px-2 rounded-full bg-[#EEF2FF] text-[12px] font-medium text-[#6366F1]">
          {taskCount} 项
        </span>
      )}

      {/* 右侧的操作成一组:窗口放不下时整组换到下一行并靠右,不会只剩一个按钮掉到左边 */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        {/* 展开/折叠子任务 */}
        {taskCount > 0 && !isBoard && taskViewMode !== 'wall' && taskViewMode !== 'unified' && (
          <button onClick={toggleGlobalSubtasksExpanded}
            className={MENU_TRIGGER_CLASS}
            title={globalSubtasksExpanded ? '折叠全部子任务' : '展开全部子任务'}>
            {globalSubtasksExpanded ? <ListCollapse size={13} className="text-[#6B7280]" /> : <ListTree size={13} className="text-[#6B7280]" />}
            {globalSubtasksExpanded ? '收起子任务' : '展开子任务'}
          </button>
        )}

        {/* View menu */}
        {onViewChange && taskViewMode && currentView && (
          <HeaderDropdown
            label={`视图：${currentView.label}`}
            trigger={<>
              <currentView.icon size={13} className="text-[#6B7280]" />
              {currentView.label}
              <ChevronDown size={12} className="text-[#9CA3AF]" />
            </>}
            items={viewOptions}
            value={taskViewMode}
            onSelect={onViewChange}
          />
        )}

        {/* Sort button */}
        {onSortChange && (
          <HeaderDropdown
            trigger={<>
              <ArrowUpDown size={13} className="text-[#6B7280]" />
              {sortOptions.find((o) => o.value === sortMode)?.label || '排序方式'}
            </>}
            items={sortOptions}
            value={sortMode}
            onSelect={onSortChange}
          />
        )}

        {/* Multi-select toggle */}
        {onToggleSelection && !isBoard && (
          <button
            onClick={onToggleSelection}
            className={`h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md border text-[12px] font-medium transition-colors ${
              selectionMode
                ? 'bg-[#7C72F6] text-white border-[#7C72F6]'
                : 'bg-white dark:bg-[#1e1e32] border-[#E5E7EB] dark:border-white/[0.07] text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06]'
            }`}
          >
            <CheckSquare size={13} />
            多选
          </button>
        )}

        {/* New task button */}
        {onNewTask && (
          <button
            onClick={onNewTask}
            className="h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md bg-[#7C72F6] text-white text-[12px] font-medium hover:bg-[#6D63E6] transition-colors"
          >
            <Plus size={13} />
            新建任务
          </button>
        )}
      </div>
    </div>
  );
}
