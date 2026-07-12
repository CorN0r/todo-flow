import { useEffect, useState } from 'react';
import { Database, ShieldCheck, Wifi } from 'lucide-react';
import { getRepositories } from '../../domain/repositories/current';
import { MobileManualSyncButton } from '../components/MobileManualSyncButton';
import { MobileAppBar, MobilePage, MobilePageContent, MobileSyncBadge } from '../components/MobilePrimitives';

const T = {
  title: '\u8bbe\u7f6e',
  sync: '\u540c\u6b65',
  status: '\u72b6\u6001',
  cursor: '\u6e38\u6807',
  lastManual: '\u4e0a\u6b21\u624b\u52a8\u540c\u6b65',
  backup: '\u9996\u6b21\u540c\u6b65\u524d\u5907\u4efd',
  notYet: '\u5c1a\u672a\u6267\u884c',
};

export function MobileSettingsPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [lastManual, setLastManual] = useState<string | null>(null);
  const [backupAt, setBackupAt] = useState<string | null>(null);

  useEffect(() => {
    const { sync } = getRepositories();
    Promise.all([
      sync.getMeta('sync_status'),
      sync.getMeta('sync_cursor'),
      sync.getMeta('last_manual_sync_at'),
      sync.getMeta('sync_preflight_backup_at'),
    ]).then(([nextStatus, nextCursor, nextManual, nextBackup]) => {
      setStatus(nextStatus ?? 'clean');
      setCursor(nextCursor ?? '0');
      setLastManual(nextManual);
      setBackupAt(nextBackup);
    }).catch(() => setStatus('failed'));
  }, []);

  return (
    <MobilePage>
      <MobileAppBar title={T.title} />
      <MobilePageContent>
        <section className="space-y-3 rounded-[var(--mobile-radius-lg)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] p-4 shadow-[var(--mobile-shadow-card)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Wifi aria-hidden className="h-5 w-5 text-[var(--mobile-color-primary)]" />
              <h2 className="text-[var(--mobile-font-body)] font-semibold leading-6 text-[var(--mobile-color-text)]">{T.sync}</h2>
            </div>
            <MobileManualSyncButton />
          </div>

          <div className="grid gap-2 text-[var(--mobile-font-caption)] leading-5 text-[var(--mobile-color-text-muted)]">
            <div className="flex items-center justify-between gap-3 rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-surface-raised)] px-3 py-2">
              <span>{T.status}</span>
              <MobileSyncBadge status={status} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-surface-raised)] px-3 py-2">
              <span>{T.cursor}</span>
              <span>{cursor ?? '0'}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[var(--mobile-radius-md)] bg-[var(--mobile-color-surface-raised)] px-3 py-2">
              <span>{T.lastManual}</span>
              <span className="min-w-0 break-words text-right">{lastManual ?? T.notYet}</span>
            </div>
          </div>
        </section>

        <section className="space-y-2 rounded-[var(--mobile-radius-lg)] border border-[var(--mobile-color-border)] bg-[var(--mobile-color-surface)] p-4">
          <div className="flex items-center gap-2 text-[var(--mobile-font-body)] font-semibold leading-6">
            <ShieldCheck aria-hidden className="h-5 w-5 text-[var(--mobile-color-success)]" />
            {T.backup}
          </div>
          <div className="flex items-center gap-2 text-[var(--mobile-font-caption)] leading-5 text-[var(--mobile-color-text-muted)]">
            <Database aria-hidden className="h-4 w-4" />
            <span className="min-w-0 break-words">{backupAt ?? T.notYet}</span>
          </div>
        </section>
      </MobilePageContent>
    </MobilePage>
  );
}
