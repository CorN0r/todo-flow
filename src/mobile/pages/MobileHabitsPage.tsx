import { useState } from 'react';
import { Check, Flame, Plus, Target, Timer, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCreateHabit, useHabits, useToggleHabitLog } from '../../hooks/useHabits';
import { cn } from '../../lib/cn';
import { MobileAppBar, MobileChip, MobileEmptyState, MobileIconButton, MobilePage, MobilePageContent } from '../components/MobilePrimitives';

const T = {
  title: '\u4e60\u60ef',
  focus: '\u4e13\u6ce8',
  loading: '\u6b63\u5728\u52a0\u8f7d',
  empty: '\u8fd8\u6ca1\u6709\u4e60\u60ef',
  create: '\u65b0\u589e\u4e60\u60ef',
  placeholder: '\u4e60\u60ef\u540d\u79f0',
  today: '\u4eca\u65e5',
  done: '\u5df2\u6253\u5361',
  check: '\u6253\u5361',
  streak: '\u8fde\u7eed',
  best: '\u6700\u4f73',
  rate: '\u5b8c\u6210\u7387',
  days: '\u5929',
};

const colors = ['#7C72F6', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#EC4899'];

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function MobileHabitsPage() {
  const navigate = useNavigate();
  const { data: habits = [], isLoading } = useHabits();
  const toggleHabit = useToggleHabitLog();
  const createHabit = useCreateHabit();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(colors[0]);
  const today = todayISO();

  const submit = async () => {
    const finalName = name.trim();
    if (!finalName) return;
    await createHabit.mutateAsync({ name: finalName, color });
    setName('');
    setCreating(false);
  };

  return (
    <MobilePage>
      <MobileAppBar
        title={T.title}
        trailing={<MobileIconButton label={T.focus} icon={Timer} onClick={() => navigate('/mobile/focus')} />}
      />
      <MobilePageContent>
        <div className="flex items-center justify-between gap-3">
          <MobileChip active={!creating} onClick={() => setCreating((value) => !value)}>
            <Plus aria-hidden className="h-4 w-4" />
            {T.create}
          </MobileChip>
          <span className="text-[var(--mobile-font-caption)] leading-5 text-[var(--mobile-color-text-muted)]">
            {T.today} {today}
          </span>
        </div>

        {creating && (
          <section className="space-y-3 rounded-[var(--mobile-radius-lg)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] p-3">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
                if (event.key === 'Escape') setCreating(false);
              }}
              placeholder={T.placeholder}
              className="min-h-12 w-full rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface-raised)] px-4 text-[var(--mobile-font-body)] leading-6 text-[var(--mobile-color-text)] outline-none focus:border-[var(--mobile-color-primary)]"
            />
            <div className="flex flex-wrap gap-2">
              {colors.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={item}
                  onClick={() => setColor(item)}
                  className={cn('min-h-11 min-w-11 rounded-full border-2', color === item ? 'border-[var(--mobile-color-primary)]' : 'border-transparent')}
                  style={{ backgroundColor: item }}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={!name.trim()}
              onClick={submit}
              className="flex min-h-12 w-full items-center justify-center rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-primary)] text-[var(--mobile-font-body)] font-semibold leading-6 text-white disabled:opacity-45"
            >
              {T.create}
            </button>
          </section>
        )}

        {isLoading && <MobileEmptyState title={T.loading} />}
        {!isLoading && habits.length === 0 && !creating && <MobileEmptyState title={T.empty} />}

        <div className="space-y-3">
          {habits.map((habit) => (
            <article
              key={habit.id}
              className="rounded-[var(--mobile-radius-lg)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] p-4 shadow-[var(--mobile-shadow-card)]"
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={habit.is_done_today ? T.done : T.check}
                  onClick={() => toggleHabit.mutate({ habitId: habit.id })}
                  className={cn(
                    'flex min-h-12 min-w-12 items-center justify-center rounded-full border-2 transition-colors',
                    habit.is_done_today ? 'text-white' : 'border-[var(--mobile-color-border)] text-transparent',
                  )}
                  style={habit.is_done_today ? { backgroundColor: habit.color, borderColor: habit.color } : undefined}
                >
                  <Check aria-hidden className="h-5 w-5" />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 break-words text-[var(--mobile-font-body)] font-semibold leading-6 text-[var(--mobile-color-text)]">
                      {habit.name}
                    </h2>
                    <span className="rounded-full px-2 py-1 text-[11px] font-medium leading-4 text-white" style={{ backgroundColor: habit.color }}>
                      {habit.frequency}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-surface-raised)] p-2">
                      <div className="flex items-center gap-1 text-[11px] leading-4 text-[var(--mobile-color-text-muted)]">
                        <Flame aria-hidden className="h-3.5 w-3.5 text-[var(--mobile-color-warning)]" />
                        {T.streak}
                      </div>
                      <p className="mt-1 text-[var(--mobile-font-body)] font-semibold leading-6">{habit.current_streak}{T.days}</p>
                    </div>
                    <div className="rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-surface-raised)] p-2">
                      <div className="flex items-center gap-1 text-[11px] leading-4 text-[var(--mobile-color-text-muted)]">
                        <Target aria-hidden className="h-3.5 w-3.5 text-[var(--mobile-color-primary)]" />
                        {T.best}
                      </div>
                      <p className="mt-1 text-[var(--mobile-font-body)] font-semibold leading-6">{habit.best_streak}{T.days}</p>
                    </div>
                    <div className="rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-surface-raised)] p-2">
                      <div className="flex items-center gap-1 text-[11px] leading-4 text-[var(--mobile-color-text-muted)]">
                        <TrendingUp aria-hidden className="h-3.5 w-3.5 text-[var(--mobile-color-success)]" />
                        {T.rate}
                      </div>
                      <p className="mt-1 text-[var(--mobile-font-body)] font-semibold leading-6">{Math.round(habit.completion_rate)}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </MobilePageContent>
    </MobilePage>
  );
}
