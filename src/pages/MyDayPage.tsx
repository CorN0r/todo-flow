import { useMemo, useCallback, useState, useEffect } from 'react';
import { todayISO, subDays } from '../lib/date';
import { useTasks, useUpdateTask } from '../hooks/useTasks';
import { useUIStore } from '../stores/uiStore';
import { TaskList } from '../components/tasks/TaskList';
import { StickyWall } from '../components/tasks/StickyWall';
import { UnifiedLayout } from '../components/tasks/UnifiedLayout';
import { TaskQuickAdd } from '../components/tasks/TaskQuickAdd';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { EmptyState } from '../components/shared/EmptyState';
import { PageTitle, type FilterMode } from '../components/shared/PageTitle';
import { Sun, AlertTriangle, Lightbulb, ArrowRight, Plus } from 'lucide-react';
import { sortTasks, nestChildren } from '../lib/sortTasks';
import { cn } from '../lib/cn';
import { useTheme } from '../hooks/useTheme';

const QUOTES = [
  '每一天都是一个新的开始',
  '完成小目标，成就大梦想',
  '专注当下，一件一件来',
  '今天的一小步，明天的一大步',
  '不积跬步，无以至千里',
  '把重要的事放在第一位',
  '你今天的选择，决定明天的你',
  '坚持比完美更重要',
  '做好今天的事，明天自有安排',
  '成功就是把简单的事重复做',
];

function dailyQuote() {
  const d = new Date();
  const idx = (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) % QUOTES.length;
  return QUOTES[idx];
}

export function MyDayPage() {
  const today = todayISO();
  const yesterday = subDays(new Date(), 1).toISOString().split('T')[0];
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const { data: tasks, isLoading, isError } = useTasks({ my_day_date: today, include_children: true });
  const { data: yesterdayTasks } = useTasks({ my_day_date: yesterday, is_completed: false, include_children: true });
  const { data: suggestions } = useTasks({ is_completed: false, due_date_to: today, include_children: false });
  const updateTask = useUpdateTask();

  const sortMode = useUIStore((s) => s.sortMode);
  const setSortMode = useUIStore((s) => s.setSortMode);
  const taskViewMode = useUIStore((s) => s.taskViewMode);
  const setTaskViewMode = useUIStore((s) => s.setTaskViewMode);
  const selectionMode = useUIStore((s) => s.selectionMode);
  const exitSelection = useUIStore((s) => s.exitSelectionMode);
  const showNewTask = useUIStore((s) => s.showQuickAdd);
  const setShowNewTask = useUIStore((s) => s.setShowQuickAdd);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showYesterday, setShowYesterday] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('myday-dismissed') || '[]')); } catch { return new Set(); }
  });
  const addDismissed = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set([...prev, id]);
      sessionStorage.setItem('myday-dismissed', JSON.stringify([...next]));
      return next;
    });
  };
  const clearDismissed = () => {
    setDismissedIds(new Set());
    sessionStorage.removeItem('myday-dismissed');
  };

  const sorted = useMemo(() => sortTasks(tasks || [], sortMode), [tasks, sortMode]);
  const topLevel = useMemo(() => nestChildren(sorted), [sorted]);
  const filtered = useMemo(() => {
    if (filterMode === 'incomplete') return topLevel.filter((t) => !t.is_completed && !t.is_abandoned);
    if (filterMode === 'completed') return topLevel.filter((t) => t.is_completed || t.is_abandoned);
    if (filterMode === 'overdue') return topLevel.filter((t) => !t.is_completed && !t.is_abandoned && t.due_date && t.due_date < today);
    return topLevel;
  }, [topLevel, filterMode, today]);
  const completedCount = topLevel.filter((t) => t.is_completed || t.is_abandoned).length;
  const overdueCount = topLevel.filter((t) => !t.is_completed && !t.is_abandoned && t.due_date && t.due_date < today).length;

  const myDayIds = new Set(tasks?.map((t) => t.id) || []);
  const yesterdayList = (yesterdayTasks || []).filter((t) => !myDayIds.has(t.id) && !t.parent_task_id);
  const suggestionList = (suggestions || []).filter((t) => !myDayIds.has(t.id) && !t.parent_task_id && t.priority > 0 && !t.is_suspended && !t.is_abandoned && !dismissedIds.has(t.id));

  const setSelectableIds = useUIStore((s) => s.setSelectableIds);
  useEffect(() => { setSelectableIds(filtered.map((t) => t.id)); }, [filtered, setSelectableIds]);

  const handleToggleSelection = useCallback(() => {
    if (selectionMode) { exitSelection(); } else { useUIStore.getState().enterSelectionMode(); }
  }, [selectionMode, exitSelection]);

  const addToMyDay = (id: string) => updateTask.mutate({ id, my_day_date: today });
  const addAllToMyDay = (ids: string[]) => ids.forEach((id) => updateTask.mutate({ id, my_day_date: today }));

  if (isLoading) return <LoadingSkeleton count={5} />;
  if (isError) return <EmptyState icon={<AlertTriangle size={40} />} title="加载失败" description="请检查数据库连接后重试" />;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
          <Sun size={18} className="text-amber-500" />
        </div>
        <div className="flex-1">
          <PageTitle title="我的一天" taskCount={topLevel.length} completedCount={completedCount}
            overdueCount={overdueCount} filterMode={filterMode} onFilterChange={setFilterMode}
            sortMode={sortMode} onSortChange={setSortMode}
            onNewTask={() => setShowNewTask(true)}
            selectionMode={selectionMode} onToggleSelection={handleToggleSelection}
            taskViewMode={taskViewMode} onToggleViewMode={() => {
              if (taskViewMode === 'unified') useUIStore.getState().setSelectedTaskId(null);
              setTaskViewMode(taskViewMode === 'wall' ? 'unified' : taskViewMode === 'unified' ? 'list' : 'wall');
            }} />
          <p className="text-xs text-[#6B7280]">{today}</p>
        </div>
      </div>

      {/* 灯泡提示 */}
      <div className={cn(
        'shrink-0 flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-lg text-xs',
        isDark ? 'text-amber-300/80 bg-amber-500/8' : 'text-amber-700 bg-amber-50',
      )}>
        <Lightbulb size={13} className="text-amber-500 shrink-0" />
        <span className="font-medium">{dailyQuote()}</span>
      </div>

      {showNewTask && (
        <div className="shrink-0 mb-[6px]">
          <TaskQuickAdd defaultDueDate={today} defaultMyDay={today} onCreated={() => setShowNewTask(false)} onCancel={() => setShowNewTask(false)} />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto pb-6">
        {/* 昨日未完成 */}
        {yesterdayList.length > 0 && showYesterday && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-[#6B7280] tracking-wide">
                昨日未完成 &middot; {yesterdayList.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => addAllToMyDay(yesterdayList.map((t) => t.id))}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[#7C72F6]/10 text-[#7C72F6] hover:bg-[#7C72F6]/20 transition-colors font-medium">
                  全部加入我的今天
                </button>
                <button onClick={() => setShowYesterday(false)}
                  className="text-[10px] px-1 py-0.5 rounded text-[#9CA3AF] hover:text-[#6B7280]">收起</button>
              </div>
            </div>
            <div className="space-y-0.5">
              {yesterdayList.map((task) => (
                <div key={task.id}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors',
                    isDark ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-[#F9FAFB] hover:bg-[#F3F4F6]',
                  )}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className={cn('flex-1 truncate', isDark ? 'text-white/70' : 'text-[#374151]')}>{task.title}</span>
                  <button onClick={() => addToMyDay(task.id)}
                    className="shrink-0 flex items-center gap-0.5 text-[10px] text-[#7C72F6] hover:underline">
                    <Plus size={10} />加入
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!showYesterday && yesterdayList.length > 0 && (
          <button onClick={() => setShowYesterday(true)}
            className="w-full mb-3 px-3 py-1.5 rounded-lg text-[11px] text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors text-left">
            <ArrowRight size={11} className="inline mr-1" />
            昨日未完成 &middot; {yesterdayList.length} 项
          </button>
        )}
        {/* 每日建议 */}
        {suggestionList.length > 0 && showSuggestions && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-[#6B7280] tracking-wide">
                建议 &middot; {suggestionList.length}
              </span>
              <button onClick={() => setShowSuggestions(false)}
                className="text-[10px] px-1 py-0.5 rounded text-[#9CA3AF] hover:text-[#6B7280]">收起</button>
            </div>
            <div className="space-y-0.5">
              {suggestionList.slice(0, 6).map((task) => (
                <div key={task.id}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors',
                    isDark ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-[#F9FAFB] hover:bg-[#F3F4F6]',
                  )}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7C72F6] shrink-0" />
                  <span className={cn('flex-1 truncate', isDark ? 'text-white/70' : 'text-[#374151]')}>{task.title}</span>
                  <button onClick={() => addToMyDay(task.id)}
                    className="shrink-0 flex items-center gap-0.5 text-[10px] text-[#7C72F6] hover:underline">
                    <Plus size={10} />加入
                  </button>
                  <button onClick={() => addDismissed(task.id)}
                    className="shrink-0 text-[10px] text-[#9CA3AF] hover:text-[#6B7280] ml-1">暂不</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!showSuggestions && suggestionList.length > 0 && (
          <button onClick={() => setShowSuggestions(true)}
            className="w-full mb-3 px-3 py-1.5 rounded-lg text-[11px] text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors text-left">
            <ArrowRight size={11} className="inline mr-1" />
            建议 &middot; {suggestionList.length} 项
          </button>
        )}
        {dismissedIds.size > 0 && (
          <button onClick={clearDismissed}
            className="w-full mb-3 px-3 py-1.5 rounded-lg text-[11px] text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors text-left">
            重新推荐 &middot; {dismissedIds.size} 项
          </button>
        )}
        <div className={cn('flex-1 min-h-0', taskViewMode === 'unified' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto pb-6')}>
          {taskViewMode === 'wall' ? <StickyWall tasks={filtered} /> : taskViewMode === 'unified' ? <UnifiedLayout tasks={filtered} /> : <TaskList tasks={filtered} />}
        </div>
        {sorted.length === 0 && !showNewTask && (
          <EmptyState icon={<Sun size={40} />} title="今天没有任务"
            description='右键任务选择"加入我的一天"，或点击上方新建任务' />
        )}
      </div>
    </div>
  );
}
