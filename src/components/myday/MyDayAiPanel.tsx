import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, Info, Loader2, RefreshCw, Sparkles, Tag as TagIcon, X,
} from 'lucide-react';
import type { TagWithCount } from '../../types/tag';
import { useTags } from '../../hooks/useTags';
import { useAiDefaultModel } from '../../hooks/useAiModels';
import { getRepositories } from '../../domain/repositories/current';
import { isAiError } from '../../domain/models/ai';
import { errMessage } from '../../lib/errMessage';
import { useMyDayPlanStore } from '../../stores/myDayPlanStore';
import { useElapsedSeconds } from '../ai/useElapsedSeconds';
import { MyDayActionCard } from './MyDayActionCard';
import { queryKeys, invalidateMyDayPlan, invalidateTasks } from '../../lib/queryKeys';
import { cn } from '../../lib/cn';

// 文字只分两档,次要的一档在各主题下对比度也不低于 4.5:1;不再有更暗的灰
const TEXT_MAIN = 'text-[#111827] dark:text-white/90';
const TEXT_SECONDARY = 'text-[#374151] dark:text-white/80';
// 选中态用中性浅底 + 主文字色:强调色文字在浅色和玻璃主题下对比度不足
const CHIP_SELECTED = 'bg-[#E5E7EB] dark:bg-white/10 text-[#111827] dark:text-white/90 font-medium';
const CHIP_OUTLINE = 'border border-[#E5E7EB] dark:border-white/10 text-[#374151] dark:text-white/80 hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08]';
const CHIP_QUIET = 'text-[#374151] dark:text-white/80 hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08]';
const CHIP_ACTIVE_WARNING = 'border border-transparent bg-amber-500/20 text-[#111827] dark:text-white/90 font-medium';
const CHIP_ACTIVE_DANGER = 'border border-transparent bg-[#EF4444]/15 text-[#111827] dark:text-white/90 font-medium';
const CHIP = 'shrink-0 text-[11px] px-2 py-0.5 rounded-full transition-colors';
// 带图标的胶囊需要弹性排版,纯文字的保持行内块才能截断长标题
const CHIP_ICON = 'inline-flex items-center gap-0.5';
// 行内操作平时不占宽度:鼠标悬停或键盘聚焦到这一行时才从标记右侧展开;被标记的行常驻
const ROW_ACTIONS_HIDDEN =
  'w-0 opacity-0 overflow-hidden group-hover:w-auto group-hover:overflow-visible group-hover:opacity-100 group-focus-within:w-auto group-focus-within:overflow-visible group-focus-within:opacity-100';
const ROW_ACTIONS_SHOWN = 'w-auto opacity-100';
const GHOST_BUTTON = 'inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-lg border border-[#E5E7EB] dark:border-white/10 text-[#374151] dark:text-white/80 hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed';
const PRIMARY_BUTTON = 'inline-flex items-center gap-1 text-[12px] px-3.5 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed font-medium';
const DISCLOSURE = 'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md transition-colors text-[#374151] dark:text-white/80 hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08]';
// 候选默认露出的行数,其余收在「展开其余 N 项」后面(与规则推荐一致)
const CANDIDATE_COLLAPSED_COUNT = 6;

/**
 * 「我的一天」AI 建议面板 = myDayPlanStore 会话的视图。
 * 规则推荐是页面里的独立路径;本面板只在用户切换到 AI 模式时出现,
 * 未配置模型时不发请求、只给配置入口。首次打开仅准备本机候选,不自动调用模型。
 */
export function MyDayAiPanel({ today, myDayIds }: { today: string; myDayIds: Set<string> }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: defaultModel } = useAiDefaultModel();
  const { data: tags } = useTags();
  const session = useMyDayPlanStore((s) => s.sessions[today]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [generatedChars, setGeneratedChars] = useState(0);
  const [adopting, setAdopting] = useState(false);
  const [showOmitted, setShowOmitted] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [focusedRow, setFocusedRow] = useState<string | null>(null);
  // 放在面板级而不是行内:点子任务胶囊会重新准备候选,行内的状态会被冲掉
  const [openSubtasks, setOpenSubtasks] = useState<Set<string>>(() => new Set());

  const preparing = session?.status === 'preparing';
  const generating = session?.status === 'generating';
  const failed = session?.status === 'error';
  const elapsed = useElapsedSeconds(generating, session?.startedAt);

  const flatTags = useMemo(() => flattenTags(tags ?? []), [tags]);
  const scopeKey = useMemo(() => [...selectedTagIds].sort().join(','), [selectedTagIds]);

  // 准备候选:面板打开或范围变化时;同范围重挂载(模式切回)不重复准备,保留会话
  useEffect(() => {
    const preparedKey = session?.preview ? [...session.preparedTagIds].sort().join(',') : null;
    if (preparedKey === scopeKey) return;
    void useMyDayPlanStore.getState().prepare(today, { tagIds: selectedTagIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, scopeKey]);

  // 流式进度:按会话 requestId 过滤
  useEffect(() => {
    if (!generating || !session?.requestId) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<{ request_id: string; delta?: string }>('ai-request-progress', (event) => {
          if (cancelled) return;
          if (event.payload.request_id !== session.requestId) return;
          if (event.payload.delta) setGeneratedChars((c) => c + event.payload.delta!.length);
        });
        if (cancelled) fn();
        else unlisten = fn;
      } catch {
        // 测试/Web 环境无事件,静默
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [generating, session?.requestId]);

  const generate = useCallback(async () => {
    setGeneratedChars(0);
    await useMyDayPlanStore.getState().generate(today);
  }, [today]);

  const cancel = async () => {
    if (!session?.requestId) return;
    // 乐观置为已取消(与润色面板同一语义)
    useMyDayPlanStore.setState((s) =>
      s.sessions[today]
        ? { sessions: { ...s.sessions, [today]: { ...s.sessions[today], status: 'error', error: '已取消' } } }
        : s,
    );
    try {
      await getRepositories().ai.cancelRequest(session.requestId);
    } catch {
      // 取消失败不阻塞
    }
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const toggleSubtasks = (taskId: string) => {
    setOpenSubtasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const selectedDrafts = useMemo(
    () => (session?.drafts ?? []).filter((d) => d.selected),
    [session?.drafts],
  );
  const newIds = selectedDrafts.filter((d) => !d.already_in_my_day).length;
  const keptIds = selectedDrafts.filter((d) => d.already_in_my_day).length;
  const uncoveredListCount = useMemo(() => {
    const selectedIds = new Set(selectedDrafts.map((d) => d.root_task_id));
    return [...myDayIds].filter((id) => !selectedIds.has(id)).length;
  }, [myDayIds, selectedDrafts]);
  const unselectedMandatory = session?.drafts.filter((d) => d.was_mandatory && !d.selected) ?? [];

  const { data: currentPlan } = useQuery({
    queryKey: queryKeys.myDayPlan.detail(today),
    queryFn: () => getRepositories().ai.getMyDayPlan(today),
  });
  const replacedOut = useMemo(() => {
    if (!currentPlan?.actions?.length || !selectedDrafts.length) return [];
    const selectedRootIds = new Set(selectedDrafts.map((d) => d.root_task_id));
    return currentPlan.actions.filter((a) => !selectedRootIds.has(a.root_task_id));
  }, [currentPlan, selectedDrafts]);

  const adopt = useCallback(async () => {
    const sess = useMyDayPlanStore.getState().sessions[today];
    if (!sess?.proposalId) return;
    const actions = sess.drafts
      .filter((d) => d.selected && d.next_step.trim() && d.stop_at.trim())
      .map((d) => ({
        root_task_id: d.root_task_id,
        target_subtask_id: d.target_subtask_id,
        reason: d.reason,
        next_step: d.next_step.trim(),
        stop_at: d.stop_at.trim(),
      }));
    if (actions.length === 0) {
      toast.error('请至少选择一项,并填写下一步与停止标准');
      return;
    }
    setAdopting(true);
    try {
      const result = await getRepositories().ai.applyMyDayPlan({
        proposalId: sess.proposalId,
        operationId: sess.operationId,
        actions,
        expectedRevision: sess.baseRevision,
      });
      // 成功后以重新读取为准;清空会话(失败/冲突路径不清,保留预览供重试)
      invalidateTasks(queryClient);
      invalidateMyDayPlan(queryClient, today);
      useMyDayPlanStore.getState().clear(today);
      toast.success(
        result.already_applied
          ? '本次采纳此前已生效'
          : `已设为今日重点:新增 ${result.added_task_ids.length} 项,已在今日 ${actions.length - result.added_task_ids.length} 项`,
      );
    } catch (e) {
      if (isAiError(e) && (e.code === 'context_changed' || e.code === 'apply_conflict')) {
        // 预览过期/内容变化:保留预览,提示重新生成
        toast.error(`${e.message}(预览已保留,可重新生成)`);
      } else {
        toast.error(errMessage(e));
      }
    } finally {
      setAdopting(false);
    }
  }, [today, queryClient]);

  const preview = session?.preview;
  const candidates = useMemo(() => preview?.candidates ?? [], [preview]);
  const omittedCandidates = useMemo(() => preview?.omitted_candidates ?? [], [preview]);
  const scopeLabel = useMemo(() => {
    const names = selectedTagIds.map((id) => flatTags.find((t) => t.id === id)?.name).filter(Boolean);
    if (names.length === 0) return '全部可执行';
    return names.length > 2 ? `${names.slice(0, 2).join('、')} 等 ${names.length} 个` : names.join('、');
  }, [selectedTagIds, flatTags]);

  // ---- 未配置模型:不发请求,提供配置入口 ----
  if (defaultModel !== undefined && defaultModel === null) {
    return (
      <div
        className="rounded-xl border border-dashed border-[#E5E7EB] dark:border-white/[0.08] px-3 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5"
        data-testid="my-day-ai-no-model"
      >
        <div className={cn('flex items-center gap-1.5 text-[12px] flex-1 min-w-[240px]', TEXT_SECONDARY)}>
          <Sparkles size={12} className="text-[#7C72F6] shrink-0" />
          还没有配置默认模型;规则推荐不受影响,随时可用。
        </div>
        <button onClick={() => navigate('/settings')} className={PRIMARY_BUTTON}>
          去设置 → AI 模型
        </button>
      </div>
    );
  }

  // 还留着有效的建议就按「有结果」来排:生成完成、生成中都算;重新生成失败或取消后,上一次的建议也仍然可以采纳
  // (后端只在重新准备、生成成功、采纳成功时才作废它)
  const draftCount = session?.drafts.length ?? 0;
  const hasResult = draftCount > 0;
  const setupVisible = !hasResult || setupOpen;
  const noteVisible = !hasResult || setupOpen;
  const visibleCandidates = listExpanded ? candidates : candidates.slice(0, CANDIDATE_COLLAPSED_COUNT);
  const mandatoryCount = candidates.filter((c) => session?.mandatory.includes(c.task_id)).length;
  const excludedCount = candidates.filter((c) => session?.excluded.includes(c.task_id)).length;
  // 选了标签却没有候选:标签行直接展开,方便恢复全部(规格要求)
  const scopeEmpty = selectedTagIds.length > 0 && !preparing && !!preview && candidates.length === 0;
  const scopeChipsVisible = scopeOpen || scopeEmpty;
  const targetCount = session?.targetCount ?? 3;
  const progress = (
    <div className="flex flex-wrap items-center gap-2" data-testid="my-day-progress">
      <span className={cn('inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap', TEXT_SECONDARY)}>
        <Loader2 size={13} className="animate-spin text-[#7C72F6]" />
        生成中 · 已等待 {elapsed} 秒 · 已生成 {generatedChars} 字
      </span>
      <button type="button" onClick={cancel} className={cn('inline-flex items-center gap-0.5 text-[11px] px-2 py-1 rounded-lg', CHIP_QUIET)}>
        <X size={11} />取消
      </button>
    </div>
  );

  return (
    <div
      className="rounded-xl border border-[#E5E7EB] dark:border-white/[0.08] bg-[#FAFAFF] dark:bg-white/[0.03] p-3 space-y-2.5"
      data-testid="my-day-ai-panel"
    >
      {/* 头部:标题 + 两个按需展开的调整项 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className={cn('flex items-center gap-1.5 text-[13px] font-semibold', TEXT_MAIN)}>
          <Sparkles size={13} className="text-[#7C72F6] shrink-0" />
          AI 今日行动建议
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          {flatTags.length > 0 && (
            <button
              type="button"
              onClick={() => setScopeOpen((v) => !v)}
              aria-expanded={scopeChipsVisible}
              data-testid="my-day-scope-toggle"
              className={DISCLOSURE}
            >
              范围:{scopeLabel}
              <ChevronDown size={12} className={cn('transition-transform', scopeChipsVisible && 'rotate-180')} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCountOpen((v) => !v)}
            aria-expanded={countOpen}
            data-testid="my-day-count-toggle"
            className={DISCLOSURE}
          >
            推荐 {targetCount} 项
            <ChevronDown size={12} className={cn('transition-transform', countOpen && 'rotate-180')} />
          </button>
          {hasResult && preview && (
            <button
              type="button"
              onClick={() => setSetupOpen((v) => !v)}
              aria-expanded={setupOpen}
              data-testid="my-day-candidates-toggle"
              className={DISCLOSURE}
            >
              候选清单 {preview.used_count} 项
              <ChevronDown size={12} className={cn('transition-transform', setupOpen && 'rotate-180')} />
            </button>
          )}
          {hasResult && !generating && (
            <button
              type="button"
              onClick={generate}
              disabled={preparing || candidates.length === 0 || adopting}
              className={GHOST_BUTTON}
              data-testid="my-day-generate-button"
            >
              <RefreshCw size={12} />
              重新生成
            </button>
          )}
        </div>
      </div>

      {scopeChipsVisible && (
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="候选范围" data-testid="my-day-scope-chips">
          <TagIcon size={11} className={cn('shrink-0', TEXT_SECONDARY)} />
          <button
            type="button"
            onClick={() => setSelectedTagIds([])}
            aria-pressed={selectedTagIds.length === 0}
            className={cn(CHIP, CHIP_ICON, selectedTagIds.length === 0 ? cn(CHIP_SELECTED, 'border border-transparent') : CHIP_OUTLINE)}
          >
            {selectedTagIds.length === 0 && <Check size={10} />}
            全部可执行
          </button>
          {flatTags.map((tag) => {
            const on = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                aria-pressed={on}
                className={cn(CHIP, CHIP_ICON, on ? cn(CHIP_SELECTED, 'border border-transparent') : CHIP_OUTLINE)}
              >
                {on && <Check size={10} />}
                {tag.name}
              </button>
            );
          })}
        </div>
      )}

      {countOpen && (
        <div className="flex items-center gap-2 text-[11px]" data-testid="my-day-count-control">
          <span className={TEXT_SECONDARY}>每次推荐</span>
          <div role="group" aria-label="推荐项数" className="flex rounded-md border border-[#E5E7EB] dark:border-white/10 overflow-hidden">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => useMyDayPlanStore.getState().setTargetCount(today, n)}
                disabled={generating}
                aria-pressed={targetCount === n}
                className={cn('w-7 h-6 text-[12px] transition-colors disabled:opacity-40', targetCount === n ? CHIP_SELECTED : CHIP_QUIET)}
              >
                {n}
              </button>
            ))}
          </div>
          <span className={TEXT_SECONDARY}>项</span>
        </div>
      )}

      {/* 候选:清单、数量、遗漏与截断说明在生成前必须可见;有结果时收起,点「候选清单」才展开 */}
      {setupVisible && (preparing && !preview ? (
        <div className={cn('flex items-center gap-1.5 text-[12px] py-1', TEXT_SECONDARY)}>
          <Loader2 size={12} className="animate-spin text-[#7C72F6]" />正在准备候选…
        </div>
      ) : !preview ? (
        failed && session?.error ? (
          <div className="flex items-start gap-1.5 rounded-lg bg-[#FEF2F2] dark:bg-red-950/20 px-3 py-2 text-[12px]">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[#EF4444]" />
            <span className={TEXT_MAIN}>{session.error}</span>
          </div>
        ) : null
      ) : candidates.length === 0 ? (
        <div className={cn('flex flex-wrap items-center gap-x-2 text-[12px] py-1', TEXT_SECONDARY)}>
          {scopeEmpty ? (
            <>
              这个范围内没有可执行候选。
              <button type="button" onClick={() => setSelectedTagIds([])} className={cn(CHIP, CHIP_OUTLINE)}>
                恢复全部可执行
              </button>
            </>
          ) : (
            '当前没有可执行候选;可以先创建任务。'
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          <div className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]', TEXT_SECONDARY)}>
            <span>候选 {preview.used_count} 项</span>
            {omittedCandidates.length > 0 && (
              <span data-testid="my-day-omitted-candidates">
                <button
                  type="button"
                  onClick={() => setShowOmitted((v) => !v)}
                  aria-expanded={showOmitted}
                  className="inline-flex items-center gap-0.5 hover:underline"
                >
                  · 范围内还有 {omittedCandidates.length} 项未带入
                  <ChevronDown size={11} className={cn('transition-transform', showOmitted && 'rotate-180')} />
                </button>
              </span>
            )}
            <button
              type="button"
              aria-label="只发送这些候选的摘要(标题、说明文本、纳入的子任务)和你填写的今日重点;不含图片、附件和链接。"
              title="只发送这些候选的摘要(标题、说明文本、纳入的子任务)和你填写的今日重点;不含图片、附件和链接。"
              className="inline-flex cursor-help"
            >
              <Info size={11} />
            </button>
            {preparing && (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" />更新中
              </span>
            )}
            {/* 标记汇总:折叠起来的行里也有标记时,靠它看到 */}
            {mandatoryCount > 0 && (
              <button type="button" onClick={() => setListExpanded(true)} className="hover:underline">
                · 必做 {mandatoryCount}
              </button>
            )}
            {excludedCount > 0 && (
              <button type="button" onClick={() => setListExpanded(true)} className="hover:underline">
                · 排除 {excludedCount}
              </button>
            )}
          </div>

          {visibleCandidates.map((c) => {
            const isMandatory = session?.mandatory.includes(c.task_id);
            const isExcluded = session?.excluded.includes(c.task_id);
            const subtaskTotal = c.subtasks.length + c.omitted_subtask_details.length;
            const hasSubtaskChoices = subtaskTotal > 0;
            const subtasksOpen = openSubtasks.has(c.task_id);
            const actionsVisible = isMandatory || isExcluded || hoveredRow === c.task_id || focusedRow === c.task_id;
            return (
              <div
                key={c.task_id}
                data-testid="my-day-candidate"
                className="group rounded-lg px-2 py-1 transition-colors hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]"
                onMouseEnter={() => setHoveredRow(c.task_id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <div className="flex items-center gap-2 min-w-0 min-h-5">
                  <span className={cn('min-w-[80px] truncate text-[12px]', isExcluded ? TEXT_SECONDARY : TEXT_MAIN, isExcluded && 'line-through')}>
                    {c.title}
                  </span>
                  {c.due_date && (
                    <span className={cn('shrink-0 text-[11px] tabular-nums', TEXT_SECONDARY)}>{c.due_date.slice(0, 10)}</span>
                  )}
                  {c.already_in_my_day && <span className={cn(CHIP, CHIP_SELECTED)} title="已在今日清单里">已加入</span>}
                  {c.truncated_desc && <span className={cn(CHIP, CHIP_SELECTED)} title="说明超长,发送时已截断">截断</span>}
                  {c.group === 'manual' && (
                    <button
                      type="button"
                      onClick={() => void useMyDayPlanStore.getState().removeManualTask(today, c.task_id)}
                      disabled={generating || preparing}
                      className={cn(CHIP, CHIP_OUTLINE, 'disabled:opacity-40')}
                      title="撤销手动补入"
                    >
                      补入 ×
                    </button>
                  )}
                  <div
                    data-testid="my-day-row-actions"
                    onFocusCapture={() => setFocusedRow(c.task_id)}
                    onBlurCapture={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusedRow(null);
                    }}
                    className={cn(
                      'flex items-center gap-0.5 shrink-0 transition-opacity duration-150',
                      actionsVisible ? ROW_ACTIONS_SHOWN : ROW_ACTIONS_HIDDEN,
                    )}
                  >
                    {hasSubtaskChoices && (
                      <button
                        type="button"
                        onClick={() => toggleSubtasks(c.task_id)}
                        disabled={generating || preparing}
                        aria-expanded={subtasksOpen}
                        className={cn(CHIP, CHIP_ICON, CHIP_OUTLINE, 'py-px', 'disabled:opacity-40')}
                      >
                        子任务 {c.subtasks.length}/{subtaskTotal}
                        <ChevronDown size={11} className={cn('transition-transform', subtasksOpen && 'rotate-180')} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => useMyDayPlanStore.getState().toggleMandatory(today, c.task_id)}
                      disabled={generating}
                      aria-pressed={isMandatory}
                      tabIndex={hasSubtaskChoices && !actionsVisible ? -1 : 0}
                      className={cn(CHIP, isMandatory ? CHIP_ACTIVE_WARNING : CHIP_OUTLINE, 'py-px')}
                    >
                      必做
                    </button>
                    <button
                      type="button"
                      onClick={() => useMyDayPlanStore.getState().toggleExcluded(today, c.task_id)}
                      disabled={generating}
                      aria-pressed={isExcluded}
                      tabIndex={actionsVisible ? 0 : -1}
                      className={cn(CHIP, isExcluded ? CHIP_ACTIVE_DANGER : CHIP_OUTLINE, 'py-px')}
                    >
                      排除
                    </button>
                  </div>
                  </div>
                {subtasksOpen && hasSubtaskChoices && (
                  <div className="flex items-center gap-1 flex-wrap pl-0.5 pt-0.5" role="group" aria-label="本次纳入的子任务">
                    {c.subtasks.map((s) => (
                      <button
                        key={s.subtask_id}
                        type="button"
                        onClick={() => void useMyDayPlanStore.getState().toggleSubtaskPick(today, c.task_id, s.subtask_id)}
                        disabled={generating || preparing}
                        className={cn(CHIP, CHIP_SELECTED, 'border border-transparent disabled:opacity-40', 'max-w-[30%] truncate')}
                        title="移出本次纳入的子任务"
                      >
                        {s.title}
                      </button>
                    ))}
                    {c.omitted_subtask_details.map((s) => (
                      <button
                        key={s.subtask_id}
                        type="button"
                        onClick={() => void useMyDayPlanStore.getState().toggleSubtaskPick(today, c.task_id, s.subtask_id)}
                        disabled={generating || preparing}
                        className={cn(CHIP, CHIP_OUTLINE, 'disabled:opacity-40', 'max-w-[30%] truncate')}
                        title="纳入该子任务(替换默认选择)"
                      >
                        + {s.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {candidates.length > CANDIDATE_COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setListExpanded((v) => !v)}
              aria-expanded={listExpanded}
              className={cn('flex items-center gap-0.5 px-2 py-0.5 text-[11px] hover:underline', TEXT_SECONDARY)}
            >
              {listExpanded ? '收起列表' : `展开其余 ${candidates.length - CANDIDATE_COLLAPSED_COUNT} 项`}
              {listExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          )}
          {/* 范围内合格但受上限未带入的任务:可手动补入,不能用补入绕过状态与范围检查 */}
          {showOmitted && omittedCandidates.length > 0 && (
            <div className="px-2 py-1 space-y-0.5" data-testid="my-day-omitted-list">
              <div className={cn('text-[11px]', TEXT_SECONDARY)}>
                范围内共 {preview.eligible_total} 项,带入 {preview.used_count} 项;以下任务不在本次候选里
              </div>
              {omittedCandidates.map((o) => (
                <div key={o.task_id} className="flex items-center gap-2 text-[12px]">
                  <span className={cn('flex-1 min-w-0 truncate', TEXT_SECONDARY)}>{o.title}</span>
                  {o.due_date && (
                    <span className={cn('shrink-0 text-[11px] tabular-nums', TEXT_SECONDARY)}>{o.due_date.slice(0, 10)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void useMyDayPlanStore.getState().addManualTask(today, o.task_id)}
                    disabled={generating || preparing}
                    className={cn(CHIP, CHIP_OUTLINE, 'disabled:opacity-40')}
                  >
                    补入
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 今日重点与生成:输入框和主按钮同一行;有结果时输入框随候选清单一起收起 */}
      {noteVisible && (
        <div className="flex flex-wrap items-end gap-2">
          <textarea
            value={session?.focusNote ?? ''}
            onChange={(e) => useMyDayPlanStore.getState().setFocusNote(today, e.target.value)}
            placeholder="今天想推进什么?(可选)"
            rows={1}
            maxLength={300}
            readOnly={generating}
            className={cn(
              'flex-1 min-w-[200px] field-sizing-content max-h-24 rounded-lg border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/[0.04] px-2.5 py-1.5 text-[12px] resize-none focus:outline-none focus:border-[#7C72F6]',
              // 框架默认的占位色只有文字色的一半,偏暗;这里明确用次要文字色
              'placeholder:text-[#374151] dark:placeholder:text-white/80',
              TEXT_MAIN,
            )}
            data-testid="my-day-focus-note"
          />
          {!hasResult && (generating ? progress : (
            <button
              type="button"
              onClick={generate}
              disabled={preparing || candidates.length === 0 || adopting}
              className={cn(PRIMARY_BUTTON, 'shrink-0')}
              data-testid="my-day-generate-button"
            >
              <Sparkles size={12} />
              生成建议
            </button>
          ))}
        </div>
      )}
      {hasResult && generating && progress}
      {!generating && failed && session?.error && (
        <div
          className="flex items-start gap-1.5 rounded-lg bg-[#FEF2F2] dark:bg-red-950/20 px-3 py-2 text-[12px]"
          data-testid="my-day-ai-error"
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[#EF4444]" />
          <span className={TEXT_MAIN}>
            {session.error}
            {hasResult && '(下面仍是上一次生成的建议,可以继续采纳)'}
          </span>
        </div>
      )}

      {/* 结果:一句结果标题 + 紧凑的行动清单在前;采纳栏紧跟在后面,模型假设单列在两者之间,取舍说明放在最后 */}
      {hasResult && session && (
        <div
          className={cn('space-y-2', setupVisible && 'border-t border-[#E5E7EB] dark:border-white/[0.08] pt-2')}
          data-testid="my-day-proposal"
        >
          <div className="space-y-1">
            <div className={cn('text-[13px] font-semibold', TEXT_MAIN)}>建议今天重点推进这 {draftCount} 件</div>
            <div className="divide-y divide-[#E5E7EB] dark:divide-white/[0.08]">
              {session.drafts.map((draft, index) => (
                <MyDayActionCard
                  key={`${draft.root_task_id}-${index}`}
                  draft={draft}
                  index={index}
                  total={session.drafts.length}
                  busy={generating || adopting}
                  onEdit={(patch) => useMyDayPlanStore.getState().editDraft(today, index, patch)}
                  onToggleSelected={() => useMyDayPlanStore.getState().toggleDraftSelected(today, index)}
                  onMove={(dir) => useMyDayPlanStore.getState().moveDraft(today, index, dir)}
                  onSwapOut={() => void useMyDayPlanStore.getState().swapOut(today, index)}
                />
              ))}
            </div>
          </div>
          {session.assumptions.length > 0 && (
            <div className="space-y-0.5" data-testid="my-day-assumptions">
              {session.assumptions.map((a, i) => (
                <div key={i} className={cn('flex items-start gap-1.5 text-[12px] leading-relaxed', TEXT_SECONDARY)}>
                  <Info size={12} className="mt-0.5 shrink-0 text-amber-500" />
                  <span className="text-pretty">
                    {i === 0 && <span className={cn('mr-1', TEXT_MAIN)}>模型假设(待确认,非已确认事实):</span>}
                    {a}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 采纳摘要:生成中不出现,免得采纳到正在被替换的那一份 */}
          {!generating && (
            <div
              className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5 rounded-lg bg-white dark:bg-white/[0.04] border border-[#E5E7EB] dark:border-white/[0.08] px-3 py-2"
              data-testid="my-day-adopt-summary"
            >
              <div className="flex-1 min-w-[260px] space-y-0.5">
                <div className={cn('text-[12px]', TEXT_MAIN)}>
                  本轮重点 {selectedDrafts.length} 项:新增 {newIds} 项、已在今日 {keptIds} 项
                  {uncoveredListCount > 0 && `;原有清单另有 ${uncoveredListCount} 项不在本轮重点`}
                </div>
                {replacedOut.length > 0 && (
                  <div className={cn('text-[12px]', TEXT_SECONDARY)}>
                    将移出重点(仍保留在今日清单):{replacedOut.map((a) => a.root_title ?? a.root_task_id).join(' ·')}
                  </div>
                )}
                {unselectedMandatory.length > 0 && (
                  <div className="flex items-start gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[12px]">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
                    <span className={TEXT_MAIN}>
                      曾标记必做但未选中:{unselectedMandatory.map((d) => d.root_title).join(' ·')}(以你的最终选择为准)
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={cn('text-[11px]', TEXT_SECONDARY)}>只添加今日归属,不改截止日期与排序</span>
                <button
                  type="button"
                  onClick={adopt}
                  disabled={adopting || selectedDrafts.length === 0}
                  className={cn(PRIMARY_BUTTON, 'shrink-0 text-[13px] px-4 py-2')}
                  data-testid="my-day-adopt-button"
                >
                  {adopting ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
                  采纳为今日重点
                </button>
              </div>
            </div>
          )}
          {session.notSelected.length > 0 && (
            <div className={cn('text-[12px] leading-relaxed text-pretty', TEXT_SECONDARY)}>
              未选入本轮重点(仍在原清单,今天不做不是事实判断):
              {session.notSelected.map((n) => ` ${n.title}`).join(' ·')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function flattenTags(tags: TagWithCount[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const walk = (list: TagWithCount[]) => {
    for (const t of list) {
      out.push({ id: t.id, name: t.name });
      if (t.children?.length) walk(t.children);
    }
  };
  walk(tags);
  return out;
}
