import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import type { DraftMyDayAction } from '../../stores/myDayPlanStore';
import { cn } from '../../lib/cn';

/**
 * 建议预览中的单张行动草稿卡:标题/日期等事实来自软件真实数据,
 * 理由只读;下一步与停止标准可编辑;支持勾选、换序与「换一件」。
 */
export function MyDayActionCard({
  draft,
  index,
  total,
  busy,
  onEdit,
  onToggleSelected,
  onMove,
  onSwapOut,
}: {
  draft: DraftMyDayAction;
  index: number;
  total: number;
  busy: boolean;
  onEdit: (patch: Partial<DraftMyDayAction>) => void;
  onToggleSelected: () => void;
  onMove: (direction: -1 | 1) => void;
  onSwapOut: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2 space-y-1.5 transition-colors',
        draft.selected
          ? 'border-[#7C72F6]/30 bg-[#FAFAFF] dark:bg-white/[0.04]'
          : 'border-transparent bg-[#F9FAFB] dark:bg-white/[0.02] opacity-70',
      )}
      data-testid="my-day-action-card"
    >
      <div className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={draft.selected}
          onChange={onToggleSelected}
          className="w-3 h-3 accent-[#7C72F6] shrink-0"
          aria-label={draft.selected ? '取消采纳这一项' : '采纳这一项'}
        />
        <span className="text-[10px] text-[#9CA3AF] shrink-0">{index + 1}</span>
        <span className={cn('text-xs font-medium truncate flex-1', 'text-[#111827] dark:text-white/90')}>
          {draft.root_title}
        </span>
        {draft.subtask_title && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[#7C72F6]/10 text-[#7C72F6] truncate max-w-[40%]">
            {draft.subtask_title}
          </span>
        )}
        {draft.already_in_my_day && (
          <span className="shrink-0 text-[10px] text-amber-500">已加入</span>
        )}
        <div className="shrink-0 flex items-center gap-0.5">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0 || busy}
            className="p-0.5 rounded text-[#9CA3AF] hover:text-[#374151] dark:hover:text-white/70 disabled:opacity-30"
            aria-label="上移"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1 || busy}
            className="p-0.5 rounded text-[#9CA3AF] hover:text-[#374151] dark:hover:text-white/70 disabled:opacity-30"
            aria-label="下移"
          >
            <ChevronDown size={12} />
          </button>
          <button
            onClick={onSwapOut}
            disabled={busy}
            className="ml-1 flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#EF4444]/8 disabled:opacity-30"
            title="排除该任务并换一件"
          >
            <RefreshCw size={10} />换一件
          </button>
        </div>
      </div>
      <p className="text-[10px] text-[#6B7280] leading-relaxed">{draft.reason}</p>
      <div className="grid grid-cols-1 gap-1">
        <label className="block">
          <span className="text-[10px] text-[#9CA3AF]">下一步行动</span>
          <textarea
            value={draft.next_step}
            onChange={(e) => onEdit({ next_step: e.target.value })}
            rows={2}
            maxLength={300}
            className="mt-0.5 w-full rounded-md border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/[0.04] px-1.5 py-1 text-[11px] text-[#111827] dark:text-white/90 resize-none focus:outline-none focus:border-[#7C72F6]/50"
            data-testid="my-day-next-step-input"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-[#9CA3AF]">本次停止标准</span>
          <textarea
            value={draft.stop_at}
            onChange={(e) => onEdit({ stop_at: e.target.value })}
            rows={2}
            maxLength={300}
            className="mt-0.5 w-full rounded-md border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/[0.04] px-1.5 py-1 text-[11px] text-[#111827] dark:text-white/90 resize-none focus:outline-none focus:border-[#7C72F6]/50"
            data-testid="my-day-stop-at-input"
          />
        </label>
      </div>
      {draft.was_mandatory && !draft.selected && (
        <p className="text-[10px] text-[#F59E0B]">该项曾被标记为必做,采纳摘要会显示其未被选中</p>
      )}
    </div>
  );
}
