import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, RefreshCw } from 'lucide-react';
import type { DraftMyDayAction } from '../../stores/myDayPlanStore';
import { cn } from '../../lib/cn';

// 文字只分两档,与 MyDayAiPanel 一致(次要的一档在各主题下对比度也不低于 4.5:1)
const TEXT_MAIN = 'text-[#111827] dark:text-white/90';
const TEXT_SECONDARY = 'text-[#374151] dark:text-white/80';
const CHIP_SELECTED = 'bg-[#E5E7EB] dark:bg-white/10 text-[#111827] dark:text-white/90 font-medium';
// 这组按钮平时待在宽度为 0 的容器里,必须不收缩、不换行:否则文字会竖着排开,把标题行从 20px 撑到 54px
const QUIET_BUTTON = 'inline-flex shrink-0 whitespace-nowrap items-center gap-0.5 text-[11px] px-1.5 py-px rounded-full border border-[#E5E7EB] dark:border-white/10 text-[#374151] dark:text-white/80 hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] disabled:opacity-40';
const FIELD = 'mt-0.5 w-full rounded-lg border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/[0.02] px-2 py-1 text-[12px] resize-none focus:outline-none focus:border-[#7C72F6]';
// 换序和「换一件」平时不占宽度:鼠标悬停或键盘聚焦到这张卡时才在标题行末尾展开
const ACTIONS_HIDDEN =
  'w-0 opacity-0 overflow-hidden group-hover:w-auto group-hover:overflow-visible group-hover:opacity-100 group-focus-within:w-auto group-focus-within:overflow-visible group-focus-within:opacity-100';
const ACTIONS_SHOWN = 'w-auto opacity-100';

/**
 * 建议预览中的一条行动:默认只有标题行和一行「下一步 / 停在哪里」,和采纳后「今日重点」里的样子一致;
 * 点那一行才展开理由和两个可编辑框。标题等事实来自软件真实数据,理由只读;支持勾选、换序与「换一件」。
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
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState(false);
  // 平时只留一个键盘入口,其余不占 Tab 顺序;聚焦进来之后整组都能 Tab 到
  const actionsVisible = hovered || focused;
  return (
    <div
      className="group px-1 py-1 space-y-0.5"
      data-testid="my-day-action-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-2 min-w-0 min-h-5">
        <input
          type="checkbox"
          checked={draft.selected}
          onChange={onToggleSelected}
          disabled={busy}
          className="w-3.5 h-3.5 accent-[#7C72F6] shrink-0 cursor-pointer disabled:cursor-not-allowed"
          aria-label={draft.selected ? '取消采纳这一项' : '采纳这一项'}
        />
        <span className={cn('shrink-0 w-3 text-right text-[11px] tabular-nums', TEXT_SECONDARY)}>{index + 1}</span>
        <span className={cn('min-w-[80px] truncate text-[13px] font-medium', draft.selected ? TEXT_MAIN : TEXT_SECONDARY)}>
          {draft.root_title}
        </span>
        {draft.subtask_title && (
          <span className={cn('min-w-0 max-w-[40%] truncate text-[11px]', TEXT_SECONDARY)} title={draft.subtask_title}>
            → {draft.subtask_title}
          </span>
        )}
        {draft.already_in_my_day && (
          <span className={cn('shrink-0 text-[11px] px-2 py-0.5 rounded-full', CHIP_SELECTED)} title="已在今日清单里">
            已加入
          </span>
        )}
        <div
          data-testid="my-day-card-actions"
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
          }}
          className={cn('flex items-center gap-0.5 shrink-0 transition-opacity duration-150', actionsVisible ? ACTIONS_SHOWN : ACTIONS_HIDDEN)}
        >
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0 || busy}
            aria-label="上移"
            title="上移"
            className={QUIET_BUTTON}
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1 || busy}
            aria-label="下移"
            title="下移"
            tabIndex={actionsVisible ? 0 : -1}
            className={QUIET_BUTTON}
          >
            <ChevronDown size={12} />
          </button>
          <button
            type="button"
            onClick={onSwapOut}
            disabled={busy}
            title="排除该任务并换一件"
            tabIndex={actionsVisible ? 0 : -1}
            className={cn(QUIET_BUTTON, 'hover:border-[#EF4444]/40 hover:bg-[#EF4444]/10')}
          >
            <RefreshCw size={10} />换一件
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        disabled={busy}
        aria-expanded={editing}
        title="点击查看理由并修改下一步、停止标准"
        data-testid="my-day-card-toggle"
        className={cn(
          'block w-full rounded-md py-0.5 pl-[42px] pr-2 text-left text-[12px] leading-relaxed transition-colors hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]',
          TEXT_SECONDARY,
        )}
      >
        <span>下一步:</span>
        <span className={TEXT_MAIN}>{draft.next_step}</span>
        <span className="mx-1.5">·</span>
        <span>停在哪里:</span>
        <span className="text-pretty">{draft.stop_at}</span>
        <Pencil size={11} className="ml-1 inline-block align-[-1px] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </button>
      {editing && (
        <div
          className="mt-1 space-y-1.5 rounded-lg border border-[#E5E7EB] dark:border-white/[0.08] bg-white dark:bg-white/[0.04] p-2.5"
          data-testid="my-day-card-editor"
        >
          <p className={cn('text-[12px] leading-relaxed text-pretty', TEXT_SECONDARY)}>
            <span className="mr-1">理由:</span>{draft.reason}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className={cn('text-[11px]', TEXT_SECONDARY)}>下一步行动</span>
              <textarea
                value={draft.next_step}
                onChange={(e) => onEdit({ next_step: e.target.value })}
                rows={2}
                maxLength={300}
                className={cn(FIELD, TEXT_MAIN)}
                data-testid="my-day-next-step-input"
              />
            </label>
            <label className="block min-w-0">
              <span className={cn('text-[11px]', TEXT_SECONDARY)}>本次停止标准</span>
              <textarea
                value={draft.stop_at}
                onChange={(e) => onEdit({ stop_at: e.target.value })}
                rows={2}
                maxLength={300}
                className={cn(FIELD, TEXT_MAIN)}
                data-testid="my-day-stop-at-input"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => setEditing(false)} className={QUIET_BUTTON}>
              收起
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
