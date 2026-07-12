import { useRef } from 'react';
import { Bell, CalendarDays, Check, Flag, Sun, Tag as TagIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { Task } from '../../domain/models/task';
import type { TagWithCount } from '../../types/tag';
import { MobileSyncBadge } from './MobilePrimitives';

const priorityText: Record<number, string> = {
  1: '低',
  2: '中',
  3: '高',
  4: '紧急',
};

const priorityColor: Record<number, string> = {
  1: '#3B82F6',
  2: '#F59E0B',
  3: '#F97316',
  4: '#EF4444',
};

function formatDate(value: string) {
  const date = value.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (date === today) return '今天';
  if (date === tomorrow) return '明天';
  return date.slice(5);
}

export function MobileTaskCard({
  task,
  tag,
  onToggle,
  onOpen,
  onLongPress,
}: {
  task: Task;
  tag?: TagWithCount;
  onToggle: () => void;
  onOpen?: () => void;
  onLongPress?: () => void;
}) {
  const syncStatus = (task as Task & { sync_status?: string | null }).sync_status;
  const isDone = task.is_completed;
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    if (!onLongPress) return;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress();
    }, 520);
  };

  const openTask = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    onOpen?.();
  };

  return (
    <article
      className="rounded-[var(--mobile-radius-lg)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] p-4 shadow-[var(--mobile-shadow-card)]"
      data-task-card-id={task.id}
    >
      <div className="flex gap-3">
        <button
          type="button"
          aria-label={isDone ? '标记为未完成' : '完成任务'}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          className={cn(
            'mt-0.5 flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors',
            isDone
              ? 'border-[var(--mobile-color-success)] bg-[var(--mobile-color-success)] text-white'
              : 'border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface-raised)] text-transparent',
          )}
        >
          <Check aria-hidden className="h-5 w-5" />
        </button>

        <button
          type="button"
          onPointerDown={startLongPress}
          onPointerUp={clearLongPressTimer}
          onPointerCancel={clearLongPressTimer}
          onPointerLeave={clearLongPressTimer}
          onContextMenu={(event) => {
            event.preventDefault();
            onLongPress?.();
          }}
          onClick={openTask}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex min-w-0 items-start gap-2">
            <h3
              className={cn(
                'min-w-0 flex-1 break-words text-[var(--mobile-font-body)] font-semibold leading-6 text-[var(--mobile-color-text)]',
                isDone && 'text-[var(--mobile-color-text-subtle)] line-through',
              )}
            >
              {task.title}
            </h3>
            <MobileSyncBadge status={syncStatus} />
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium leading-5 text-[var(--mobile-color-text-muted)]">
            {task.my_day_date && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--mobile-color-primary-container)] px-2 py-1 text-[var(--mobile-color-primary)]">
                <Sun aria-hidden className="h-3.5 w-3.5" />
                我的一天
              </span>
            )}
            {task.due_date && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mobile-color-border)] px-2 py-1">
                <CalendarDays aria-hidden className="h-3.5 w-3.5" />
                {formatDate(task.due_date)}
              </span>
            )}
            {task.priority > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-1"
                style={{
                  color: priorityColor[task.priority],
                  backgroundColor: `${priorityColor[task.priority]}18`,
                }}
              >
                <Flag aria-hidden className="h-3.5 w-3.5" />
                {priorityText[task.priority]}
              </span>
            )}
            {tag && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-1" style={{ color: tag.color, backgroundColor: `${tag.color}18` }}>
                <TagIcon aria-hidden className="h-3.5 w-3.5" />
                {tag.name}
              </span>
            )}
            {task.reminder && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mobile-color-border)] px-2 py-1">
                <Bell aria-hidden className="h-3.5 w-3.5" />
                提醒
              </span>
            )}
          </div>
        </button>
      </div>
    </article>
  );
}
