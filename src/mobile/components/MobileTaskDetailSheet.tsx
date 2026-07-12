import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, Check, Flag, Plus, Repeat, Sun, Tag as TagIcon, Trash2 } from 'lucide-react';
import {
  useClearTaskReminders,
  useCreateTask,
  useCreateTaskReminder,
  useDeleteTask,
  useTask,
  useUpdateTask,
} from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { cn } from '../../lib/cn';
import { parseRecurrence, serializeRecurrence } from '../../lib/recurrence';
import type { Task } from '../../domain/models/task';
import type { TagWithCount } from '../../types/tag';
import { MobileBottomSheet, MobileChip, MobileEmptyState, MobileSyncBadge } from './MobilePrimitives';

type RecurrenceChoice = '' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type ReminderChoice = '' | 'at_due_time' | '5m' | '1h' | '1d';

interface DetailForm {
  title: string;
  description: string;
  priority: number;
  dueDate: string;
  tagId: string;
  reminder: ReminderChoice;
  recurrence: RecurrenceChoice;
  isCompleted: boolean;
  myDay: boolean;
}

const T = {
  taskDetail: '\u4efb\u52a1\u8be6\u60c5',
  loading: '\u6b63\u5728\u52a0\u8f7d',
  missing: '\u4efb\u52a1\u4e0d\u5b58\u5728',
  title: '\u6807\u9898',
  description: '\u63cf\u8ff0',
  save: '\u4fdd\u5b58\u4fee\u6539',
  saving: '\u4fdd\u5b58\u4e2d',
  deleteTask: '\u5220\u9664\u4efb\u52a1',
  complete: '\u5b8c\u6210\u4efb\u52a1',
  reopen: '\u91cd\u65b0\u6253\u5f00',
  dueDate: '\u5230\u671f\u65e5',
  noDate: '\u65e0\u65e5\u671f',
  noTag: '\u65e0\u6807\u7b7e',
  today: '\u4eca\u5929',
  tomorrow: '\u660e\u5929',
  priority: '\u4f18\u5148\u7ea7',
  reminder: '\u63d0\u9192',
  tag: '\u6807\u7b7e',
  recurrence: '\u91cd\u590d',
  myDay: '\u52a0\u5165\u6211\u7684\u4e00\u5929',
  syncState: '\u540c\u6b65\u72b6\u6001',
  subtasks: '\u5b50\u4efb\u52a1',
  addSubtask: '\u65b0\u589e\u5b50\u4efb\u52a1',
  subtaskPlaceholder: '\u5199\u4e0b\u5b50\u4efb\u52a1',
  twoLevelLimit: '\u5b50\u4efb\u52a1\u4e0d\u80fd\u518d\u7ee7\u7eed\u6dfb\u52a0\u4e0b\u4e00\u5c42',
  noSubtasks: '\u8fd8\u6ca1\u6709\u5b50\u4efb\u52a1',
  localFirstHint: '\u672c\u5730\u4fdd\u5b58\u540e\u4f1a\u7ee7\u7eed\u6392\u961f\u540c\u6b65',
};

const priorityOptions = [
  { value: 0, label: '\u65e0' },
  { value: 1, label: '\u4f4e' },
  { value: 2, label: '\u4e2d' },
  { value: 3, label: '\u9ad8' },
  { value: 4, label: '\u7d27\u6025' },
];

const reminderOptions: { value: ReminderChoice; label: string }[] = [
  { value: '', label: '\u65e0\u63d0\u9192' },
  { value: 'at_due_time', label: '\u5230\u671f\u65f6' },
  { value: '5m', label: '\u63d0\u524d 5 \u5206\u949f' },
  { value: '1h', label: '\u63d0\u524d 1 \u5c0f\u65f6' },
  { value: '1d', label: '\u63d0\u524d 1 \u5929' },
];

const recurrenceOptions: { value: RecurrenceChoice; label: string }[] = [
  { value: '', label: '\u4e0d\u91cd\u590d' },
  { value: 'daily', label: '\u6bcf\u5929' },
  { value: 'weekly', label: '\u6bcf\u5468' },
  { value: 'monthly', label: '\u6bcf\u6708' },
  { value: 'yearly', label: '\u6bcf\u5e74' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function flattenTags(tags: TagWithCount[]): TagWithCount[] {
  return tags.flatMap((tag) => [tag, ...flattenTags(tag.children ?? [])]);
}

function recurrenceToChoice(value?: string | null): RecurrenceChoice {
  const parsed = parseRecurrence(value ?? '');
  if (!parsed || parsed.interval !== 1) return '';
  return parsed.type;
}

function choiceToRecurrence(value: RecurrenceChoice) {
  if (!value) return '';
  return serializeRecurrence({ type: value, interval: 1 });
}

function formFromTask(task: Task): DetailForm {
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    dueDate: task.due_date ?? '',
    tagId: task.tag_id ?? '',
    reminder: (task.reminder ?? '') as ReminderChoice,
    recurrence: recurrenceToChoice(task.recurrence),
    isCompleted: task.is_completed,
    myDay: task.my_day_date === todayISO(),
  };
}

function fieldLabelClass() {
  return 'mb-2 block text-[var(--mobile-font-caption)] font-medium leading-5 text-[var(--mobile-color-text-muted)]';
}

function fieldClass() {
  return 'min-h-12 w-full rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-4 text-[var(--mobile-font-body)] leading-6 text-[var(--mobile-color-text)] outline-none focus:border-[var(--mobile-color-primary)]';
}

export function MobileTaskDetailSheet({
  taskId,
  open,
  onClose,
}: {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: detail, isLoading, isError } = useTask(open ? taskId : null);
  const { data: tags = [] } = useTags();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const createReminder = useCreateTaskReminder();
  const clearReminders = useClearTaskReminders();
  const [form, setForm] = useState<DetailForm | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState('');

  const task = detail?.task;
  const children = detail?.children ?? [];
  const allTags = useMemo(() => flattenTags(tags), [tags]);
  const syncStatus = (task as (Task & { sync_status?: string | null }) | undefined)?.sync_status;
  const canAddSubtask = !!task && !task.parent_task_id;
  const isBusy = updateTask.isPending || deleteTask.isPending || createTask.isPending || clearReminders.isPending || createReminder.isPending;

  useEffect(() => {
    if (!task) {
      setForm(null);
      return;
    }
    setForm(formFromTask(task));
    setSubtaskTitle('');
  }, [task?.id, task?.updated_at]);

  const updateForm = (patch: Partial<DetailForm>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  };

  const save = async () => {
    if (!task || !form || !form.title.trim()) return;
    await updateTask.mutateAsync({
      id: task.id,
      title: form.title.trim(),
      description: form.description,
      is_completed: form.isCompleted,
      priority: form.priority,
      due_date: form.dueDate || null,
      tag_id: form.tagId || null,
      reminder: form.reminder || null,
      recurrence: choiceToRecurrence(form.recurrence),
      my_day_date: form.myDay ? todayISO() : null,
    });

    if ((task.reminder ?? '') !== form.reminder) {
      await clearReminders.mutateAsync(task.id);
      if (form.reminder) {
        await createReminder.mutateAsync({
          taskId: task.id,
          offset: form.reminder,
          dueDate: form.dueDate || undefined,
        });
      }
    }
  };

  const toggleComplete = async () => {
    if (!task || !form) return;
    const next = !form.isCompleted;
    updateForm({ isCompleted: next });
    await updateTask.mutateAsync({ id: task.id, is_completed: next });
  };

  const removeTask = async () => {
    if (!task) return;
    await deleteTask.mutateAsync(task.id);
    onClose();
  };

  const addSubtask = async () => {
    const title = subtaskTitle.trim();
    if (!task || !canAddSubtask || !title) return;
    await createTask.mutateAsync({ title, parent_task_id: task.id });
    setSubtaskTitle('');
    await queryClient.invalidateQueries({ queryKey: ['task', task.id] });
  };

  const toggleSubtask = async (child: Task) => {
    await updateTask.mutateAsync({ id: child.id, is_completed: !child.is_completed });
    if (task) await queryClient.invalidateQueries({ queryKey: ['task', task.id] });
  };

  const deleteSubtask = async (child: Task) => {
    await deleteTask.mutateAsync(child.id);
    if (task) await queryClient.invalidateQueries({ queryKey: ['task', task.id] });
  };

  return (
    <MobileBottomSheet title={T.taskDetail} open={open && !!taskId} onClose={onClose}>
      <div className="mobile-detail-enter space-y-5 pb-2" data-motion="mobile-task-detail">
        {isLoading && <MobileEmptyState title={T.loading} />}
        {(isError || (!isLoading && !task)) && <MobileEmptyState title={T.missing} />}

        {task && form && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-3 py-2">
              <span className="text-[var(--mobile-font-caption)] font-medium leading-5 text-[var(--mobile-color-text-muted)]">
                {T.syncState}
              </span>
              <div className="flex min-h-8 items-center gap-2">
                <MobileSyncBadge status={syncStatus ?? 'pending'} />
                <span className="text-[11px] leading-4 text-[var(--mobile-color-text-subtle)]">{T.localFirstHint}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleComplete}
              className={cn(
                'flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--mobile-radius-md)] border px-4 text-[var(--mobile-font-body)] font-semibold leading-6 transition-colors',
                form.isCompleted
                  ? 'border-[var(--mobile-color-success)] bg-[var(--mobile-color-success)] text-white'
                  : 'border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] text-[var(--mobile-color-text)]',
              )}
            >
              <Check aria-hidden className="h-5 w-5" />
              {form.isCompleted ? T.reopen : T.complete}
            </button>

            <label className="block">
              <span className={fieldLabelClass()}>{T.title}</span>
              <input
                aria-label={T.title}
                value={form.title}
                onChange={(event) => updateForm({ title: event.target.value })}
                className={fieldClass()}
              />
            </label>

            <div>
              <p className={fieldLabelClass()}>{T.dueDate}</p>
              <div className="flex flex-wrap gap-2">
                <MobileChip active={!form.dueDate} onClick={() => updateForm({ dueDate: '' })}>
                  <CalendarDays aria-hidden className="h-4 w-4" />
                  {T.noTag}
                </MobileChip>
                <MobileChip active={form.dueDate === todayISO()} onClick={() => updateForm({ dueDate: todayISO() })}>
                  {T.today}
                </MobileChip>
                <MobileChip active={form.dueDate === tomorrowISO()} onClick={() => updateForm({ dueDate: tomorrowISO() })}>
                  {T.tomorrow}
                </MobileChip>
              </div>
              <input
                aria-label={T.dueDate}
                type="date"
                value={form.dueDate}
                onChange={(event) => updateForm({ dueDate: event.target.value })}
                className={cn(fieldClass(), 'mt-2 [color-scheme:light] dark:[color-scheme:dark]')}
              />
            </div>

            <div>
              <p className={fieldLabelClass()}>{T.priority}</p>
              <div className="flex flex-wrap gap-2">
                {priorityOptions.map((option) => (
                  <MobileChip key={option.value} active={form.priority === option.value} onClick={() => updateForm({ priority: option.value })}>
                    <Flag aria-hidden className="h-4 w-4" />
                    {option.label}
                  </MobileChip>
                ))}
              </div>
            </div>

            <div>
              <p className={fieldLabelClass()}>{T.reminder}</p>
              <div className="flex flex-wrap gap-2">
                {reminderOptions.map((option) => (
                  <MobileChip key={option.value || 'none'} active={form.reminder === option.value} onClick={() => updateForm({ reminder: option.value })}>
                    <Bell aria-hidden className="h-4 w-4" />
                    {option.label}
                  </MobileChip>
                ))}
              </div>
            </div>

            <div>
              <p className={fieldLabelClass()}>{T.tag}</p>
              <div className="flex flex-wrap gap-2">
                <MobileChip active={!form.tagId} onClick={() => updateForm({ tagId: '' })}>
                  <TagIcon aria-hidden className="h-4 w-4" />
                  {T.noDate}
                </MobileChip>
                {allTags.map((tag) => (
                  <MobileChip key={tag.id} active={form.tagId === tag.id} onClick={() => updateForm({ tagId: tag.id })}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </MobileChip>
                ))}
              </div>
            </div>

            <div>
              <p className={fieldLabelClass()}>{T.recurrence}</p>
              <div className="flex flex-wrap gap-2">
                {recurrenceOptions.map((option) => (
                  <MobileChip key={option.value || 'none'} active={form.recurrence === option.value} onClick={() => updateForm({ recurrence: option.value })}>
                    <Repeat aria-hidden className="h-4 w-4" />
                    {option.label}
                  </MobileChip>
                ))}
              </div>
            </div>

            <label className="flex min-h-12 items-center justify-between gap-3 rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-4">
              <span className="inline-flex min-w-0 items-center gap-2 break-words text-[var(--mobile-font-body)] leading-6 text-[var(--mobile-color-text)]">
                <Sun aria-hidden className="h-4 w-4 shrink-0 text-[var(--mobile-color-warning)]" />
                {T.myDay}
              </span>
              <input
                type="checkbox"
                checked={form.myDay}
                onChange={(event) => updateForm({ myDay: event.target.checked })}
                className="h-5 w-5 shrink-0 accent-[var(--mobile-color-primary)]"
              />
            </label>

            <label className="block">
              <span className={fieldLabelClass()}>{T.description}</span>
              <textarea
                aria-label={T.description}
                value={form.description}
                onChange={(event) => updateForm({ description: event.target.value })}
                className={cn(fieldClass(), 'min-h-28 resize-none py-3')}
              />
            </label>

            <section className="space-y-3 rounded-[var(--mobile-radius-lg)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[var(--mobile-font-body)] font-semibold leading-6 text-[var(--mobile-color-text)]">{T.subtasks}</h3>
                <span className="text-[var(--mobile-font-caption)] leading-5 text-[var(--mobile-color-text-muted)]">{children.length}</span>
              </div>

              {children.length === 0 && (
                <p className="text-[var(--mobile-font-caption)] leading-5 text-[var(--mobile-color-text-muted)]">{T.noSubtasks}</p>
              )}

              <div className="space-y-2">
                {children.map((child) => (
                  <div key={child.id} className="flex min-h-11 items-center gap-2 rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-surface-raised)] px-2">
                    <button
                      type="button"
                      aria-label={child.is_completed ? T.reopen : T.complete}
                      onClick={() => toggleSubtask(child)}
                      className={cn(
                        'flex min-h-9 min-w-9 items-center justify-center rounded-full border',
                        child.is_completed
                          ? 'border-[var(--mobile-color-success)] bg-[var(--mobile-color-success)] text-white'
                          : 'border-[var(--mobile-color-border)] text-transparent',
                      )}
                    >
                      <Check aria-hidden className="h-4 w-4" />
                    </button>
                    <span className={cn('min-w-0 flex-1 break-words text-[var(--mobile-font-body)] leading-6', child.is_completed && 'line-through text-[var(--mobile-color-text-subtle)]')}>
                      {child.title}
                    </span>
                    <button
                      type="button"
                      aria-label={T.deleteTask}
                      onClick={() => deleteSubtask(child)}
                      className="flex min-h-9 min-w-9 items-center justify-center rounded-[var(--mobile-radius-sm)] text-[var(--mobile-color-danger)]"
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {canAddSubtask ? (
                <div className="flex gap-2">
                  <input
                    aria-label={T.addSubtask}
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addSubtask();
                      }
                    }}
                    placeholder={T.subtaskPlaceholder}
                    className={fieldClass()}
                  />
                  <button
                    type="button"
                    aria-label={T.addSubtask}
                    onClick={addSubtask}
                    disabled={!subtaskTitle.trim()}
                    className="flex min-h-12 min-w-12 items-center justify-center rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-primary)] text-white disabled:opacity-45"
                  >
                    <Plus aria-hidden className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <p className="text-[var(--mobile-font-caption)] leading-5 text-[var(--mobile-color-text-muted)]">{T.twoLevelLimit}</p>
              )}
            </section>

            <button
              type="button"
              disabled={isBusy || !form.title.trim()}
              onClick={save}
              className="flex min-h-12 w-full items-center justify-center rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-primary)] px-4 text-[var(--mobile-font-body)] font-semibold leading-6 text-white active:bg-[var(--mobile-color-primary-pressed)] disabled:opacity-45"
            >
              {isBusy ? T.saving : T.save}
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={removeTask}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-danger)] px-4 text-[var(--mobile-font-body)] font-semibold leading-6 text-[var(--mobile-color-danger)] disabled:opacity-45"
            >
              <Trash2 aria-hidden className="h-5 w-5" />
              {T.deleteTask}
            </button>
          </>
        )}
      </div>
    </MobileBottomSheet>
  );
}
