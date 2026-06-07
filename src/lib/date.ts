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

const REMINDER_PRESETS: Record<string, { minutes: number; label: string }> = {
  '0m': { minutes: 0, label: '准时' },
  '-5m': { minutes: -5, label: '提前5分钟' },
  '-30m': { minutes: -30, label: '提前30分钟' },
  '-1h': { minutes: -60, label: '提前1小时' },
  '-1d': { minutes: -1440, label: '提前1天' },
  '-1w': { minutes: -10080, label: '提前1周' },
};

export function getReminderPresets() { return REMINDER_PRESETS; }

export function getReminderLabel(offset: string): string {
  if (!offset) return '';
  if (offset.startsWith('custom:')) return `自定义 ${offset.slice(7)}`;
  return REMINDER_PRESETS[offset]?.label || offset;
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
