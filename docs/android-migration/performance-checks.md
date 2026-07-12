# Android And Sync Performance Checks

These checks define release gates for the Android MVP and sync beta. Record device model, OS version, build id, and dataset size for every run.

## Android Startup

Dataset:

- Fresh install with empty database.
- Existing user database with at least 1000 tasks, 100 tags, 50 habits, and 200 habit logs.

Measure:

- Cold start from launcher tap to first usable mobile screen.
- Warm start from background to first usable mobile screen.

Targets:

- Empty database cold start: 2.5 seconds or less on a mid-range Android device.
- 1000-task cold start: 4.0 seconds or less.
- Warm start: 1.0 second or less.

Fail conditions:

- Blank screen longer than 1 second after webview is visible.
- Desktop shell flashes before mobile shell.
- Main thread jank prevents tapping bottom navigation after first render.

## 1000-Task List Scrolling

Dataset:

- 1000 incomplete tasks.
- 250 completed tasks.
- 100 overdue tasks.
- 100 tasks with tags, reminders, and priority indicators.

Measure:

- Open Tasks tab.
- Search for a term matching 100 tasks.
- Switch incomplete/completed filters.
- Scroll top to bottom and back.

Targets:

- Filter/search response: 300 ms or less after input settles.
- Sustained scroll should remain visually smooth with no repeated layout jumps.
- Task card text and badges must not overlap at normal and large system font sizes.

Fail conditions:

- Repeated full-page blanking during scroll.
- FAB or bottom navigation covers active list rows without safe padding.
- Search or filter loses local changes.

## First Sync Timing

Dataset:

- 1000 tasks.
- 100 tags.
- 50 reminders.
- 50 habits.
- 200 habit logs.
- 50 attachment metadata rows without binary upload.

Measure:

- First desktop sync enablement including pre-sync backup.
- First Android bootstrap and pull.
- Server push/pull response times.

Targets:

- Desktop pre-sync backup finishes before the first push.
- First bootstrap response returns in 5 seconds or less on local test server.
- Client local apply finishes in 5 seconds or less for the dataset.
- Sync UI remains responsive while status is `syncing`.

Fail conditions:

- Backup skipped on first desktop enablement.
- Duplicate entities appear after retry.
- Tombstoned rows resurrect.

## Incremental Sync Timing

Dataset:

- Existing synced dataset from first sync.
- 10 task edits, 3 task creates, 2 deletes, 2 habit logs, and 1 reminder update.

Targets:

- Incremental push and pull complete in 1.5 seconds or less on local test server.
- Cursor advances only after local apply succeeds.
- Retry with the same operation ids does not create duplicate remote revisions.

Artifacts:

- Save logs for push count, pull count, conflict count, cursor before/after, and elapsed time.
- Save screenshots of pending, syncing, failed, and clean states when manually testing UI.
