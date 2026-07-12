# Phased Release Notes

## Phase 1: Android Local MVP

Scope:

- Android mobile shell with bottom navigation for Today, Tasks, Calendar, Habits, and Settings.
- Touch-first task cards, task detail sheet, quick add sheet, and long-press action sheet.
- Offline local task create, edit, complete, reopen, delete, and subtask workflows.
- Mobile calendar agenda/month markers.
- Habit review and today check-in.
- Mobile focus session page with notification placeholder.
- Light, Dark, and Lumina mobile themes.

Known limits:

- Desktop tray, floating widget, hover controls, split panes, and right-click menus remain desktop-only.
- Sync may be hidden behind beta gates until server and account flows are ready.
- Attachment binary transfer is not part of the local MVP.

Upgrade notes:

- Existing desktop data remains local.
- Android local data should be treated as device-local until sync beta is enabled.

## Phase 2: Sync Beta

Scope:

- Versioned `/v1` Sync Server contract.
- Device registration with stable device ids.
- Bootstrap, push, pull, ack, and attachment upload initialization.
- Local-first operation queue with retries.
- Cursor-based incremental pull.
- Tombstone deletes.
- Deterministic field-level task conflict handling.
- Reminder definitions sync across devices while notification delivery remains per device.
- Manual sync entry points in Android Settings and task list app bars.
- Desktop pre-sync database backup.

Known limits:

- Conflict review UI is minimal; unresolved conflicts are stored for recovery and later review.
- Rich text descriptions with embedded data are summarized in conflict metadata and should move toward attachment references.
- Attachment metadata sync is available before full binary upload/download UX.

Beta safety notes:

- Keep pre-sync backups until validation is complete.
- Do not delete sync metadata tables while beta testing.
- Report sync failures with operation id, cursor, device id, and server revision.

## Phase 3: Advanced Feature Migration

Scope candidates:

- Full attachment binary sync.
- Conflict review and manual resolution UI.
- Android background sync policy.
- Native notification scheduling and permission flows.
- Performance tuning for large task lists.
- iOS proof-of-concept.
- HarmonyOS client exploration.
- Optional end-to-end encryption design after sync behavior stabilizes.

Compatibility notes:

- Future clients should consume `sync-server/openapi.json`.
- Future UI clients should consume `docs/android-migration/mobile-design-tokens.json`.
- Platform services must stay behind the documented repository contracts.
