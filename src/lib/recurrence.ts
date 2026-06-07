import i18n from '../i18n';

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
  if (!config) return i18n.t('attributes.noRepeat');
  const { type, interval } = config;
  const key = `recurrence.${type}` as const;
  const label = i18n.t(key);
  if (interval === 1) return label;
  return `${i18n.t('common.every')} ${interval} ${label}`;
}

export function serializeRecurrence(config: RecurrenceConfig | null): string {
  if (!config) return '';
  return JSON.stringify(config);
}
