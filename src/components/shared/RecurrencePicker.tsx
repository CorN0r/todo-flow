import { useState, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Repeat, ChevronDown, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { parseRecurrence, formatRecurrence, serializeRecurrence } from '../../lib/recurrence';
import type { RecurrenceConfig } from '../../lib/recurrence';
import { Portal } from './Portal';

const frequencies: { value: RecurrenceConfig['type']; label: string }[] = [
  { value: 'daily', label: '天' },
  { value: 'weekly', label: '周' },
  { value: 'monthly', label: '月' },
  { value: 'yearly', label: '年' },
];

export function RecurrencePicker({ value, onChange, startOpen, iconOnly }: {
  value: string;
  onChange: (val: string) => void;
  startOpen?: boolean;
  iconOnly?: boolean | 'label';
}) {
  const { t: _t } = useTranslation();
  const config = parseRecurrence(value);
  const [open, setOpen] = useState(startOpen ?? false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [type, setType] = useState<RecurrenceConfig['type']>(config?.type || 'weekly');
  const [interval, setInterval] = useState(config?.interval || 1);
  const [customOpen, setCustomOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const calc = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      let top = rect.bottom + 2;
      let left = rect.left;
      const menuW = 208;
      if (left + menuW > window.innerWidth) left = Math.max(4, rect.right - menuW);
      if (top + 280 > window.innerHeight) top = rect.top - 286;
      const offScreen = rect.bottom < 0 || rect.top > window.innerHeight;
      if (offScreen) { setOpen(false); return; }
      setPos({ top, left });
    };
    calc();
    window.addEventListener('scroll', calc, true);
    window.addEventListener('resize', calc);
    return () => {
      window.removeEventListener('scroll', calc, true);
      window.removeEventListener('resize', calc);
    };
  }, [open]);

  const apply = (t: RecurrenceConfig['type'], i: number) => {
    setType(t);
    setInterval(i);
    onChange(serializeRecurrence({ type: t, interval: i }));
    setOpen(false);
    setCustomOpen(false);
  };

  const clear = () => {
    onChange('');
    setOpen(false);
    setCustomOpen(false);
  };

  const presets = [
    { type: 'daily' as const, interval: 1 },
    { type: 'weekly' as const, interval: 1 },
    { type: 'monthly' as const, interval: 1 },
  ];

  const recLabel = config ? (() => {
    const t = config.type;
    const i = config.interval;
    if (t === 'daily') return i > 1 ? `每${i}天` : '每天';
    if (t === 'weekly') return i > 1 ? `每${i}周` : '每周';
    if (t === 'monthly') return i > 1 ? `每${i}月` : '每月';
    if (t === 'yearly') return i > 1 ? `每${i}年` : '每年';
    return formatRecurrence(value);
  })() : '';

  return (
    <div className="relative">
      {iconOnly && recLabel ? (
        <span
          ref={triggerRef as any}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-full font-medium bg-[#F59E0B]/[0.10] text-[#F59E0B] cursor-pointer transition-colors hover:opacity-80"
        >
          <Repeat size={12} />
          <span className="truncate max-w-[80px]">{recLabel}</span>
          <span role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); clear(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); clear(); } }}
            className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
            <X size={12} />
          </span>
        </span>
      ) : iconOnly === 'label' ? (
        <button
          ref={triggerRef}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full text-[#9CA3AF] bg-[#F3F4F6] dark:bg-white/[0.04] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.08] transition-colors"
        >
          <Repeat size={12} />重复
        </button>
      ) : (
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={cn(
          iconOnly
            ? 'flex items-center justify-center shrink-0 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1] transition-colors'
            : cn('flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors border font-medium',
              config ? 'border-[#7C72F6]/30 bg-[#7C72F6]/[0.06] dark:bg-[#7C72F6]/[0.12] text-[#7C72F6]' : 'border-[#E5E7EB] dark:border-white/[0.07] text-[#9CA3AF] hover:border-[#D1D5DB] hover:text-[#6B7280]'),
        )}
        style={iconOnly ? { width: '28px', height: '28px' } : undefined}
        title={iconOnly ? (config ? formatRecurrence(value) : '重复') : undefined}
      >
        <Repeat size={iconOnly ? 13 : 14} />
        {!iconOnly && <span>{formatRecurrence(value)}</span>}
        {!iconOnly && <ChevronDown size={12} />}
      </button>
      )}

      {open && (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setCustomOpen(false); }} />
          <div
            className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-2xl shadow-xl p-1.5 min-w-[200px]"
            style={{ top: pos.top, left: pos.left }}
          >
            {/* Presets */}
            {presets.map((p) => (
              <button
                key={`${p.type}-${p.interval}`}
                onClick={() => apply(p.type, p.interval)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors',
                  config?.type === p.type && config?.interval === p.interval
                    ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6] font-medium'
                    : 'text-[#111827] dark:text-white/90 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]',
                )}
              >
                {formatRecurrence(serializeRecurrence(p))}
              </button>
            ))}

            {/* Custom */}
            <button
              onClick={() => setCustomOpen(!customOpen)}
              className="w-full text-left px-3 py-2 rounded-lg text-[13px] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors text-[#9CA3AF]"
            >
              自定义...
            </button>

            {customOpen && (
              <div className="mt-1 p-2 border-t border-[#F3F4F6] dark:border-white/[0.06] space-y-2.5">
                <div>
                  <label className="text-[10px] text-[#9CA3AF] font-semibold tracking-wide">频率</label>
                  <div className="flex gap-1 mt-1">
                    {frequencies.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => setType(f.value)}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors',
                          type === f.value
                            ? 'bg-[#7C72F6] text-white'
                            : 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1]',
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-[#9CA3AF] font-semibold tracking-wide">间隔</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={interval}
                      onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-14 text-[12px] px-2 py-1 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6] text-[#111827] dark:text-white/90 text-center"
                    />
                    <span className="text-[12px] text-[#9CA3AF]">
                      {type === 'daily' ? '天' : type === 'weekly' ? '周' : type === 'monthly' ? '月' : '年'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => apply(type, interval)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#7C72F6] text-white text-[12px] font-medium hover:bg-[#6D63E6] transition-colors"
                  >
                    确定
                  </button>
                  <button
                    onClick={() => setCustomOpen(false)}
                    className="px-3 py-1.5 rounded-lg bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] text-[12px] font-medium hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1] transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {config && (
              <div className="border-t border-[#F3F4F6] dark:border-white/[0.06] mt-1 pt-1">
                <button
                  onClick={clear}
                  className="w-full text-left px-3 py-2 rounded-lg text-[13px] text-[#EF4444] hover:bg-[#FEF2F2] dark:hover:bg-red-950/30 transition-colors font-medium"
                >
                  移除重复
                </button>
              </div>
            )}
          </div>
        </Portal>
      )}
    </div>
  );
}
