import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, Eye, Loader2, Play, Star, Trash2 } from 'lucide-react';
import type { MyDayActionStatus } from '../../domain/models/ai';
import { getRepositories } from '../../domain/repositories/current';
import { queryKeys, invalidateMyDayPlan } from '../../lib/queryKeys';
import { usePomodoroStore } from '../../stores/pomodoroStore';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../lib/cn';

/** 卡片状态 → 用户可读说明;ok 不展示,changed 提示但不禁用开工 */
const STATUS_LABELS: Record<MyDayActionStatus, string> = {
  ok: '',
  changed: '任务内容有变化,建议检查或重新建议',
  completed: '任务已完成',
  suspended: '任务已挂起',
  abandoned: '任务已放弃',
  archived: '任务已归档',
  deleted: '任务已删除',
  removed_from_day: '已移出今日',
  subtask_invalid: '目标子任务已失效',
  subtask_completed: '本步(子任务)已完成',
};

/**
 * 已采纳的「今日重点」区块:数据来自本机当日计划并联查实时任务状态。
 * 打开任务不改变当前筛选;被筛选隐藏时提供明确的「切到进行中并定位」操作。
 * 已有运行/暂停的番茄钟时不直接覆盖计时,提示用户先处理当前专注。
 */
export function MyDayFocusPlan({
  today,
  hiddenTaskIds,
}: {
  today: string;
  hiddenTaskIds: Set<string>;
}) {
  const queryClient = useQueryClient();
  const [clearing, setClearing] = useState(false);
  const { data: plan } = useQuery({
    queryKey: queryKeys.myDayPlan.detail(today),
    queryFn: () => getRepositories().ai.getMyDayPlan(today),
  });

  if (!plan || plan.actions.length === 0) return null;

  const openTask = (taskId: string) => {
    useUIStore.getState().setSelectedTaskId(taskId);
  };

  const locateInList = (taskId: string) => {
    // 明确操作:切到进行中筛选并打开详情,不静默改筛选
    useUIStore.getState().setTaskStatusFilter('active');
    useUIStore.getState().setSelectedTaskId(taskId);
  };

  const startFocus = (taskId: string, title: string) => {
    const pomodoro = usePomodoroStore.getState();
    if (pomodoro.isRunning || pomodoro.isPaused) {
      toast.info('已有专注进行中,请先处理当前番茄钟');
      return;
    }
    pomodoro.startTimer(taskId, title);
  };

  const clearPlan = async () => {
    setClearing(true);
    try {
      await getRepositories().ai.clearMyDayPlan(today, plan.revision);
      invalidateMyDayPlan(queryClient, today);
      toast.success('已清除今日重点(任务仍在今日清单)');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mb-3" data-testid="my-day-focus-plan">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-[#6B7280] tracking-wide">
          <Star size={12} className="text-[#F59E0B] fill-[#F59E0B]" />
          今日重点 &middot; {plan.actions.length}
          <span className="font-normal text-[10px] text-[#9CA3AF]">AI 采纳 · {plan.model_snapshot}</span>
        </span>
        <button
          onClick={clearPlan}
          disabled={clearing}
          className="flex items-center gap-0.5 text-[10px] text-[#9CA3AF] hover:text-[#EF4444] disabled:opacity-40"
          title="只清除重点卡片,不移出今日清单"
        >
          {clearing ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
          清除重点
        </button>
      </div>
      <div className="space-y-1">
        {plan.actions.map((action) => {
          const hidden = hiddenTaskIds.has(action.root_task_id);
          const focusTitle = action.subtask_title ?? action.root_title ?? action.root_task_id;
          const focusTaskId = action.target_subtask_id ?? action.root_task_id;
          return (
            <div
              key={`${action.root_task_id}-${action.display_order}`}
              className={cn(
                'rounded-lg border px-2.5 py-1.5 space-y-1',
                action.status === 'ok'
                  ? 'border-[#F59E0B]/30 bg-amber-50/60 dark:bg-amber-500/[0.06]'
                  : action.status === 'changed'
                    ? 'border-amber-300/40 bg-amber-50/40 dark:bg-amber-500/[0.04]'
                    : 'border-transparent bg-[#F9FAFB] dark:bg-white/[0.02] opacity-75',
              )}
              data-testid="my-day-focus-card"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#F59E0B] font-semibold shrink-0">{action.display_order}</span>
                <span className="text-xs font-medium text-[#111827] dark:text-white/90 truncate flex-1">
                  {action.root_title ?? '(任务已删除)'}
                </span>
                {action.subtask_title && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[#7C72F6]/10 text-[#7C72F6] truncate max-w-[40%]">
                    {action.subtask_title}
                  </span>
                )}
                <button
                  onClick={() => openTask(action.root_task_id)}
                  className="shrink-0 p-1 rounded text-[#9CA3AF] hover:text-[#7C72F6]"
                  title="打开任务"
                  aria-label="打开任务"
                >
                  <ExternalLink size={12} />
                </button>
                {action.can_start && (
                  <button
                    onClick={() => startFocus(focusTaskId, focusTitle)}
                    className="shrink-0 flex items-center gap-0.5 text-[10px] px-2 py-1 rounded-full bg-[#7C72F6]/10 text-[#7C72F6] hover:bg-[#7C72F6]/20 font-medium"
                  >
                    <Play size={10} />开始专注
                  </button>
                )}
              </div>
              <div className="text-[10px] text-[#6B7280] leading-relaxed">
                <span className="text-[#9CA3AF]">下一步:</span>{action.next_step}
                <span className="text-[#9CA3AF] ml-1.5">停在哪里:</span>{action.stop_at}
              </div>
              {action.status !== 'ok' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[#EF4444]">{STATUS_LABELS[action.status]}</span>
                  {action.status === 'changed' && hidden && (
                    <button
                      onClick={() => locateInList(action.root_task_id)}
                      className="flex items-center gap-0.5 text-[10px] text-[#7C72F6] hover:underline"
                    >
                      <Eye size={10} />被筛选隐藏,切到进行中并定位
                    </button>
                  )}
                </div>
              )}
              {action.status === 'ok' && hidden && (
                <button
                  onClick={() => locateInList(action.root_task_id)}
                  className="flex items-center gap-0.5 text-[10px] text-[#7C72F6] hover:underline"
                >
                  <Eye size={10} />被筛选隐藏,切到进行中并定位
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
