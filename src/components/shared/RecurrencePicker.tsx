import { useState } from 'react';
import { Repeat, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { parseRecurrence, formatRecurrence, serializeRecurrence } from '../../lib/recurrence';
import type { RecurrenceConfig } from '../../lib/recurrence';

const frequencies: { value: RecurrenceConfig['type']; label: string }[] = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'yearly', label: 'Year' },
];

export function RecurrencePicker({ value, onChange }: {
  value: string;
  onChange: (val: string) => void;
}) {
  const config = parseRecurrence(value);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RecurrenceConfig['type']>(config?.type || 'weekly');
  const [interval, setInterval] = useState(config?.interval || 1);
  const [customOpen, setCustomOpen] = useState(false);

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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors border font-medium',
          config
            ? 'border-[#7C72F6]/30 bg-[#7C72F6]/[0.06] dark:bg-[#7C72F6]/[0.12] text-[#7C72F6]'
            : 'border-[#E5E7EB] dark:border-white/[0.07] text-[#9CA3AF] hover:border-[#D1D5DB] hover:text-[#6B7280]',
        )}
      >
        <Repeat size={14} />
        <span>{formatRecurrence(value)}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 left-0 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-2xl shadow-xl z-50 p-1.5 min-w-[200px]"
          onClick={(e) => e.stopPropagation()}
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
            Custom...
          </button>

          {customOpen && (
            <div className="mt-1 p-2 border-t border-[#F3F4F6] dark:border-white/[0.06] space-y-2.5">
              <div>
                <label className="text-[10px] uppercase text-[#9CA3AF] font-semibold tracking-wide">Frequency</label>
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
                <label className="text-[10px] uppercase text-[#9CA3AF] font-semibold tracking-wide">Every</label>
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
                    {type === 'daily' ? 'day(s)' : type === 'weekly' ? 'week(s)' : type === 'monthly' ? 'month(s)' : 'year(s)'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => apply(type, interval)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[#7C72F6] text-white text-[12px] font-medium hover:bg-[#6D63E6] transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={() => setCustomOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] text-[12px] font-medium hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1] transition-colors"
                >
                  Cancel
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
                Remove repeat
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
