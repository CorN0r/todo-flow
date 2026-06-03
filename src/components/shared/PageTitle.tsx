import { useState, useRef } from 'react';
import { ArrowUpDown, Plus, CheckSquare, ListCollapse, ListTree } from 'lucide-react';
import { Portal } from './Portal';
import { useUIStore } from '../../stores/uiStore';

export type SortMode = 'manual' | 'date-asc' | 'date-desc' | 'priority' | 'alpha-asc' | 'alpha-desc' | 'created-desc' | 'created-asc';

const sortOptions: { value: SortMode; label: string }[] = [
  { value: 'manual', label: '手动排序' },
  { value: 'date-asc', label: '截止日期 (近→远)' },
  { value: 'date-desc', label: '截止日期 (远→近)' },
  { value: 'priority', label: '优先级 (高→低)' },
  { value: 'alpha-asc', label: '字母 (A→Z)' },
  { value: 'alpha-desc', label: '字母 (Z→A)' },
  { value: 'created-desc', label: '创建时间 (新→旧)' },
  { value: 'created-asc', label: '创建时间 (旧→新)' },
];

export type FilterMode = 'all' | 'incomplete' | 'completed' | 'overdue';

interface PageTitleProps {
  title: string;
  taskCount: number;
  completedCount?: number;
  overdueCount?: number;
  filterMode?: FilterMode;
  onFilterChange?: (mode: FilterMode) => void;
  sortMode?: SortMode;
  onSortChange?: (mode: SortMode) => void;
  onNewTask?: () => void;
  selectionMode?: boolean;
  onToggleSelection?: () => void;
}

export function PageTitle({
  title,
  taskCount,
  completedCount,
  overdueCount,
  filterMode,
  onFilterChange,
  sortMode = 'manual',
  onSortChange,
  onNewTask,
  selectionMode,
  onToggleSelection,
}: PageTitleProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const showCompletion = completedCount !== undefined && taskCount > 0;
  const globalSubtasksExpanded = useUIStore((s) => s.globalSubtasksExpanded);
  const toggleGlobalSubtasksExpanded = useUIStore((s) => s.toggleGlobalSubtasksExpanded);

  const filterBtn = (mode: FilterMode, label: string) => {
    const isActive = (filterMode || 'all') === mode;
    return (
      <button onClick={() => onFilterChange?.(mode)}
        className={`h-[22px] inline-flex items-center px-2 rounded-full text-[12px] font-medium transition-colors ${
          isActive
            ? 'bg-[#7C72F6] text-white'
            : 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1]'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-3 w-full flex-wrap">
      <h1 className="text-[20px] font-bold text-[#111827] dark:text-white">{title}</h1>
      {taskCount > 0 && onFilterChange && (
        <div className="flex items-center gap-1">
          {filterBtn('all', `全部 ${taskCount} 项`)}
          {filterBtn('incomplete', `未完成 ${taskCount - (completedCount || 0)}`)}
          {completedCount !== undefined && completedCount > 0 && filterBtn('completed', `已完成 ${completedCount}`)}
          {overdueCount !== undefined && overdueCount > 0 && filterBtn('overdue', `超期 ${overdueCount}`)}
        </div>
      )}
      {taskCount > 0 && !onFilterChange && (
        <span className="h-[22px] inline-flex items-center px-2 rounded-full bg-[#EEF2FF] text-[12px] font-medium text-[#6366F1]">
          {showCompletion ? `${completedCount}/${taskCount}` : `${taskCount}`} 项
        </span>
      )}

      <div className="flex-1" />

      {/* Expand/collapse all subtasks */}
      {taskCount > 0 && (
        <button onClick={toggleGlobalSubtasksExpanded}
          className="h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md bg-white dark:bg-[#1e1e32] border border-[#E5E7EB] dark:border-white/[0.07] text-[12px] font-medium text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06] transition-colors"
          title={globalSubtasksExpanded ? '折叠全部子任务' : '展开全部子任务'}>
          {globalSubtasksExpanded ? <ListCollapse size={13} className="text-[#6B7280]" /> : <ListTree size={13} className="text-[#6B7280]" />}
          {globalSubtasksExpanded ? '收起子任务' : '展开子任务'}
        </button>
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

      {/* Sort button */}
      {onSortChange && (
        <div className="relative">
          <button
            ref={sortBtnRef}
            onClick={() => setSortOpen(!sortOpen)}
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
                style={{
                  top: (sortBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: (sortBtnRef.current?.getBoundingClientRect().right ?? 0) - 200,
                }}
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
