import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  addWeeks,
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
  isToday,
  isSameDay,
  isBefore,
  parseISO,
};

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return isBefore(parseISO(dueDate), today);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '';
  return format(parseISO(date), 'MMM d');
}

export function formatDateFull(date: string | null | undefined): string {
  if (!date) return '';
  return format(parseISO(date), 'EEE, MMM d, yyyy');
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
