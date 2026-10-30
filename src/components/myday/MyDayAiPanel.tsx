import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, Check, Loader2, Sparkles, Tag as TagIcon, X,
} from 'lucide-react';
import type { TagWithCount } from '../../types/tag';
import { useTags } from '../../hooks/useTags';
import { useAiDefaultModel } from '../../hooks/useAiModels';
import { getRepositories } from '../../domain/repositories/current';
import { isAiError } from '../../domain/models/ai';
import { useMyDayPlanStore } from '../../stores/myDayPlanStore';
import { useElapsedSeconds } from '../ai/useElapsedSeconds';
import { MyDayActionCard } from './MyDayActionCard';
import { queryKeys, invalidateMyDayPlan, invalidateTasks } from '../../lib/queryKeys';
import { cn } from '../../lib/cn';

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
  const [progressText, setProgressText] = useState('');
  const [generatedChars, setGeneratedChars] = useState(0);
  const [adopting, setAdopting] = useState(false);
  const [showOmitted, setShowOmitted] = useState(false);

  const preparing = session?.status === 'preparing';
  const generating = session?.status === 'generating';
  const done = session?.status === 'done';
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
          if (event.payload.delta) {
            setProgressText((prev) => (prev + event.payload.delta!).slice(-300));
            setGeneratedChars((c) => c + event.payload.delta!.length);
          }
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
    setProgressText('');
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
        toast.error(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setAdopting(false);
    }
  }, [today, queryClient]);

  // ---- 未配置模型:不发请求,提供配置入口 ----
  if (defaultModel !== undefined && defaultModel === null) {
    return (
      <div className="rounded-lg border border-dashed border-[#E5E7EB] dark:border-white/10 px-3 py-3 space-y-1.5" data-testid="my-day-ai-no-model">
        <div className="flex items-center gap-1.5 text-[11px] text-[#6B7280]">
          <Sparkles size={12} className="text-[#7C72F6]" />
          AI 建议需要先配置默认模型;规则推荐不受影响,随时可用。
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="text-[11px] px-2 py-1 rounded-md bg-[#7C72F6]/10 text-[#7C72F6] hover:bg-[#7C72F6]/20 font-medium"
        >
          去设置 → AI 模型
        </button>
      </div>
    );
  }

  const candidates = session?.preview?.candidates ?? [];

  return (
    <div className="rounded-xl border border-[#7C72F6]/25 bg-[#FAFAFF] dark:bg-white/[0.03] p-3 space-y-2.5" data-testid="my-day-ai-panel">
      {/* 范围与候选 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#111827] dark:text-white/90">
          <Sparkles size={12} className="text-[#7C72F6]" />
          AI 今日行动建议
          <span className="text-[10px] text-[#9CA3AF] font-normal">从任务池准备候选,点击生成才调用模型</span>
        </div>

        {flatTags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <TagIcon size={11} className="text-[#9CA3AF]" />
            <button
              onClick={() => setSelectedTagIds([])}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full transition-colors',
                selectedTagIds.length === 0
                  ? 'bg-[#7C72F6]/15 text-[#7C72F6] font-medium'
                  : 'text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]',
              )}
            >
              全部可执行
            </button>
            {flatTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full transition-colors',
                  selectedTagIds.includes(tag.id)
                    ? 'bg-[#7C72F6]/15 text-[#7C72F6] font-medium'
                    : 'text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]',
                )}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}

        {preparing ? (
          <div className="flex items-center gap-1.5 text-[11px] text-[#6B7280] py-1">
            <Loader2 size={12} className="animate-spin text-[#7C72F6]" />正在准备候选…
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-[11px] text-[#6B7280] py-1">
            {failed && session?.error
              ? session.error
              : '当前范围没有可执行候选;可清空标签恢复全部范围,或先创建任务。'}
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="text-[10px] text-[#9CA3AF]">
              候选 {session!.preview!.used_count} 项
              {session!.preview!.omitted_count > 0 && ` · 范围内共 ${session!.preview!.eligible_total} 项,未带入 ${session!.preview!.omitted_count} 项`}
              (发送给模型的只有这些候选的摘要)
            </div>
            <div className="max-h-36 overflow-y-auto space-y-0.5 pr-0.5">
              {candidates.map((c) => {
                const isMandatory = session?.mandatory.includes(c.task_id);
                const isExcluded = session?.excluded.includes(c.task_id);
                const hasSubtaskChoices = c.subtasks.length + c.omitted_subtask_details.length > 0;
                return (
                  <div
                    key={c.task_id}
                    className={cn(
                      'px-2 py-1 rounded-lg text-[11px] space-y-0.5',
                      isExcluded
                        ? 'bg-[#EF4444]/6 text-[#9CA3AF] line-through'
                        : 'bg-white/70 dark:bg-white/[0.03] text-[#374151] dark:text-white/70',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {c.group === 'manual' && (
                        <button
                          onClick={() => void useMyDayPlanStore.getState().removeManualTask(today, c.task_id)}
                          disabled={generating || preparing}
                          className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[#10B981]/12 text-[#10B981] font-medium hover:bg-[#10B981]/20 disabled:opacity-40"
                          title="撤销手动补入"
                        >
                          补入 ×
                        </button>
                      )}
                      <span className="flex-1 truncate">{c.title}</span>
                      {c.due_date && <span className="text-[10px] text-amber-500 shrink-0">{c.due_date.slice(0, 10)}</span>}
                      {c.already_in_my_day && <span className="text-[10px] text-amber-500 shrink-0">已加入</span>}
                      {c.truncated_desc && <span className="text-[10px] text-[#9CA3AF] shrink-0" title="说明超长已截断">截断</span>}
                      <button
                        onClick={() => useMyDayPlanStore.getState().toggleMandatory(today, c.task_id)}
                        disabled={generating}
                        className={cn(
                          'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full transition-colors disabled:opacity-40',
                          isMandatory ? 'bg-[#F59E0B]/15 text-[#F59E0B] font-medium' : 'text-[#9CA3AF] hover:text-[#F59E0B]',
                        )}
                      >
                        必做
                      </button>
                      <button
                        onClick={() => useMyDayPlanStore.getState().toggleExcluded(today, c.task_id)}
                        disabled={generating}
                        className={cn(
                          'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full transition-colors disabled:opacity-40',
                          isExcluded ? 'bg-[#EF4444]/10 text-[#EF4444] font-medium' : 'text-[#9CA3AF] hover:text-[#EF4444]',
                        )}
                      >
                        排除
                      </button>
                    </div>
                    {/* 子任务纳入替换:纳入的可移出,未纳入的可补入(每次至多 5 项) */}
                    {hasSubtaskChoices && (
                      <div className="flex items-center gap-1 flex-wrap pl-0.5">
                        <span className="text-[10px] text-[#9CA3AF] shrink-0">子任务</span>
                        {c.subtasks.map((s) => (
                          <button
                            key={s.subtask_id}
                            onClick={() => void useMyDayPlanStore.getState().toggleSubtaskPick(today, c.task_id, s.subtask_id)}
                            disabled={generating || preparing}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#7C72F6]/12 text-[#7C72F6] hover:bg-[#7C72F6]/25 disabled:opacity-40 truncate max-w-[30%]"
                            title="移出本次纳入的子任务"
                          >
                            {s.title}
                          </button>
                        ))}
                        {c.omitted_subtask_details.map((s) => (
                          <button
                            key={s.subtask_id}
                            onClick={() => void useMyDayPlanStore.getState().toggleSubtaskPick(today, c.task_id, s.subtask_id)}
                            disabled={generating || preparing}
                            className="text-[10px] px-1.5 py-0.5 rounded-full text-[#9CA3AF] hover:text-[#7C72F6] hover:bg-[#7C72F6]/10 disabled:opacity-40 truncate max-w-[30%]"
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
            </div>
            {/* 范围内合格但受上限未带入的任务:可手动补入,不能用补入绕过状态与范围检查 */}
            {(session?.preview?.omitted_candidates?.length ?? 0) > 0 && (
              <div className="pt-0.5" data-testid="my-day-omitted-candidates">
                <button
                  onClick={() => setShowOmitted((v) => !v)}
                  className="text-[10px] text-[#9CA3AF] hover:text-[#6B7280]"
                >
                  {showOmitted ? '收起' : '展开'}范围内还有 {session!.preview!.omitted_candidates.length} 项未带入
                </button>
                {showOmitted && (
                  <div className="mt-0.5 space-y-0.5">
                    {session!.preview!.omitted_candidates.map((o) => (
                      <div key={o.task_id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] bg-[#F9FAFB] dark:bg-white/[0.02] text-[#6B7280]">
                        <span className="flex-1 truncate">{o.title}</span>
                        {o.due_date && <span className="text-[10px] text-[#9CA3AF] shrink-0">{o.due_date.slice(0, 10)}</span>}
                        <button
                          onClick={() => void useMyDayPlanStore.getState().addManualTask(today, o.task_id)}
                          disabled={generating || preparing}
                          className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full text-[#10B981] hover:bg-[#10B981]/10 disabled:opacity-40"
                        >
                          补入
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 今日重点与项数 */}
      <div className="flex items-start gap-2">
        <textarea
          value={session?.focusNote ?? ''}
          onChange={(e) => useMyDayPlanStore.getState().setFocusNote(today, e.target.value)}
          placeholder="今天想推进什么?(可选,300 字内)"
          rows={2}
          maxLength={300}
          className="flex-1 rounded-md border border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-white/[0.04] px-2 py-1.5 text-[11px] text-[#111827] dark:text-white/90 resize-none focus:outline-none focus:border-[#7C72F6]/50"
          data-testid="my-day-focus-note"
        />
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-[10px] text-[#9CA3AF]">推荐项数</span>
          <div className="flex rounded-md border border-[#E5E7EB] dark:border-white/10 overflow-hidden">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => useMyDayPlanStore.getState().setTargetCount(today, n)}
                disabled={generating}
                className={cn(
                  'w-6 h-6 text-[11px] transition-colors disabled:opacity-40',
                  (session?.targetCount ?? 3) === n
                    ? 'bg-[#7C72F6] text-white'
                    : 'text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 生成/进度/取消 */}
      {generating ? (
        <div className="flex items-center gap-2">
          <Loader2 size={13} className="animate-spin text-[#7C72F6] shrink-0" />
          <span className="text-[11px] text-[#6B7280] flex-1 truncate">
            生成中 · 已等待 {elapsed} 秒 · 已生成 {generatedChars} 字
            {progressText && <span className="ml-1 text-[#9CA3AF]" title={progressText.slice(-120)}>…</span>}
          </span>
          <button
            onClick={cancel}
            className="shrink-0 flex items-center gap-0.5 text-[10px] px-2 py-1 rounded-md text-[#EF4444] hover:bg-[#EF4444]/8"
          >
            <X size={11} />取消
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={generate}
            disabled={preparing || candidates.length === 0 || adopting}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md bg-[#7C72F6] text-white hover:bg-[#6C63E0] disabled:opacity-40 font-medium transition-colors"
            data-testid="my-day-generate-button"
          >
            <Sparkles size={12} />
            {done ? '重新生成' : '生成建议'}
          </button>
          {failed && session?.error && (
            <span className="flex items-center gap-1 text-[10px] text-[#EF4444] min-w-0">
              <AlertTriangle size={11} className="shrink-0" />
              <span className="truncate">{session.error}</span>
            </span>
          )}
        </div>
      )}

      {/* 结果:假设 + 行动卡 + 取舍 */}
      {(done || generating) && session && session.drafts.length > 0 && (
        <div className="space-y-2 border-t border-[#E5E7EB] dark:border-white/10 pt-2" data-testid="my-day-proposal">
          {session.assumptions.length > 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-2 py-1.5">
              <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-0.5">模型假设(待确认,非已确认事实)</div>
              <ul className="text-[10px] text-amber-700/90 dark:text-amber-300/80 list-disc list-inside space-y-0.5">
                {session.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-1.5">
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
          {session.notSelected.length > 0 && (
            <div className="text-[10px] text-[#9CA3AF]">
              未选入本轮重点(仍在原清单,今天不做不是事实判断):
              {session.notSelected.map((n) => ` ${n.title}`).join(' ·')}
            </div>
          )}

          {/* 采纳摘要 */}
          {done && (
            <div className="rounded-md bg-white dark:bg-white/[0.04] border border-[#E5E7EB] dark:border-white/10 px-2 py-1.5 space-y-1" data-testid="my-day-adopt-summary">
              <div className="text-[10px] text-[#374151] dark:text-white/80">
                本轮重点 {selectedDrafts.length} 项:新增 {newIds} 项、已在今日 {keptIds} 项
                {uncoveredListCount > 0 && `;原有清单另有 ${uncoveredListCount} 项不在本轮重点`}
              </div>
              {replacedOut.length > 0 && (
                <div className="text-[10px] text-[#9CA3AF]">
                  将移出重点(仍保留在今日清单):{replacedOut.map((a) => a.root_title ?? a.root_task_id).join(' ·')}
                </div>
              )}
              {unselectedMandatory.length > 0 && (
                <div className="text-[10px] text-[#F59E0B]">
                  曾标记必做但未选中:{unselectedMandatory.map((d) => d.root_title).join(' ·')}(以你的最终选择为准)
                </div>
              )}
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  onClick={adopt}
                  disabled={adopting || selectedDrafts.length === 0}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-[#7C72F6] text-white hover:bg-[#6C63E0] disabled:opacity-40 font-medium"
                  data-testid="my-day-adopt-button"
                >
                  {adopting ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />}
                  采纳为今日重点
                </button>
                <span className="text-[10px] text-[#9CA3AF]">只添加今日归属,不改截止日期与排序</span>
              </div>
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
