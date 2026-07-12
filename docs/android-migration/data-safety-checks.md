# Data Safety Checks

Run these checks before enabling sync beta for real user data.

## Backup

- Desktop creates a database backup before first sync enablement.
- Backup destination is visible to the user or documented in release notes.
- Backup failure blocks first sync enablement and leaves local data unchanged.
- Backup can be restored into a disposable profile.

## Sync Disablement

- User can stop manual sync attempts.
- Queued local operations remain local when sync is disabled.
- Re-enabling sync resumes from existing operation ids and cursor metadata.
- Disabling sync does not delete `sync_operations`, `sync_conflicts`, or tombstone metadata without an explicit reset flow.

## Retry

- Transient push failure increments retry count and stores last error.
- Retry uses the same operation id.
- Server duplicate response marks the operation acknowledged without creating another revision.
- Failed pull does not advance local cursor.

## Conflict Recovery

- Same-field conflicts are stored in `sync_conflicts`.
- Conflict records include attempted local payload, remote payload, and field metadata when available.
- User-visible state remains recoverable; local data is not silently discarded.
- Resolving a conflict marks `resolved_at` without deleting audit metadata.

## Tombstones

- Local sync-enabled delete records a delete operation.
- Remote tombstone hides the entity from normal views.
- Repeated pulls do not resurrect a tombstoned entity.
- Child entities and reminders do not reappear independently after parent delete.

## Attachment Metadata

- Sync payload contains attachment metadata only.
- Binary data is transferred through upload handoff, not embedded in task metadata.
- Device-local file paths, content URIs, or Tauri asset URLs are not synced.
- Failed attachment upload does not block task metadata sync.

## Verification Artifacts

- Save before/after database row counts for tasks, tags, reminders, habits, habit logs, attachments, sync operations, and conflicts.
- Save sync server change log revision ranges.
- Save screenshots of clean, pending, failed, and conflicted states.
- Keep the pre-sync backup until beta validation is complete.
