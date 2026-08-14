export interface NoteCountdown {
  text: string;
  overdue: boolean;
}

function parseDue(dueDate: string): Date {
  if (dueDate.length > 10) {
    return new Date(dueDate.replace(' ', 'T'));
  }
  // 仅日期(YYYY-MM-DD):按当天 23:59 截止
  const d = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function formatCountdown(dueDate: string | null | undefined, now: Date): NoteCountdown | null {
  if (!dueDate) return null;
  const diffMs = parseDue(dueDate).getTime() - now.getTime();
  const totalMinutes = Math.floor(Math.abs(diffMs) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (diffMs >= 0) {
    if (totalMinutes >= 1440) return { text: hours > 0 ? `还剩 ${days} 天 ${hours} 小时` : `还剩 ${days} 天`, overdue: false };
    if (hours > 0) return { text: `还剩 ${hours} 小时 ${minutes} 分钟`, overdue: false };
    return { text: `还剩 ${minutes} 分钟`, overdue: false };
  }
  if (totalMinutes >= 1440) return { text: hours > 0 ? `已逾期 ${days} 天 ${hours} 小时` : `已逾期 ${days} 天`, overdue: true };
  if (hours > 0) return { text: `已逾期 ${hours} 小时 ${minutes} 分钟`, overdue: true };
  return { text: `已逾期 ${minutes} 分钟`, overdue: true };
}
