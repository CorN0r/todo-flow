import { useState } from 'react';
import { Repeat, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

interface RecurrenceConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
}

export function parseRecurrence(json: string): RecurrenceConfig | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed.type && parsed.interval) return parsed as RecurrenceConfig;
  } catch {
    return null;
  }
  return null;
}

export function formatRecurrence(json: string): string {
  const config = parseRecurrence(json);
  if (!config) return 'No repeat';
  const { type, interval } = config;
  const labels: Record<string, string> = {
    daily: 'day',
    weekly: 'week',
    monthly: 'month',
    yearly: 'year',
  };
  const label = labels[type] || type;
  if (interval === 1) return `Every ${label}`;
  return `Every ${interval} ${label}s`;
}

export function serializeRecurrence(config: RecurrenceConfig | null): string {
  if (!config) return '';
  return JSON.stringify(config);
}

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
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
          config ? 'bg-teal-50 dark:bg-teal-950 text-teal-600' : 'text-muted-foreground hover:bg-accent',
        )}
      >
        <Repeat size={14} />
        <span>{formatRecurrence(value)}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 left-0 bg-background border rounded-xl shadow-xl z-50 p-2 min-w-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Presets */}
          {presets.map((p) => (
            <button
              key={`${p.type}-${p.interval}`}
              onClick={() => apply(p.type, p.interval)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors',
                config?.type === p.type && config?.interval === p.interval && 'bg-accent font-medium',
              )}
            >
              {formatRecurrence(serializeRecurrence(p))}
            </button>
          ))}

          {/* Custom */}
          <button
            onClick={() => setCustomOpen(!customOpen)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors text-muted-foreground"
          >
            Custom...
          </button>

          {customOpen && (
            <div className="mt-1 p-2 border-t space-y-2">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground font-medium">Frequency</label>
                <div className="flex gap-1 mt-0.5">
                  {frequencies.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setType(f.value)}
                      className={cn(
                        'px-2 py-1 rounded text-xs transition-colors',
                        type === f.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-accent',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground font-medium">Every</label>
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={interval}
                    onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 text-xs px-2 py-1 rounded border bg-background outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-xs text-muted-foreground">
                    {type === 'daily' ? 'day(s)' : type === 'weekly' ? 'week(s)' : type === 'monthly' ? 'month(s)' : 'year(s)'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => apply(type, interval)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                >
                  Apply
                </button>
                <button
                  onClick={() => setCustomOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-muted text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {config && (
            <div className="border-t mt-1 pt-1">
              <button
                onClick={clear}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
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
