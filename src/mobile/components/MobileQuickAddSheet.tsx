import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarDays, Flag, Plus, Sun, Tag as TagIcon } from 'lucide-react';
import { useCreateTask, useCreateTaskReminder } from '../../hooks/useTasks';
import { useTags } from '../../hooks/useTags';
import { MobileBottomSheet, MobileChip, MobileSyncBadge } from './MobilePrimitives';

type DueChoice = 'none' | 'today' | 'tomorrow';
type ReminderChoice = '' | 'at_due_time' | '5m' | '1h' | '1d';

const priorityOptions = [
  { value: 0, label: '无' },
  { value: 1, label: '低' },
  { value: 2, label: '中' },
  { value: 3, label: '高' },
  { value: 4, label: '紧急' },
];

const reminderOptions: { value: ReminderChoice; label: string }[] = [
  { value: '', label: '无提醒' },
  { value: 'at_due_time', label: '到期时' },
  { value: '5m', label: '提前 5 分钟' },
  { value: '1h', label: '提前 1 小时' },
  { value: '1d', label: '提前 1 天' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dueChoiceToDate(choice: DueChoice) {
  if (choice === 'today') return todayISO();
  if (choice === 'tomorrow') return tomorrowISO();
  return undefined;
}

export function MobileQuickAddSheet({
  open,
  onClose,
  defaultDue = 'today',
  defaultMyDay = true,
}: {
  open: boolean;
  onClose: () => void;
  defaultDue?: DueChoice;
  defaultMyDay?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<DueChoice>(defaultDue);
  const [myDay, setMyDay] = useState(defaultMyDay);
  const [priority, setPriority] = useState(0);
  const [tagId, setTagId] = useState('');
  const [reminder, setReminder] = useState<ReminderChoice>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const createTask = useCreateTask();
  const createReminder = useCreateTaskReminder();
  const { data: tags = [] } = useTags();

  useEffect(() => {
    if (!open) return;
    setDue(defaultDue);
    setMyDay(defaultMyDay);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [defaultDue, defaultMyDay, open]);

  const selectedTag = useMemo(() => tags.find((tag) => tag.id === tagId), [tagId, tags]);
  const dueDate = dueChoiceToDate(due);
  const canSubmit = title.trim().length > 0 && !createTask.isPending;

  const reset = () => {
    setTitle('');
    setPriority(0);
    setTagId('');
    setReminder('');
    setDue(defaultDue);
    setMyDay(defaultMyDay);
  };

  const submit = async () => {
    const finalTitle = title.trim();
    if (!finalTitle) return;
    const task = await createTask.mutateAsync({
      title: finalTitle,
      due_date: dueDate,
      my_day_date: myDay ? todayISO() : null,
      priority: priority > 0 ? priority : undefined,
      tag_id: tagId || undefined,
      reminder: reminder || undefined,
    });
    if (reminder && task.id) {
      createReminder.mutate({ taskId: task.id, offset: reminder, dueDate });
    }
    reset();
    onClose();
  };

  return (
    <MobileBottomSheet title="新增任务" open={open} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-3 py-2">
          <span className="text-[var(--mobile-font-caption)] font-medium leading-5 text-[var(--mobile-color-text-muted)]">
            {'\u672c\u5730\u4f18\u5148'}
          </span>
          <MobileSyncBadge status="pending" />
        </div>

        <label className="block">
          <span className="mb-2 block text-[var(--mobile-font-caption)] font-medium text-[var(--mobile-color-text-muted)]">
            标题
          </span>
          <input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="写下要做的事"
            className="min-h-12 w-full rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-4 text-[var(--mobile-font-body)] text-[var(--mobile-color-text)] outline-none focus:border-[var(--mobile-color-primary)]"
          />
        </label>

        <div>
          <p className="mb-2 text-[var(--mobile-font-caption)] font-medium text-[var(--mobile-color-text-muted)]">日期</p>
          <div className="flex flex-wrap gap-2">
            <MobileChip active={due === 'none'} onClick={() => setDue('none')}>
              <CalendarDays aria-hidden className="h-4 w-4" />
              无日期
            </MobileChip>
            <MobileChip active={due === 'today'} onClick={() => setDue('today')}>
              今天
            </MobileChip>
            <MobileChip active={due === 'tomorrow'} onClick={() => setDue('tomorrow')}>
              明天
            </MobileChip>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[var(--mobile-font-caption)] font-medium text-[var(--mobile-color-text-muted)]">优先级</p>
          <div className="flex flex-wrap gap-2">
            {priorityOptions.map((option) => (
              <MobileChip key={option.value} active={priority === option.value} onClick={() => setPriority(option.value)}>
                <Flag aria-hidden className="h-4 w-4" />
                {option.label}
              </MobileChip>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[var(--mobile-font-caption)] font-medium text-[var(--mobile-color-text-muted)]">提醒</p>
          <div className="flex flex-wrap gap-2">
            {reminderOptions.map((option) => (
              <MobileChip key={option.value || 'none'} active={reminder === option.value} onClick={() => setReminder(option.value)}>
                <Bell aria-hidden className="h-4 w-4" />
                {option.label}
              </MobileChip>
            ))}
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <p className="mb-2 text-[var(--mobile-font-caption)] font-medium text-[var(--mobile-color-text-muted)]">标签</p>
            <div className="flex flex-wrap gap-2">
              <MobileChip active={!tagId} onClick={() => setTagId('')}>
                <TagIcon aria-hidden className="h-4 w-4" />
                无标签
              </MobileChip>
              {tags.map((tag) => (
                <MobileChip key={tag.id} active={tagId === tag.id} onClick={() => setTagId(tag.id)}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </MobileChip>
              ))}
            </div>
          </div>
        )}

        <label className="flex min-h-11 items-center justify-between rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-4">
          <span className="inline-flex items-center gap-2 text-[var(--mobile-font-body)] text-[var(--mobile-color-text)]">
            <Sun aria-hidden className="h-4 w-4 text-[var(--mobile-color-warning)]" />
            加入我的一天
          </span>
          <input
            type="checkbox"
            checked={myDay}
            onChange={(event) => setMyDay(event.target.checked)}
            className="h-5 w-5 accent-[var(--mobile-color-primary)]"
          />
        </label>

        {selectedTag && (
          <p className="text-[var(--mobile-font-caption)] text-[var(--mobile-color-text-muted)]">
            将创建到标签：{selectedTag.name}
          </p>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-primary)] px-4 text-[var(--mobile-font-body)] font-semibold text-white transition-colors active:bg-[var(--mobile-color-primary-pressed)] disabled:opacity-45"
        >
          <Plus aria-hidden className="h-5 w-5" />
          创建任务
        </button>
      </div>
    </MobileBottomSheet>
  );
}
