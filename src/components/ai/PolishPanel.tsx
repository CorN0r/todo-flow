import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, Info, Loader2, PenLine, X,
} from 'lucide-react';
import { getRepositories } from '../../domain/repositories/current';
import { runPolish, usePolishStore } from '../../stores/polishStore';
import { wrapPlainText } from '../../lib/html';

/**
 * 描述润色面板 = polishStore 会话的视图。
 * 会话(生成中/结果/编辑)存放在 store,退出详情再进来仍能看到进行中的请求
 * 或上次结果;采纳立即关闭面板,描述更新在后台落库。
 */
export function PolishPanel({
  taskId,
  currentDescriptionText,
  onBeforeGenerate,
  onAdopt,
  onClose,
  otherBusy = false,
}: {
  taskId: string;
  currentDescriptionText: string;
  onBeforeGenerate: () => Promise<void>;
  /** 立即返回;描述更新由调用方异步落库,失败自行提示。 */
  onAdopt: (newDescriptionHtml: string) => void;
  onClose: () => void;
  /** 同任务的拆解正在生成:后端按任务维度单飞,此时发起会被拒,先禁用。 */
  otherBusy?: boolean;
}) {
  useTranslation();
  const session = usePolishStore((s) => s.sessions[taskId]);
  const setText = usePolishStore((s) => s.setText);
  const clear = usePolishStore((s) => s.clear);
  const [progressText, setProgressText] = useState('');
  const [starting, setStarting] = useState(false);

  const generating = session?.status === 'generating';
  const done = session?.status === 'done';
  const failed = session?.status === 'error';

  const generate = useCallback(async () => {
    setStarting(true);
    setProgressText('');
    try {
      await runPolish(taskId, currentDescriptionText, onBeforeGenerate);
    } finally {
      setStarting(false);
    }
  }, [taskId, currentDescriptionText, onBeforeGenerate]);

  // 流式进度:按会话 request_id 过滤(生成一开始就知道 id,重进面板同样生效)
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
  }, [generating, session?.requestId]);

  const cancel = async () => {
    if (!session?.requestId) return;
    // 乐观置为已取消:真实请求在跑则后端取消会让 invoke 返回并再次 fail(幂等);
    // 若会话卡在保存阶段(无后端请求),这是唯一能解除"生成中"的途径
    usePolishStore.getState().fail(taskId, '已取消');
    try {
      await getRepositories().ai.cancelRequest(session.requestId);
    } catch {
      // 取消失败不阻塞,请求结束后自然清理
    }
  };

  const adopt = useCallback(() => {
    const text = (session?.text ?? '').trim();
    if (!text) return;
    // 立即关闭并清除会话;描述更新后台落库,失败由调用方 toast
    onAdopt(wrapPlainText(text));
    clear(taskId);
    onClose();
  }, [session?.text, onAdopt, clear, taskId, onClose]);

  // 生成后描述又被人改过:结果基于旧内容,采纳会覆盖改动 → 明确提示
  const baseChanged =
    done && session !== undefined && currentDescriptionText.trim() !== session.baseDescriptionText.trim();

  return (
    <div className="rounded-xl border border-[#7C72F6]/25 bg-[#FAFAFF] dark:bg-white/[0.03] p-3 space-y-2.5" data-testid="ai-polish-panel">
      <div className="flex items-center gap-2">
        <PenLine size={13} className="text-[#7C72F6] shrink-0" />
        <span className="text-[12px] font-medium text-[#111827] dark:text-white/90 flex-1 truncate">
          AI 润色描述
          {done && session?.modelSnapshot && (
            <span className="ml-1.5 text-[11px] text-[#9CA3AF] font-normal">{session.modelSnapshot}</span>
          )}
        </span>
        {(generating || starting) && (
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
        <div className="rounded-lg bg-[#F3F4F6] dark:bg-white/[0.04] px-3 py-2 text-[11px] text-[#6B7280] font-mono break-all max-h-16 overflow-hidden" data-testid="ai-polish-progress">
          {progressText || '正在生成…(可离开本页,生成会继续)'}
        </div>
      )}

      {(failed || starting) && !generating && (
        <div className="flex items-start gap-1.5 rounded-lg bg-[#FEF2F2] dark:bg-red-950/20 px-3 py-2 text-[12px] text-[#EF4444]" data-testid="ai-polish-error">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{failed ? session?.error : ''}</span>
        </div>
      )}

      {failed && !generating && (
        <div className="flex justify-end">
          <button
            onClick={generate}
            disabled={otherBusy}
            title={otherBusy ? '该任务正在生成拆解,请先等它完成' : undefined}
            className="text-[12px] px-3.5 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            <PenLine size={12} />重试
          </button>
        </div>
      )}

      {done && (
        <>
          {baseChanged && (
            <p className="text-[11px] text-[#F59E0B]" data-testid="ai-polish-stale">
              生成后任务描述有改动,以下结果基于旧内容;采纳将覆盖当前描述。
            </p>
          )}
          <textarea
            value={session?.text ?? ''}
            onChange={(e) => setText(taskId, e.target.value)}
            rows={Math.min(10, Math.max(3, (session?.text ?? '').split('\n').length + 1))}
            className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#D1D5DB] dark:border-white/[0.10] bg-transparent outline-none focus:border-[#7C72F6] text-[#111827] dark:text-white/90 resize-y"
            data-testid="ai-polish-draft"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">
              {(session?.text ?? '').trim().length} 字
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={generate}
                disabled={otherBusy}
                title={otherBusy ? '该任务正在生成拆解,请先等它完成' : undefined}
                className="text-[12px] px-2.5 py-1.5 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
              >
                重新生成
              </button>
              <button
                onClick={adopt}
                disabled={!(session?.text ?? '').trim()}
                className="text-[12px] px-3.5 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="ai-polish-adopt"
              >
                采纳
              </button>
            </div>
          </div>
        </>
      )}

      {!session && !generating && (
        <div className="flex justify-end">
          <button
            onClick={generate}
            disabled={starting || otherBusy}
            title={otherBusy ? '该任务正在生成拆解,请先等它完成' : undefined}
            className="text-[12px] px-3.5 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:bg-[#6C63E6] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            {starting ? <Loader2 size={12} className="animate-spin" /> : <PenLine size={12} />}
            {currentDescriptionText.trim() ? '开始润色' : '生成描述'}
          </button>
        </div>
      )}
    </div>
  );
}
