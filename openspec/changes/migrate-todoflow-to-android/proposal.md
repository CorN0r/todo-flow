## Why

TodoFlow is already a mature Windows desktop task manager, but its current local-only desktop architecture prevents users from managing the same task system across phone and desktop. Android is the next natural surface because mobile usage is dominated by quick capture, reminders, habit check-ins, and short review sessions that the desktop experience cannot cover alone.

This change establishes an Android migration plan that preserves TodoFlow's functional depth while redesigning interaction, storage, and synchronization around mobile-first and cross-platform requirements.

## What Changes

- Introduce an Android app experience with mobile-first navigation, touch interactions, quick capture, task detail sheets, reminders, habit check-ins, and mobile-adapted calendar/focus flows.
- Add local-first cross-device synchronization between Windows desktop and Android, with offline writes, sync queues, change logs, tombstone deletes, and deterministic conflict handling.
- Add a versioned Sync Server contract for bootstrap, push, pull, acknowledgements, devices, and future attachment transfer.
- Refactor client data access behind repository interfaces so desktop and mobile UI can share domain behavior without sharing desktop-only layout assumptions.
- Add mobile design system requirements for TodoFlow's visual language, themes, spacing, motion, accessibility, and responsive behavior.
- Add compatibility constraints for future iOS and HarmonyOS clients by keeping domain models, sync contracts, and design tokens platform-neutral.
- Defer or adapt desktop-specific behaviors such as tray, right-click menus, hover controls, global shortcuts, floating desktop widgets, and wide split panes.

## Capabilities

### New Capabilities

- `mobile-task-experience`: Mobile-first Android task, tag, habit, calendar, search, reminder, focus, and settings experience.
- `cross-device-sync`: Local-first synchronization model for desktop, Android, and future clients.
- `sync-server-api`: Versioned server API contract for authentication/device registration, bootstrap, push/pull sync, conflict reporting, and attachment handoff.
- `mobile-design-system`: Mobile visual, interaction, motion, theme, and accessibility requirements.
- `cross-platform-architecture`: Client architecture requirements that keep domain, data access, platform integration, and UI layers portable across Android, iOS, and HarmonyOS.

### Modified Capabilities

- None. There are no existing OpenSpec capabilities in `openspec/specs/` for this repository yet.

## Impact

- Frontend: add mobile-specific React routes/components, bottom navigation, FAB quick add, bottom sheets/full-screen task detail, mobile list gestures, and mobile theme tokens.
- Desktop frontend: introduce repository abstractions around current Tauri `invoke` data access without regressing existing desktop behavior.
- Rust/Tauri backend: add sync metadata migrations, operation queue recording, tombstone delete handling, platform-specific notification/file abstractions, and Android build compatibility.
- Database: extend SQLite tables with sync fields and add sync operation/conflict metadata tables.
- Server: add a new Sync Server with persistent canonical rows, revisioned change log, device registration, and object storage integration for future attachments.
- Testing: add contract tests, sync integration tests, Android device tests, offline/online conflict scenarios, visual QA, and regression coverage for desktop behavior.
- Dependencies: likely add Tauri mobile tooling, server runtime dependencies, PostgreSQL/object storage infrastructure, and mobile notification/background execution adapters.
