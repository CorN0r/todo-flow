# Android Phase 1 Scope And Feature Gates

## Status

Confirmed for the first Android migration implementation pass.

## Runtime Support

- Minimum supported runtime: Android 10, API 29.
- Primary validation targets: a current Android emulator and at least one physical Android phone before release.
- Tablet and foldable layouts are allowed to adapt after the phone layout is stable, but phone-width behavior is the phase-1 acceptance baseline.

## Phase 1 Product Scope

Phase 1 delivers an offline-capable Android MVP that preserves TodoFlow's core task-management identity while using mobile-native interaction patterns.

In scope:

- Installable Android shell based on Tauri v2 Mobile.
- Phone-first mobile navigation for Today, Tasks, Calendar, Habits, and Settings.
- Local task creation, editing, completion, deletion, priority, due date, reminders, tags, My Day, search, and subtasks.
- Local habit list and today check-in behavior.
- Mobile calendar week strip with agenda list, plus a secondary month overview.
- Mobile focus session surface with local phase transitions.
- Light, Dark, and Lumina mobile themes.
- Local-first persistence through SQLite.
- Sync metadata and UI states required to show clean, pending, syncing, failed, conflicted, and deleted records.

Out of scope for phase 1:

- Public cloud sync as a default-on behavior.
- Rich-text collaborative editing or CRDT support.
- Binary attachment transfer as part of task metadata sync.
- Android home screen widgets.
- Desktop tray, floating desktop windows, desktop right-click menus, hover-only controls, and desktop split-pane behavior.

## Feature Gates

Feature gates make the migration shippable in layers without mixing unfinished Android or sync behavior into the existing desktop app.

| Gate | Default | Purpose | Phase-1 rule |
| --- | --- | --- | --- |
| `mobileShell` | off outside Android builds | Enables mobile routing and mobile-only shell | May be enabled for Android preview builds after navigation smoke tests pass |
| `mobileLocalData` | off outside Android builds | Enables mobile pages to read/write through repository interfaces | May be enabled once memory and desktop adapters pass regression tests |
| `mobileHabits` | off outside Android builds | Enables Android habit list and check-in UI | May be enabled after local habit persistence tests pass |
| `mobileFocus` | off outside Android builds | Enables Android focus session UI | May be enabled after phase transition tests pass |
| `syncMetadata` | off by user default | Adds local sync metadata, operation queue, and status derivation | May ship hidden or opt-in after additive migration tests pass |
| `syncBeta` | off by user default | Enables server push/pull and device registration | Must stay opt-in until cross-device scenarios pass |
| `mobileNotifications` | off until adapter exists | Enables Android notification scheduling for reminders and focus | May be enabled only behind Android platform service boundaries |
| `attachmentHandoff` | off | Enables attachment metadata and binary handoff APIs | Not required for the local MVP |
| `e2eeSync` | off | Reserves end-to-end encryption integration | Deferred until the sync contract and key model are updated |

## Acceptance Baseline

Phase 1 is accepted only when:

- Android can launch into the mobile shell without rendering desktop Sidebar, Header, TaskDetailPanel, or desktop split panes on phone-width screens.
- Core task and habit workflows work after app restart without network access.
- Existing Windows desktop flows keep their current behavior with mobile and sync gates disabled.
- Sync-facing schema changes are additive and covered by migration tests.
- Mobile repeated controls meet at least 44dp touch targets.
