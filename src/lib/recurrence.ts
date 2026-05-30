export interface RecurrenceConfig {
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
  if (!config) return '不重复';
  const { type, interval } = config;
  const labels: Record<string, string> = {
    daily: '天',
    weekly: '周',
    monthly: '月',
    yearly: '年',
  };
  const label = labels[type] || type;
  if (interval === 1) return `每${label}`;
  return `每${interval}${label}`;
}

export function serializeRecurrence(config: RecurrenceConfig | null): string {
  if (!config) return '';
  return JSON.stringify(config);
}
