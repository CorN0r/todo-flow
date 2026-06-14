import { useState, useCallback, useRef, useEffect } from 'react';
import { getShortcutDisplay, normalizeKeys } from '../../types/shortcuts';

interface KeyCaptureProps {
  currentKeys: string;
  onSave: (keys: string) => void;
  conflict?: string;
  error?: string;
}

/**
 * 快捷键录制组件。
 * 点击进入录制态，按任意键组合记录快捷键。
 * Escape 取消录制，Backspace/Delete 清空快捷键。
 */
export function KeyCapture({ currentKeys, onSave, conflict, error }: KeyCaptureProps) {
  const [capturing, setCapturing] = useState(false);
  const [captureBuffer, setCaptureBuffer] = useState('');
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    setCapturing(true);
    setCaptureBuffer('');
  }, []);

  useEffect(() => {
    if (!capturing) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setCapturing(false);
        setCaptureBuffer('');
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        setCapturing(false);
        setCaptureBuffer('');
        onSave('');
        return;
      }

      // 跳过纯修饰键
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      // 构建组合键字符串
      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      if (e.metaKey) parts.push('Super');

      // 将 key 映射为规范形式
      const raw = e.key;
      const normalized = normalizeKeys(raw) || raw;
      parts.push(normalized);
      const combined = parts.join('+');

      setCaptureBuffer(combined);
      onSave(combined);
      setCapturing(false);
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, onSave]);

  const display = capturing ? (captureBuffer || '按下新快捷键...') : (currentKeys || '无');

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1 min-w-[60px] px-2.5 py-1 rounded-md text-xs font-mono border transition-colors ${
        capturing
          ? 'bg-[#7C72F6]/10 border-[#7C72F6] text-[#7C72F6] animate-pulse cursor-default'
          : error || conflict
            ? 'bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:border-red-400 cursor-pointer'
            : 'bg-[#F9FAFB] dark:bg-white/[0.04] border-[#E5E7EB] dark:border-white/[0.08] text-[#111827] dark:text-white/80 hover:border-[#7C72F6]/50 cursor-pointer'
      }`}
    >
      {capturing ? (
        <span>{captureBuffer ? getShortcutDisplay(captureBuffer) : <span className="text-[#9CA3AF]">按下新快捷键...</span>}</span>
      ) : (
        <span>{currentKeys ? getShortcutDisplay(display) : <span className="text-[#9CA3AF] italic">未设置</span>}</span>
      )}
    </button>
  );
}
