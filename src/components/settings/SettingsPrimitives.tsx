import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function SettingsSectionHeader({
  title,
  description,
  trailing,
}: {
  title: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h4 className="text-[13px] font-semibold text-[#111827] dark:text-white/90">{title}</h4>
        {description && (
          <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5">{description}</p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

export function SettingsCard({
  children,
  divided = false,
  className,
}: {
  children: ReactNode;
  divided?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32]',
        divided && 'divide-y divide-[#F3F4F6] dark:divide-white/[0.06]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsRow({
  icon,
  title,
  description,
  control,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 px-4 py-3.5', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && <div className="text-[#6B7280] mt-0.5 shrink-0">{icon}</div>}
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-[#111827] dark:text-white/90">{title}</div>
          {description && (
            <p className="text-[11.5px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsToggle({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50',
        checked ? 'bg-[#7C72F6]' : 'bg-[#D1D5DB] dark:bg-white/[0.15]',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
