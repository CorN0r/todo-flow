import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle, Check, Loader2, Sparkles, X, RefreshCw, Info,
} from 'lucide-react';
import { getRepositories } from '../../domain/repositories/current';
import { isAiError } from '../../domain/models/ai';
import { runBreakdown, useBreakdownStore, type DraftItem } from '../../stores/breakdownStore';
import { cn } from '../../lib/cn';
import { useElapsedSeconds } from './useElapsedSeconds';

/**
 * 任务拆解面板 = breakdownStore 会话的视图。
 * 生成中可离开详情页(后台继续),重进可接续进度/取消;完成后候选(含编辑勾选)
 * 跨进出保留;采纳立即关闭,事务在后台执行,结果经 toast 与任务刷新呈现。
 */
export function BreakdownPanel({
  taskId,
  existingChildTitles,
  onBeforeGenerate,
  onClose,
  otherBusy = false,
}: {
  taskId: string;
  existingChildTitles: string[];
  onBeforeGenerate: () => Promise<void>;
  onClose: () => void;
  /** 同任务的润色正在生成:后端按任务维度单飞,此时发起会被拒,先禁用。 */
  otherBusy?: boolean;
}) {
  useTranslation();
  const session = useBreakdownStore((s) => s.sessions[taskId]);
  const toggleItem = useBreakdownStore((s) => s.toggleItem);
  const setItem = useBreakdownStore((s) => s.setItem);
  const setUserNote = useBreakdownStore((s) => s.setUserNote);
  const clear = useBreakdownStore((s) => s.clear);
  const [progressText, setProgressText] = useState('');
  const [starting, setStarting] = useState(false);
  // 本次视图挂载后累计收到的输出字数(重进面板从 0 重新累计,仅作活跃信号)
  const [generatedChars, setGeneratedChars] = useState(0);

  const generating = session?.status === 'generating';
  const done = session?.status === 'done';
  const failed = session?.status === 'error';
  // 完成后展示;重新生成失败也保留原有候选(spec:失败保留预览)
  const showResults = !generating && (session?.items.length ?? 0) > 0;
  const elapsed = useElapsedSeconds(generating, session?.startedAt);

  const generate = async (note: string) => {
    setStarting(true);
    setProgressText('');
    setGeneratedChars(0);
    try {
      await runBreakdown(taskId, note, existingChildTitles, onBeforeGenerate);
    } finally {
      setStarting(false);
    }
  };

  // 流式进度:按会话 request_id 过滤(发起即已知,重进面板同样生效)
  useEffect(() => {
    if (!generating || !session?.requestId) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<{ request_id: string; delta?: string }>(
          'ai-request-progress',
          (event) => {
            if (cancelled) return;
            if (event.payload.request_id !== session.requestId) return;
            if (event.payload.delta) {
              setProgressText((prev) => (prev + event.payload.delta!).slice(-400));
              setGeneratedChars((c) => c + event.payload.delta!.length);
            }
          },
        );
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

  const cancel = async () => {
    if (!session?.requestId) return;
    // 乐观置为已取消:真实请求在跑则后端取消会让 invoke 返回并再次 fail(幂等);
    // 若会话卡在保存阶段(无后端请求),这是唯一能解除"生成中"的途径
    useBreakdownStore.getState().fail(taskId, '已取消');
    try {
      await getRepositories().ai.cancelRequest(session.requestId);
    } catch {
      // 取消失败不阻塞,请求结束后自然清理
    }
  };

  const apply = () => {
    if (!session?.proposalId) return;
    const selected = session.items
      .filter((d) => d.selected)
      .map(({ title, instructions }) => ({ title, instructions }));
    if (selected.length === 0) return;

    const proposalId = session.proposalId;
    const operationId = session.operationId;
    // 立即关闭;采纳事务后台执行,结果走 toast + task-changed 刷新
    clear(taskId);
    onClose();
    void (async () => {
      try {
        const result = await getRepositories().ai.applyBreakdown(proposalId, operationId, selected);
        toast.success(
          result.already_applied ? '本次采纳此前已完成,未重复添加' : `已添加 ${result.created_task_ids.length} 个子任务`,
        );
      } catch (e) {
        if (isAiError(e)) {
          toast.error(e.message);
        } else {
          toast.error(String(e));
        }
      }
    })();
  };

  const selectedCount = session?.items.filter((d) => d.selected).length ?? 0;
  const existingLowerSet = new Set(existingChildTitles.map((t) => t.trim().toLowerCase()));

  const duplicateOf = (item: DraftItem, index: number) => {
    const key = item.title.trim().toLowerCase();
    if (!key) return null;
    if (existingLowerSet.has(key)) return '与已有子任务同名';
    if (session?.items.some((d, i) => i !== index && d.title.trim().toLowerCase() === key)) {
      return '与本批其他候选同名';
    }
    return null;
  };

  return (
    <div className="rounded-xl border border-[#7C72F6]/25 bg-[#FAFAFF] dark:bg-white/[0.03] p-3 space-y-3" data-testid="ai-breakdown-panel">
      {/* 头部:模型 + 状态 + 取消/关闭 */}
      <div className="flex items-center gap-2">
        <Sparkles size={13} className="text-[#7C72F6] shrink-0" />
        <span className="text-[12px] font-medium text-[#111827] dark:text-white/90 flex-1 truncate">
          AI 拆解
          {done && session?.modelSnapshot && (
            <span className="ml-1.5 text-[11px] text-[#9CA3AF] font-normal">{session.modelSnapshot}</span>
          )}
        </span>
        {(generating || starting) && !done && (
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

      {/* 补充要求 + 生成(生成中隐藏,避免与进行中请求冲突) */}
      {!generating && (
        <div className="flex items-center gap-2">
          <input
            value={session?.userNote ?? ''}
            onChange={(e) => {
              if (session) setUserNote(taskId, e.target.value);
            }}
            placeholder="补充要求(可选,一句话)"
            className="flex-1 text-[12px] px-2.5 py-1.5 rounded-lg border border-[#D1D5DB] dark:border-white/[0.10] bg-transparent outline-none focus:border-[#7C72F6] text-[#111827] dark:text-white/90"
          />
          <button
            onClick={() => generate(session?.userNote ?? '')}
            disabled={starting || otherBusy}
            title={otherBusy ? '该任务正在润色,请先等它完成' : undefined}
            className="shrink-0 inline-flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {starting ? <Loader2 size={12} className="animate-spin" /> : session?.items.length ? <RefreshCw size={12} /> : <Sparkles size={12} />}
            {session?.items.length ? '重新生成' : '生成'}
          </button>
        </div>
      )}

      {/* 生成中进度 */}
      {generating && (
        <div className="rounded-lg bg-[#F3F4F6] dark:bg-white/[0.04] px-3 py-2 space-y-1" data-testid="ai-breakdown-progress">
          <p className="text-[11px] text-[#6B7280]">
            已等待 {elapsed} 秒 · {generatedChars > 0 ? `已生成 ${generatedChars} 字` : '等待模型响应…(高峰期可能较久,可离开本页)'}
          </p>
          <div className="text-[11px] text-[#6B7280] font-mono break-all max-h-20 overflow-hidden">
            {progressText || '正在生成…(可离开本页,生成会继续)'}
          </div>
        </div>
      )}

      {/* 错误:保留已有候选 */}
      {failed && !generating && (
        <div className="flex items-start gap-1.5 rounded-lg bg-[#FEF2F2] dark:bg-red-950/20 px-3 py-2 text-[12px] text-[#EF4444]" data-testid="ai-breakdown-error">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{session?.error}</span>
        </div>
      )}

      {/* 假设 */}
      {showResults && (session?.assumptions.length ?? 0) > 0 && (
        <div className="rounded-lg bg-[#FFFBEB] dark:bg-amber-950/20 px-3 py-2 space-y-1">
          <p className="text-[11px] font-medium text-[#F59E0B]">生成时做了以下假设,请确认:</p>
          {session?.assumptions.map((a, i) => (
            <p key={i} className="text-[12px] text-[#92400E] dark:text-amber-200/80">· {a}</p>
          ))}
        </div>
      )}

      {/* 候选卡片 */}
      {showResults && (
        <div className="space-y-1.5">
          {session?.items.map((d, i) => {
            const dup = duplicateOf(d, i);
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
                    onClick={() => toggleItem(taskId, i)}
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
                    onChange={(e) => setItem(taskId, i, { title: e.target.value })}
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
                  onChange={(e) => setItem(taskId, i, { instructions: e.target.value })}
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
      {showResults && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[#6B7280]">本次将添加 {selectedCount} 个子任务(来源标记为 AI)</span>
          <button
            onClick={apply}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-1 text-[12px] px-3.5 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="ai-breakdown-apply"
          >
            采纳
          </button>
        </div>
      )}
    </div>
  );
}
