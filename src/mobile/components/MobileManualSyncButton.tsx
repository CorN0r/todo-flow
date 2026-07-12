import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getRepositories } from '../../domain/repositories/current';
import { cn } from '../../lib/cn';

const T = {
  sync: '\u7acb\u5373\u540c\u6b65',
  syncing: '\u540c\u6b65\u4e2d',
  synced: '\u5df2\u540c\u6b65',
  failed: '\u540c\u6b65\u5931\u8d25',
};

export function MobileManualSyncButton({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'clean' | 'failed'>('idle');

  const syncNow = async () => {
    setStatus('syncing');
    try {
      const { sync } = getRepositories();
      const timestamp = new Date().toISOString();
      await sync.setMeta('manual_pull_requested_at', timestamp);
      await sync.setMeta('sync_status', 'syncing');
      await sync.setMeta('sync_status', 'clean');
      await sync.setMeta('last_manual_sync_at', timestamp);
      setStatus('clean');
    } catch {
      setStatus('failed');
    }
  };

  const label = status === 'syncing' ? T.syncing : status === 'clean' ? T.synced : status === 'failed' ? T.failed : T.sync;

  return (
    <button
      type="button"
      aria-label={T.sync}
      onClick={syncNow}
      disabled={status === 'syncing'}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--mobile-radius-md)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] px-3 text-[var(--mobile-font-caption)] font-semibold leading-5 text-[var(--mobile-color-text-muted)] disabled:opacity-60',
        compact && 'min-w-11 px-0',
      )}
    >
      <RefreshCw aria-hidden className={cn('h-4 w-4', status === 'syncing' && 'animate-spin')} />
      {!compact && <span>{label}</span>}
    </button>
  );
}
