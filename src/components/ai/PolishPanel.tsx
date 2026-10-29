import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle, Info, Loader2, PenLine, X,
} from 'lucide-react';
import { getRepositories } from '../../domain/repositories/current';
import { isAiError, type PolishProposal } from '../../domain/models/ai';
import { errMessage } from '../../hooks/useAiModels';
import { wrapPlainText } from '../../lib/html';
import { cn } from '../../lib/cn';

/**
 * 描述润色面板:生成 → 可编辑预览 → 采纳(仅替换描述字段)。
 * - 生成前等待任务编辑保存完成(flushSave),失败中止
 * - 流式进度按 request_id 过滤;取消后描述保持原样
 * - 采纳把纯文本按既有规则包装(wrapPlainText)后走 updateTask
 */
export function PolishPanel({
  taskId,
  currentDescriptionText,
  onBeforeGenerate,
  onAdopt,
  onClose,
}: {
  taskId: string;
  currentDescriptionText: string;
  onBeforeGenerate: () => Promise<void>;
  onAdopt: (newDescriptionHtml: string) => Promise<void>;
  onClose: () => void;
}) {
  useTranslation();
  const [generating, setGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [proposal, setProposal] = useState<PolishProposal | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);
  const requestIdRef = useRef<string | null>(null);

  const generate = useCallback(async () => {
    setError(null);
    setGenerating(true);
    setProgressText('');
    try {
      await onBeforeGenerate();
    } catch {
      setGenerating(false);
      setError('任务保存失败,请先处理未保存的修改后再润色');
      return;
    }
    try {
      const result = await getRepositories().ai.polishDescription(taskId);
      requestIdRef.current = result.request_id;
      setProposal(result);
      setDraft(result.text);
    } catch (e) {
      const msg = isAiError(e) && e.code === 'cancelled' ? '已取消' : errMessage(e);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }, [taskId, onBeforeGenerate]);

  // 流式进度:只累计自己请求的增量
  useEffect(() => {
    if (!generating) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<{ request_id: string; delta?: string }>(
          'ai-request-progress',
          (event) => {
            if (cancelled) return;
            if (event.payload.request_id !== requestIdRef.current) return;
            if (event.payload.delta) {
              setProgressText((prev) => (prev + event.payload.delta!).slice(-300));
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
  }, [generating]);

  const cancel = useCallback(async () => {
    const id = requestIdRef.current;
    if (id) {
      try {
        await getRepositories().ai.cancelRequest(id);
      } catch {
        // 取消失败不阻塞,请求结束后自然清理
      }
    }
  }, []);

  const adopt = useCallback(async () => {
    const text = draft.trim();
    if (!text || adopting) return;
    setAdopting(true);
    setError(null);
    try {
      await onAdopt(wrapPlainText(text));
      toast.success('描述已更新');
      onClose();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setAdopting(false);
    }
  }, [draft, adopting, onAdopt, onClose]);

  const dirty = proposal ? draft.trim() !== proposal.text.trim() : false;

  return (
    <div className="rounded-xl border border-[#7C72F6]/25 bg-[#FAFAFF] dark:bg-white/[0.03] p-3 space-y-2.5" data-testid="ai-polish-panel">
      <div className="flex items-center gap-2">
        <PenLine size={13} className="text-[#7C72F6] shrink-0" />
        <span className="text-[12px] font-medium text-[#111827] dark:text-white/90 flex-1 truncate">
          AI 润色描述
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

      <p className="flex items-start gap-1 text-[11px] text-[#9CA3AF]">
        <Info size={11} className="mt-0.5 shrink-0" />
        仅发送任务标题、描述文本与子任务标题;结果可编辑,采纳后仅替换描述字段。
        {currentDescriptionText.trim() ? '' : '当前描述为空,将根据标题生成。'}
      </p>

      {generating && (
        <div className="rounded-lg bg-[#F3F4F6] dark:bg-white/[0.04] px-3 py-2 text-[11px] text-[#6B7280] font-mono break-all max-h-16 overflow-hidden">
          {progressText || '正在生成…'}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 rounded-lg bg-[#FEF2F2] dark:bg-red-950/20 px-3 py-2 text-[12px] text-[#EF4444]" data-testid="ai-polish-error">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {proposal && !generating && (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(10, Math.max(3, draft.split('\n').length + 1))}
            className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#D1D5DB] dark:border-white/[0.10] bg-transparent outline-none focus:border-[#7C72F6] text-[#111827] dark:text-white/90 resize-y"
            data-testid="ai-polish-draft"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">
              {draft.trim().length} 字{dirty ? ' · 已编辑' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={generate}
                className="text-[12px] px-2.5 py-1.5 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]"
              >
                重新生成
              </button>
              <button
                onClick={adopt}
                disabled={adopting || !draft.trim()}
                className={cn(
                  'text-[12px] px-3.5 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6]',
                  'disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1',
                )}
                data-testid="ai-polish-adopt"
              >
                {adopting && <Loader2 size={12} className="animate-spin" />}
                采纳
              </button>
            </div>
          </div>
        </>
      )}

      {!proposal && !generating && (
        <div className="flex justify-end">
          <button
            onClick={generate}
            className="text-[12px] px-3.5 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] inline-flex items-center gap-1"
          >
            <PenLine size={12} />
            {currentDescriptionText.trim() ? '开始润色' : '生成描述'}
          </button>
        </div>
      )}
    </div>
  );
}
