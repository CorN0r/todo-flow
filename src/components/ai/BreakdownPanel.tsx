import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, Check, Loader2, Sparkles, X, RefreshCw, Info,
} from 'lucide-react';
import { getRepositories } from '../../domain/repositories/current';
import { isAiError, type BreakdownItem, type BreakdownProposal } from '../../domain/models/ai';
import { errMessage } from '../../hooks/useAiModels';
import { invalidateTasks, queryKeys } from '../../lib/queryKeys';
import { cn } from '../../lib/cn';

interface DraftItem extends BreakdownItem {
  selected: boolean;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 任务拆解面板:生成 → 预览编辑勾选 → 采纳。
 * - 生成前调用 onBeforeGenerate(等待任务编辑保存完成,失败则中止)
 * - 生成中显示流式进度,可取消;新请求失败保留原有可用预览
 * - 与已有子任务/同批同名的候选默认不勾选并提示
 * - 采纳走独立命令;同一预览生命周期内复用 operationId,超时重试安全
 */
export function BreakdownPanel({
  taskId,
  existingChildTitles,
  onBeforeGenerate,
  onClose,
}: {
  taskId: string;
  existingChildTitles: string[];
  onBeforeGenerate: () => Promise<void>;
  onClose: () => void;
}) {
  useTranslation();
  const queryClient = useQueryClient();

  const [proposal, setProposal] = useState<BreakdownProposal | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [userNote, setUserNote] = useState('');
  const [applying, setApplying] = useState(false);

  const activeRequestIdRef = useRef<string | null>(null);
  // 采纳操作标识:同一预览内保持不变,重复提交/超时重试依赖它幂等
  const operationIdRef = useRef<string>(genId());

  const toDrafts = useCallback((p: BreakdownProposal, existing: string[]): DraftItem[] => {
    const existingLower = new Set(existing.map((t) => t.trim().toLowerCase()));
    const seen = new Set<string>();
    return p.items.map((item) => {
      const key = item.title.trim().toLowerCase();
      const duplicate = existingLower.has(key) || seen.has(key);
      seen.add(key);
      return { ...item, selected: !duplicate };
    });
  }, []);

  const generate = useCallback(
    async (note: string) => {
      setError(null);
      setGenerating(true);
      setProgressText('');
      try {
        await onBeforeGenerate();
      } catch {
        setGenerating(false);
        setError('任务保存失败,请先处理未保存的修改后再拆解');
        return;
      }
      try {
        const result = await getRepositories().ai.generateBreakdown(taskId, note || undefined);
        activeRequestIdRef.current = result.request_id;
        operationIdRef.current = genId();
        setProposal(result);
        setAssumptions(result.assumptions);
        setDrafts(toDrafts(result, existingChildTitles));
      } catch (e) {
        // 新请求失败/取消:保留原有可用预览(不清空 drafts/proposal)
        const msg = isAiError(e) && e.code === 'cancelled' ? '已取消' : errMessage(e);
        setError(msg);
      } finally {
        setGenerating(false);
      }
    },
    [taskId, onBeforeGenerate, toDrafts, existingChildTitles],
  );

  // 流式进度:按 request_id 过滤,只累计自己请求的增量
  useEffect(() => {
    if (!generating) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<{ request_id: string; delta?: string; status?: string }>(
          'ai-request-progress',
          (event) => {
            if (cancelled) return;
            if (event.payload.request_id !== activeRequestIdRef.current) return;
            if (event.payload.delta) {
              setProgressText((prev) => (prev + event.payload.delta!).slice(-400));
            }
          },
        );
        if (cancelled) fn();
        else unlisten = fn;
      } catch {
        // 测试/Web 环境:无事件可用,静默忽略
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [generating]);

  const cancel = useCallback(async () => {
    const id = activeRequestIdRef.current;
    if (id) {
      try {
        await getRepositories().ai.cancelRequest(id);
      } catch {
        // 取消失败不阻塞:后端请求结束后自然清理
      }
    }
  }, []);

  const apply = useCallback(async () => {
    if (!proposal) return;
    const selected = drafts.filter((d) => d.selected).map(({ title, instructions }) => ({ title, instructions }));
    if (selected.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const result = await getRepositories().ai.applyBreakdown(
        proposal.proposal_id,
        operationIdRef.current,
        selected,
      );
      toast.success(result.already_applied ? '本次采纳此前已完成,未重复添加' : `已添加 ${result.created_task_ids.length} 个子任务`);
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
      invalidateTasks(queryClient);
      onClose();
    } catch (e) {
      if (isAiError(e)) {
        if (e.code === 'context_changed') {
          setError(`${e.message}。当前预览仍保留,建议重新生成。`);
        } else if (e.code === 'apply_conflict') {
          setError(e.message);
        } else {
          setError(errMessage(e));
        }
      } else {
        setError(String(e));
      }
    } finally {
      setApplying(false);
    }
  }, [proposal, drafts, queryClient, taskId, onClose]);

  const selectedCount = useMemo(() => drafts.filter((d) => d.selected).length, [drafts]);
  const existingLowerSet = useMemo(() => new Set(existingChildTitles.map((t) => t.trim().toLowerCase())), [existingChildTitles]);

  const duplicateOf = useCallback(
    (title: string, index: number) => {
      const key = title.trim().toLowerCase();
      if (!key) return null;
      if (existingLowerSet.has(key)) return '与已有子任务同名';
      if (drafts.some((d, i) => i !== index && d.title.trim().toLowerCase() === key)) return '与本批其他候选同名';
      return null;
    },
    [existingLowerSet, drafts],
  );

  return (
    <div className="rounded-xl border border-[#7C72F6]/25 bg-[#FAFAFF] dark:bg-white/[0.03] p-3 space-y-3" data-testid="ai-breakdown-panel">
      {/* 头部:模型 + 状态 + 取消/关闭 */}
      <div className="flex items-center gap-2">
        <Sparkles size={13} className="text-[#7C72F6] shrink-0" />
        <span className="text-[12px] font-medium text-[#111827] dark:text-white/90 flex-1 truncate">
          AI 拆解
          {proposal && !generating && <span className="ml-1.5 text-[11px] text-[#9CA3AF] font-normal">{proposal.model_snapshot}</span>}
        </span>
        {generating && (
          <>
            <Loader2 size={13} className="animate-spin text-[#7C72F6]" />
            <button
              onClick={cancel}
              className="text-[11px] px-2 py-0.5 rounded-full text-[#EF4444] hover:bg-[#FEF2F2] dark:hover:bg-red-950/30"
            >
              取消
            </button>
          </>
        )}
        <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#111827] dark:hover:text-white/90">
          <X size={14} />
        </button>
      </div>

      {/* 输入范围说明 */}
      <p className="flex items-start gap-1 text-[11px] text-[#9CA3AF]">
        <Info size={11} className="mt-0.5 shrink-0" />
        仅发送:任务标题、描述文本、现有子任务与你的补充要求;不包含图片、附件或链接。
      </p>

      {/* 补充要求 + 生成 */}
      <div className="flex items-center gap-2">
        <input
          value={userNote}
          onChange={(e) => setUserNote(e.target.value)}
          placeholder="补充要求(可选,一句话)"
          disabled={generating}
          className="flex-1 text-[12px] px-2.5 py-1.5 rounded-lg border border-[#D1D5DB] dark:border-white/[0.10] bg-transparent outline-none focus:border-[#7C72F6] text-[#111827] dark:text-white/90 disabled:opacity-50"
        />
        <button
          onClick={() => generate(userNote)}
          disabled={generating}
          className="shrink-0 inline-flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-50"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : proposal ? <RefreshCw size={12} /> : <Sparkles size={12} />}
          {proposal ? '重新生成' : '生成'}
        </button>
      </div>

      {/* 生成中进度 */}
      {generating && (
        <div className="rounded-lg bg-[#F3F4F6] dark:bg-white/[0.04] px-3 py-2 text-[11px] text-[#6B7280] font-mono break-all max-h-20 overflow-hidden">
          {progressText || '正在生成…'}
        </div>
      )}

      {/* 错误:保留原预览 */}
      {error && (
        <div className="flex items-start gap-1.5 rounded-lg bg-[#FEF2F2] dark:bg-red-950/20 px-3 py-2 text-[12px] text-[#EF4444]" data-testid="ai-breakdown-error">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 假设 */}
      {assumptions.length > 0 && !generating && (
        <div className="rounded-lg bg-[#FFFBEB] dark:bg-amber-950/20 px-3 py-2 space-y-1">
          <p className="text-[11px] font-medium text-[#F59E0B]">生成时做了以下假设,请确认:</p>
          {assumptions.map((a, i) => (
            <p key={i} className="text-[12px] text-[#92400E] dark:text-amber-200/80">· {a}</p>
          ))}
        </div>
      )}

      {/* 候选卡片 */}
      {drafts.length > 0 && !generating && (
        <div className="space-y-1.5">
          {drafts.map((d, i) => {
            const dup = duplicateOf(d.title, i);
            return (
              <div
                key={i}
                className={cn(
                  'rounded-lg border px-2.5 py-2 space-y-1.5 transition-colors',
                  d.selected
                    ? 'border-[#7C72F6]/30 bg-white dark:bg-[#1e1e32]'
                    : 'border-[#F3F4F6] dark:border-white/[0.05] bg-[#FAFAFA] dark:bg-white/[0.02]',
                )}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDrafts((prev) => prev.map((x, xi) => (xi === i ? { ...x, selected: !x.selected } : x)))}
                    className={cn(
                      'w-[16px] h-[16px] rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors',
                      d.selected ? 'bg-[#7C72F6] border-[#7C72F6] text-white' : 'border-[#D1D5DB] hover:border-[#7C72F6]',
                    )}
                    aria-label={d.selected ? '取消勾选' : '勾选'}
                  >
                    {d.selected && <Check size={10} strokeWidth={3} />}
                  </button>
                  <input
                    value={d.title}
                    onChange={(e) => setDrafts((prev) => prev.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)))}
                    className="flex-1 text-[13px] bg-transparent outline-none text-[#111827] dark:text-white/90"
                  />
                  {dup && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[#FFFBEB] text-[#F59E0B]" title={dup}>
                      同名
                    </span>
                  )}
                </div>
                <textarea
                  value={d.instructions}
                  onChange={(e) => setDrafts((prev) => prev.map((x, xi) => (xi === i ? { ...x, instructions: e.target.value } : x)))}
                  placeholder="执行说明(可编辑)"
                  rows={d.instructions ? 2 : 1}
                  className="w-full text-[12px] bg-transparent outline-none text-[#6B7280] dark:text-white/60 resize-y"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* 底部:采纳 */}
      {drafts.length > 0 && !generating && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[#6B7280]">本次将添加 {selectedCount} 个子任务(来源标记为 AI)</span>
          <button
            onClick={apply}
            disabled={applying || selectedCount === 0}
            className="inline-flex items-center gap-1 text-[12px] px-3.5 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="ai-breakdown-apply"
          >
            {applying && <Loader2 size={12} className="animate-spin" />}
            采纳
          </button>
        </div>
      )}
    </div>
  );
}
