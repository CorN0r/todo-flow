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
