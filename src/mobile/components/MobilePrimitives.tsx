import type { ComponentType, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

export function MobileAppBar({
  title,
  eyebrow = 'TodoFlow',
  trailing,
}: {
  title: string;
  eyebrow?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="flex min-h-16 items-center justify-between gap-3 px-[var(--mobile-space-page-x)] pt-[max(env(safe-area-inset-top),0px)]">
      <div className="min-w-0">
        <p className="text-[var(--mobile-font-caption)] font-medium text-[var(--mobile-color-text-muted)]">{eyebrow}</p>
        <h1 className="truncate text-[var(--mobile-font-title)] font-semibold leading-tight text-[var(--mobile-color-text)]">
          {title}
        </h1>
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  );
}

export function MobilePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('flex min-h-0 flex-1 flex-col pb-[calc(var(--mobile-space-bottom-nav)+24px)]', className)}
    >
      {children}
    </section>
  );
}

export function MobilePageContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[var(--mobile-space-page-x)] pt-4', className)}>
      {children}
    </div>
  );
}

export function MobileIconButton({
  label,
  icon: Icon,
  onClick,
  className,
}: {
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex min-h-11 min-w-11 items-center justify-center rounded-[var(--mobile-radius-md)] text-[var(--mobile-color-text-muted)] transition-colors',
        'hover:bg-[var(--mobile-color-primary-container)] hover:text-[var(--mobile-color-primary)]',
        className,
      )}
    >
      <Icon aria-hidden className="h-5 w-5" />
    </button>
  );
}

export function MobileFab({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed bottom-[calc(var(--mobile-space-bottom-nav)+12px)] right-5 z-30 flex min-h-14 min-w-14 items-center justify-center rounded-full bg-[var(--mobile-color-primary)] text-white shadow-[var(--mobile-shadow-fab)] transition-transform active:scale-95"
    >
      <Icon aria-hidden className="h-6 w-6" />
    </button>
  );
}

export function MobileBottomSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="关闭"
        className="mobile-scrim-enter absolute inset-0 h-full w-full bg-black/35"
        data-motion="mobile-scrim"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mobile-sheet-enter absolute inset-x-0 bottom-0 flex max-h-[min(88dvh,720px)] flex-col overflow-hidden rounded-t-[var(--mobile-radius-sheet)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface-raised)] px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3 text-[var(--mobile-color-text)] shadow-[var(--mobile-shadow-sheet)]"
        data-motion="mobile-sheet"
        style={{
          transition: `transform var(--mobile-motion-normal) var(--mobile-motion-easing)`,
        }}
      >
        <div className="mx-auto mb-3 h-1 w-11 rounded-full bg-[var(--mobile-color-border)]" />
        <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
          <h2 className="text-[var(--mobile-font-subtitle)] font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--mobile-radius-md)] text-[var(--mobile-color-text-muted)]"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}

export function MobileChip({
  active = false,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border px-4 text-[var(--mobile-font-caption)] font-medium leading-5 transition-colors',
        active
          ? 'border-[var(--mobile-color-primary)] bg-[var(--mobile-color-primary-container)] text-[var(--mobile-color-primary)]'
          : 'border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] text-[var(--mobile-color-text-muted)]',
      )}
    >
      {children}
    </button>
  );
}

export function MobileEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-[var(--mobile-radius-lg)] border border-dashed border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-5 text-center text-[var(--mobile-color-text-muted)]">
      <p className="text-[var(--mobile-font-body)] font-medium text-[var(--mobile-color-text)]">{title}</p>
      {description && <p className="mt-1 text-[var(--mobile-font-caption)] leading-5">{description}</p>}
      {action}
    </div>
  );
}

export function MobileSyncBadge({ status }: { status?: string | null }) {
  if (!status || status === 'clean') return null;
  const label = status === 'pending' ? '待同步' : status === 'failed' ? '同步失败' : status;
  return (
    <span className="inline-flex max-w-full items-center rounded-full bg-[var(--mobile-color-primary-container)] px-2 py-0.5 text-[11px] font-medium leading-4 text-[var(--mobile-color-primary)]">
      {label}
    </span>
  );
}
