import i18n from '../i18n';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  addWeeks,
  subDays,
  subMinutes,
  subHours,
  isToday,
  isSameDay,
  isBefore,
  parseISO,
} from 'date-fns';

export {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  addWeeks,
  subDays,
  subMinutes,
  subHours,
  isToday,
  isSameDay,
  isBefore,
  parseISO,
};

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const ref = dueDate.length > 10 ? new Date() : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  return isBefore(new Date(dueDate.replace(' ', 'T')), ref);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '';
  const normalized = date.replace(' ', 'T');
  if (date.length > 10) return format(new Date(normalized), 'MMM d HH:mm');
  return format(new Date(normalized), 'MMM d');
}

export function formatDateFull(date: string | null | undefined): string {
  if (!date) return '';
  const normalized = date.replace(' ', 'T');
  if (date.length > 10) return format(new Date(normalized), 'EEE, MMM d, yyyy HH:mm');
  return format(new Date(normalized), 'EEE, MMM d, yyyy');
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function normalizeReminder(reminder: string | null | undefined): string | null {
  if (!reminder) return null;
  return reminder.replace('T', ' ');
}

const REMINDER_PRESETS: Record<string, { minutes: number }> = {
  '0m': { minutes: 0 },
  '-5m': { minutes: -5 },
  '-30m': { minutes: -30 },
  '-1h': { minutes: -60 },
  '-1d': { minutes: -1440 },
  '-1w': { minutes: -10080 },
};

export function getReminderPresets(): Record<string, { minutes: number; label: string }> {
  return {
    '0m': { minutes: 0, label: i18n.t('reminderPresets.0m') },
    '-5m': { minutes: -5, label: i18n.t('reminderPresets.-5m') },
    '-30m': { minutes: -30, label: i18n.t('reminderPresets.-30m') },
    '-1h': { minutes: -60, label: i18n.t('reminderPresets.-1h') },
    '-1d': { minutes: -1440, label: i18n.t('reminderPresets.-1d') },
    '-1w': { minutes: -10080, label: i18n.t('reminderPresets.-1w') },
  };
}

export function getReminderLabel(offset: string): string {
  if (!offset) return '';
  if (offset.startsWith('custom:')) return `${i18n.t('common.custom', '自定义')} ${offset.slice(7)}`;
  return REMINDER_PRESETS[offset] ? getReminderPresets()[offset].label : offset;
}

export function computeReminderTime(dueDate: string, offset: string): string {
  if (!offset || offset === 'none') return '';
  if (offset.startsWith('custom:')) return offset.slice(7);

  const preset = REMINDER_PRESETS[offset];
  if (!preset) return '';

  const normalized = dueDate.replace(' ', 'T');
  let hour = 9, minute = 0;
  if (dueDate.length > 10) {
    const timePart = dueDate.slice(11);
    const parts = timePart.split(':');
    hour = parseInt(parts[0]) || 9;
    minute = parseInt(parts[1]) || 0;
  }
  const due = new Date(normalized);
  due.setHours(hour, minute, 0, 0);
  const rem = new Date(due.getTime() + preset.minutes * 60000);
  return format(rem, 'yyyy-MM-dd HH:mm');
}

export function inferReminderOffset(dueDate: string, reminder: string): string {
  if (!reminder) return 'none';
  if (!dueDate) return `custom:${reminder}`;

  const normalized = dueDate.replace(' ', 'T');
  let hour = 9, minute = 0;
  if (dueDate.length > 10) {
    const timePart = dueDate.slice(11);
    const parts = timePart.split(':');
    hour = parseInt(parts[0]) || 9;
    minute = parseInt(parts[1]) || 0;
  }
  const due = new Date(normalized);
  due.setHours(hour, minute, 0, 0);
  const rem = new Date(reminder.replace('T', ' ').replace(' ', 'T'));

  const diffMs = rem.getTime() - due.getTime();

  for (const [label, { minutes }] of Object.entries(REMINDER_PRESETS)) {
    const target = due.getTime() + minutes * 60000;
    if (Math.abs(rem.getTime() - target) < 60000) return label;
  }

  return `custom:${reminder}`;
}
