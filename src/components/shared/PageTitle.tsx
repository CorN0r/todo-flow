import { useState } from 'react';
import { ArrowUpDown, Plus, CheckSquare, ListCollapse, ListTree, LayoutList, Columns3, SplitSquareHorizontal } from 'lucide-react';
import { Portal } from './Portal';
import { useUIStore } from '../../stores/uiStore';
import type { TaskStatusCounts, TaskStatusFilter } from '../../lib/taskStatusFilter';
import { TaskStatusFilterControl } from './TaskStatusFilterControl';

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
  taskViewMode?: 'list' | 'wall' | 'unified';
  onToggleViewMode?: () => void;
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
  onToggleViewMode,
}: PageTitleProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const [sortPosition, setSortPosition] = useState({ top: 4, left: 8 });
  const globalSubtasksExpanded = useUIStore((s) => s.globalSubtasksExpanded);
  const toggleGlobalSubtasksExpanded = useUIStore((s) => s.toggleGlobalSubtasksExpanded);

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

      <div className="flex-1" />

      {/* 展开/折叠子任务 */}
      {taskCount > 0 && taskViewMode !== 'wall' && taskViewMode !== 'unified' && (
        <button onClick={toggleGlobalSubtasksExpanded}
          className="h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md bg-white dark:bg-[#1e1e32] border border-[#E5E7EB] dark:border-white/[0.07] text-[12px] font-medium text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06] transition-colors"
          title={globalSubtasksExpanded ? '折叠全部子任务' : '展开全部子任务'}>
          {globalSubtasksExpanded ? <ListCollapse size={13} className="text-[#6B7280]" /> : <ListTree size={13} className="text-[#6B7280]" />}
          {globalSubtasksExpanded ? '收起子任务' : '展开子任务'}
        </button>
      )}

      {/* View mode toggle */}
      {onToggleViewMode && (
        <button onClick={onToggleViewMode}
          className="h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md bg-white dark:bg-[#1e1e32] border border-[#E5E7EB] dark:border-white/[0.07] text-[12px] font-medium text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06] transition-colors"
          title={taskViewMode === 'unified' ? '切换为列表' : taskViewMode === 'wall' ? '切换为一体式' : '切换为便签墙'}>
          {taskViewMode === 'unified' ? <LayoutList size={13} className="text-[#6B7280]" /> : taskViewMode === 'wall' ? <SplitSquareHorizontal size={13} className="text-[#6B7280]" /> : <Columns3 size={13} className="text-[#6B7280]" />}
        </button>
      )}

      {/* Sort button */}
      {onSortChange && (
        <div className="relative">
          <button
            onClick={(event) => {
              if (!sortOpen) {
                const rect = event.currentTarget.getBoundingClientRect();
                setSortPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 200) });
              }
              setSortOpen(!sortOpen);
            }}
            className="h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md bg-white dark:bg-[#1e1e32] border border-[#E5E7EB] dark:border-white/[0.07] text-[12px] font-medium text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06] transition-colors"
          >
            <ArrowUpDown size={13} className="text-[#6B7280]" />
            {sortOptions.find((o) => o.value === sortMode)?.label || '排序方式'}
          </button>
          {sortOpen && (
            <Portal>
              <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
              <div
                className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[200px]"
                style={sortPosition}
              >
                {sortOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { onSortChange(opt.value); setSortOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-[13px] transition-colors ${
                      sortMode === opt.value
                        ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6] font-medium'
                        : 'text-[#111827] dark:text-white/90 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Portal>
          )}
        </div>
      )}

      {/* Multi-select toggle */}
      {onToggleSelection && (
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
  );
}
