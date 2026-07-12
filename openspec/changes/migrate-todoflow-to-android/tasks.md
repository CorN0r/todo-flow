## 1. Project Preparation

- [x] 1.1 Confirm Android migration scope, supported Android version range, and phase-1 feature gates
- [x] 1.2 Add an ADR for choosing Tauri v2 Mobile as the first Android implementation route
- [x] 1.3 Add an ADR for the local-first sync strategy and deferred E2EE decision
- [x] 1.4 Add an ADR for the mobile design system and token strategy
- [x] 1.5 Document phase-1 non-goals for desktop tray, desktop floating widget, right-click menus, hover controls, and desktop split panes on Android

## 2. Client Architecture Foundation

- [x] 2.1 Create domain model modules for tasks, tags, reminders, habits, habit logs, attachments, settings, and sync metadata
- [x] 2.2 Define repository interfaces for task, tag, reminder, habit, attachment, settings, and sync operations
- [x] 2.3 Implement desktop repository adapters that wrap the existing Tauri invoke APIs
- [x] 2.4 Refactor shared hooks to depend on repository interfaces instead of importing `src/lib/db.ts` directly
- [x] 2.5 Add memory repository adapters for unit tests and mobile UI development
- [x] 2.6 Add regression tests proving existing desktop task, tag, reminder, habit, and settings flows still work through the new adapters

## 3. Storage And Sync Metadata

- [x] 3.1 Add SQLite migrations for `sync_meta`, `sync_operations`, and `sync_conflicts`
- [x] 3.2 Add additive sync columns to tasks, task reminders, tags, attachments, habits, habit logs, and syncable settings
- [x] 3.3 Add migration tests that upgrade an existing desktop database without losing current rows
- [x] 3.4 Implement local operation recording for create, update, reorder, and delete operations on syncable entities
- [x] 3.5 Implement tombstone delete handling for sync-enabled deletes while preserving current local delete behavior when sync is disabled
- [x] 3.6 Add sync status derivation for clean, pending, syncing, failed, conflicted, and deleted states
- [x] 3.7 Add operation retry metadata updates with retry count and last error

## 4. Android App Shell

- [x] 4.1 Configure Tauri Android build prerequisites and verify a minimal Android build starts on emulator or device
- [x] 4.2 Add mobile app entry routing that selects mobile layout on Android without changing desktop startup routes
- [x] 4.3 Create a mobile-only shell with bottom navigation for Today, Tasks, Calendar, Habits, and Settings
- [x] 4.4 Ensure phone-width Android rendering never mounts desktop Sidebar, Header, TaskDetailPanel, or desktop split-pane shell
- [x] 4.5 Add Android-safe platform service boundaries for notifications, file access, share intents, and background work placeholders
- [x] 4.6 Add smoke tests or screenshots for Android app launch and primary navigation

## 5. Mobile Design System

- [x] 5.1 Define mobile design tokens for colors, typography, spacing, radius, elevation, and motion
- [x] 5.2 Implement Light, Dark, and Lumina mobile themes from the token set
- [x] 5.3 Build reusable mobile primitives for app bars, bottom navigation, FAB, bottom sheets, action sheets, chips, icon buttons, empty states, and sync badges
- [x] 5.4 Validate repeated interactive controls meet at least 44dp touch targets
- [x] 5.5 Validate mobile text does not overlap or clip under system font scaling
- [x] 5.6 Add visual checks for task cards with due date, priority, tag, reminder, and sync state
- [x] 5.7 Add motion timings for opening task detail, quick add, action sheets, and navigation transitions

## 6. Mobile Task Experience

- [x] 6.1 Implement Today mobile page with due today, My Day, overdue entry, and quick completion
- [x] 6.2 Implement Tasks mobile page with all tasks, incomplete/completed filters, tags entry, sorting, and search entry
- [x] 6.3 Implement global FAB quick add with title, due date, reminder, tag, priority, and My Day controls
- [x] 6.4 Implement mobile task card completion toggle with immediate local update
- [x] 6.5 Implement task card tap to open mobile task detail
- [x] 6.6 Implement long-press task action sheet or multi-select entry without right-click dependency
- [x] 6.7 Implement mobile task detail editing for title, completion, priority, due date, reminders, tag, recurrence, description, and delete
- [x] 6.8 Implement mobile subtask creation, toggle, and deletion while enforcing TodoFlow's two-level nesting rule
- [x] 6.9 Implement sync state indicators in mobile quick add, task card, and task detail
- [x] 6.10 Add offline tests for creating, editing, completing, deleting, and reopening tasks on Android

## 7. Mobile Calendar, Habits, And Focus

- [x] 7.1 Implement mobile calendar week strip with agenda list for selected date
- [x] 7.2 Implement mobile month overview with task count markers
- [x] 7.3 Implement habit list and today check-in controls
- [x] 7.4 Update habit streak and completion display immediately after local check-in
- [x] 7.5 Implement mobile focus session page associated with optional task id
- [x] 7.6 Implement local focus phase transitions for focus, short break, and long break
- [x] 7.7 Add Android notification placeholder or adapter for focus phase completion
- [x] 7.8 Add tests for calendar date filtering, habit check-in persistence, and focus state transitions

## 8. Sync Server API

- [x] 8.1 Create a Sync Server project with versioned `/v1` API namespace
- [x] 8.2 Define machine-readable OpenAPI contract for auth, device registration, bootstrap, push, pull, ack, and attachment handoff
- [x] 8.3 Implement persistent canonical entity tables and revisioned change log in PostgreSQL or selected server database
- [x] 8.4 Implement device registration with stable device identifiers
- [x] 8.5 Implement bootstrap response for tasks, tags, reminders, habits, habit logs, syncable settings, and initial cursor
- [x] 8.6 Implement idempotent push operation batches keyed by operation id
- [x] 8.7 Implement pull changes by cursor with revision ordering and next cursor
- [x] 8.8 Implement acknowledgement endpoint for applied cursor or operation progress
- [x] 8.9 Implement attachment upload initialization without transferring binary data in task metadata sync
- [x] 8.10 Add API contract tests for all request and response shapes

## 9. Client Sync Engine

- [x] 9.1 Implement SyncRepository methods for bootstrap, push, pull, ack, and sync status
- [x] 9.2 Implement desktop sync loop for queued operations and incremental pull
- [x] 9.3 Implement Android sync loop for queued operations and incremental pull
- [x] 9.4 Implement idempotent local application of remote creates, updates, reorders, and tombstone deletes
- [x] 9.5 Implement field-level conflict rules for task scalar fields, tag references, reminders, habits, habit logs, sort order, and rich text description fallback
- [x] 9.6 Store unresolved or lossy conflicts in `sync_conflicts`
- [x] 9.7 Keep reminder definitions syncable while scheduling notification delivery per device
- [x] 9.8 Add UI surfaces for pending sync, sync in progress, sync failure, and conflict states
- [x] 9.9 Add manual pull-to-sync or refresh action in Android Settings and task lists
- [x] 9.10 Add desktop database backup before first sync enablement

## 10. Cross-Device Integration Scenarios

- [x] 10.1 Test desktop-created task appears on Android after sync
- [x] 10.2 Test Android-created offline task appears on desktop after reconnect and sync
- [x] 10.3 Test desktop due date edit and Android title edit merge into one task
- [x] 10.4 Test same-field task conflict resolves by documented ordering and records metadata
- [x] 10.5 Test local delete sync hides entity on the other client without resurrection
- [x] 10.6 Test desktop-created reminder syncs to Android and schedules local delivery
- [x] 10.7 Test Android habit check-in syncs to desktop stats
- [x] 10.8 Test failed sync retry does not duplicate remote changes

## 11. Future Platform Readiness

- [x] 11.1 Export design tokens in a platform-neutral JSON format
- [x] 11.2 Document platform service contracts for notification, file, share, storage, and background sync adapters
- [x] 11.3 Verify sync payloads contain no Windows-only or Android-only UI fields
- [x] 11.4 Create a small future-client compatibility test that consumes sync contract types without React dependencies
- [x] 11.5 Document iOS proof-of-concept prerequisites and HarmonyOS client options

## 12. Release Readiness

- [x] 12.1 Add Android MVP manual QA checklist for install, launch, offline usage, task workflows, habits, calendar, themes, and sync states
- [x] 12.2 Add desktop regression QA checklist for existing Windows behavior after repository and sync metadata changes
- [x] 12.3 Add performance checks for Android startup, 1000-task list scrolling, and first/incremental sync timing
- [x] 12.4 Add data safety checks for backup, sync disablement, retry, and conflict recovery
- [x] 12.5 Prepare phased release notes for local MVP, sync beta, and advanced feature migration
