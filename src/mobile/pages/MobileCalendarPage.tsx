import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTags } from '../../hooks/useTags';
import { useTasks, useUpdateTask } from '../../hooks/useTasks';
import type { Task } from '../../domain/models/task';
import type { TagWithCount } from '../../types/tag';
import { MobileTaskCard } from '../components/MobileTaskCard';
import { MobileAppBar, MobileChip, MobileEmptyState, MobilePage, MobilePageContent } from '../components/MobilePrimitives';

const T = {
  title: '\u65e5\u5386',
  agenda: '\u65e5\u7a0b',
  month: '\u6708\u89c6\u56fe',
  week: '\u5468',
  today: '\u4eca\u5929',
  noTasks: '\u8fd9\u4e00\u5929\u6ca1\u6709\u5230\u671f\u4efb\u52a1',
  loading: '\u6b63\u5728\u52a0\u8f7d',
  taskCount: '\u9879',
};

function toISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayISO() {
  return toISO(new Date());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() - day);
  return next;
}

function monthDates(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const days: Date[] = [];
  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(new Date(first.getFullYear(), first.getMonth(), day));
  }
  return days;
}

function isVisibleRootTask(task: Task) {
  return !task.parent_task_id && !task.is_archived && !task.is_abandoned;
}

function flattenTags(tags: TagWithCount[]): TagWithCount[] {
  return tags.flatMap((tag) => [tag, ...flattenTags(tag.children ?? [])]);
}

function tagMap(tags: TagWithCount[]) {
  return new Map(flattenTags(tags).map((tag) => [tag.id, tag]));
}

function tasksByDate(tasks: Task[]) {
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.due_date) continue;
    const key = task.due_date.slice(0, 10);
    grouped.set(key, [...(grouped.get(key) ?? []), task]);
  }
  return grouped;
}

export function MobileCalendarPage() {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [showMonth, setShowMonth] = useState(false);
  const { data: tasks = [], isLoading } = useTasks({ include_children: true });
  const { data: tags = [] } = useTags();
  const updateTask = useUpdateTask();
  const tagsById = useMemo(() => tagMap(tags), [tags]);
  const visibleTasks = useMemo(() => tasks.filter(isVisibleRootTask), [tasks]);
  const grouped = useMemo(() => tasksByDate(visibleTasks), [visibleTasks]);
  const selected = new Date(`${selectedDate}T00:00:00`);
  const week = useMemo(() => {
    const start = startOfWeek(selected);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [selectedDate]);
  const month = useMemo(() => monthDates(selected), [selectedDate]);
  const agendaTasks = grouped.get(selectedDate) ?? [];
  const title = `${selected.getFullYear()}.${String(selected.getMonth() + 1).padStart(2, '0')}`;

  const shiftWeek = (days: number) => setSelectedDate(toISO(addDays(selected, days)));
  const toggleTask = (task: Task) => updateTask.mutate({ id: task.id, is_completed: !task.is_completed });

  return (
    <MobilePage>
      <MobileAppBar
        title={T.title}
        trailing={<span className="text-sm font-medium text-[var(--mobile-color-text-muted)]">{title}</span>}
      />
      <MobilePageContent>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="\u4e0a\u4e00\u5468"
            onClick={() => shiftWeek(-7)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)]"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </button>
          <MobileChip active={!showMonth} onClick={() => setShowMonth(false)}>
            <CalendarDays aria-hidden className="h-4 w-4" />
            {T.week}
          </MobileChip>
          <MobileChip active={showMonth} onClick={() => setShowMonth(true)}>
            {T.month}
          </MobileChip>
          <button
            type="button"
            aria-label="\u4e0b\u4e00\u5468"
            onClick={() => shiftWeek(7)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)]"
          >
            <ChevronRight aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {week.map((date) => {
            const iso = toISO(date);
            const count = grouped.get(iso)?.length ?? 0;
            const selectedDay = iso === selectedDate;
            return (
              <button
                key={iso}
                type="button"
                aria-label={iso}
                onClick={() => setSelectedDate(iso)}
                className={`flex min-h-16 flex-col items-center justify-center rounded-[var(--mobile-radius-md)] border text-[var(--mobile-font-caption)] leading-5 ${
                  selectedDay
                    ? 'border-[var(--mobile-color-primary)] bg-[var(--mobile-color-primary-container)] text-[var(--mobile-color-primary)]'
                    : 'border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] text-[var(--mobile-color-text-muted)]'
                }`}
              >
                <span>{date.toLocaleDateString('zh-CN', { weekday: 'short' })}</span>
                <span className="text-[var(--mobile-font-body)] font-semibold">{date.getDate()}</span>
                {count > 0 && <span className="mt-0.5 rounded-full bg-[var(--mobile-color-primary)] px-1.5 text-[10px] text-white">{count}</span>}
              </button>
            );
          })}
        </div>

        {showMonth && (
          <section className="grid grid-cols-7 gap-1 rounded-[var(--mobile-radius-lg)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] p-2">
            {month.map((date) => {
              const iso = toISO(date);
              const count = grouped.get(iso)?.length ?? 0;
              return (
                <button
                  key={iso}
                  type="button"
                  aria-label={`${iso} ${count}${T.taskCount}`}
                  onClick={() => setSelectedDate(iso)}
                  className={`relative flex min-h-11 items-center justify-center rounded-[var(--mobile-radius-sm)] text-[var(--mobile-font-caption)] ${
                    iso === selectedDate ? 'bg-[var(--mobile-color-primary)] text-white' : 'text-[var(--mobile-color-text)]'
                  }`}
                >
                  {date.getDate()}
                  {count > 0 && (
                    <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-[var(--mobile-color-warning)]" />
                  )}
                </button>
              );
            })}
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[var(--mobile-font-caption)] font-semibold uppercase leading-5 text-[var(--mobile-color-text-muted)]">
              {selectedDate === todayISO() ? T.today : selectedDate} {T.agenda}
            </h2>
            <span className="text-[var(--mobile-font-caption)] text-[var(--mobile-color-text-subtle)]">{agendaTasks.length}</span>
          </div>

          {isLoading && <MobileEmptyState title={T.loading} />}
          {!isLoading && agendaTasks.length === 0 && <MobileEmptyState title={T.noTasks} />}
          <div className="space-y-2">
            {agendaTasks.map((task) => (
              <MobileTaskCard
                key={task.id}
                task={task}
                tags={task.tag_ids[0] ? [tagsById.get(task.tag_ids[0])].filter((t): t is TagWithCount => !!t) : []}
                onToggle={() => toggleTask(task)}
              />
            ))}
          </div>
        </section>

        {agendaTasks.some((task) => task.is_completed) && (
          <div className="flex items-center gap-2 text-[var(--mobile-font-caption)] leading-5 text-[var(--mobile-color-text-muted)]">
            <Check aria-hidden className="h-4 w-4 text-[var(--mobile-color-success)]" />
            {agendaTasks.filter((task) => task.is_completed).length}/{agendaTasks.length}
          </div>
        )}
      </MobilePageContent>
    </MobilePage>
  );
}
