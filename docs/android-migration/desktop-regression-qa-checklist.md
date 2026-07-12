# Desktop Regression QA Checklist

Run this checklist after the repository and sync metadata changes to confirm Windows behavior remains intact.

## Startup And Shell

- Launch the Windows desktop app from a clean process.
- Confirm sidebar, header, command palette entry, and task detail panel mount normally.
- Confirm Android mobile shell is not selected on desktop.
- Confirm tray and floating widget behavior still uses desktop platform services.

## Tasks And Tags

- Create, edit, complete, reopen, duplicate, reorder, archive/delete, and search tasks.
- Add, edit, delete, and reorder tags.
- Assign a tag to a task and remove it.
- Create parent task and one subtask, then confirm deeper nesting remains blocked by existing rules.

## Calendar, Habits, And Focus

- Calendar views load existing due dates.
- Habit list displays historical stats.
- Habit toggle persists after restart.
- Pomodoro/focus window still opens and hides through desktop controls.

## Attachments And Settings

- Upload a file attachment.
- Upload a link attachment.
- Open an attachment path through the platform adapter.
- Export CSV.
- Import a database backup into a disposable profile.
- Change theme and confirm persistence.

## Sync Metadata Regression

- Existing local rows survive sync migrations.
- Sync disabled or idle state does not change current local delete behavior unexpectedly.
- New sync metadata tables do not appear in user-facing export views unless intentionally included.
- Failed or pending sync operations do not block normal local task operations.
