## Context

TodoFlow currently ships as a Windows desktop app built with Tauri v2, React 19, TypeScript, Rust, and SQLite. The desktop app is local-first but not yet multi-device: React calls Tauri commands directly through `src/lib/db.ts`, Rust repositories write to local SQLite, and desktop-specific UI patterns such as sidebars, right-click menus, hover controls, floating windows, tray behavior, and global shortcuts are deeply represented in the experience.

The Android migration must solve two problems at once: create a touch-native mobile app and introduce cross-device data synchronization. Treating Android as a narrow responsive version of the desktop UI would preserve implementation surface at the expense of usability. Treating it as a completely separate product would duplicate domain logic and make later iOS/HarmonyOS support expensive.

## Goals / Non-Goals

**Goals:**

- Deliver an Android app that works offline and supports the core TodoFlow task, tag, reminder, habit, calendar, search, and focus workflows.
- Preserve existing desktop behavior while adding sync metadata, operation queues, and sync status.
- Define a local-first synchronization architecture that can support Windows desktop, Android, future iOS, and future HarmonyOS clients.
- Keep mobile UI, platform integrations, domain models, persistence, and sync contracts separated.
- Make mobile interaction feel native to Android: bottom navigation, FAB quick add, bottom sheets/full-screen details, gestures, Android notifications, and adaptive layouts.
- Keep TodoFlow's visual identity while establishing mobile-specific design tokens and accessibility requirements.

**Non-Goals:**

- Do not ship a Web-only cloud version in this change.
- Do not require every desktop-only feature to appear in Android phase 1.
- Do not implement rich-text CRDT collaboration in the first sync version.
- Do not sync desktop-only settings such as window position, tray state, global shortcuts, or floating widget coordinates.
- Do not make HarmonyOS a first implementation target; keep contracts portable enough for a later client.

## Decisions

### Decision 1: Use Tauri v2 Mobile as the first Android app shell

Use Tauri v2 Mobile with the existing React/TypeScript frontend and Rust backend as the primary route for Android. Add mobile-specific routes and components instead of reusing desktop layout components.

Alternatives considered:

- Kotlin + Jetpack Compose: best native Android ergonomics but requires rebuilding UI and data access from scratch.
- Flutter: strong cross-platform UI story but would bypass most existing React/Rust UI investment.
- Responsive desktop React only: fastest prototype but poor mobile ergonomics and high long-term product risk.

Rationale: the current application already uses Tauri, React, Rust, and SQLite. Tauri Mobile provides the shortest path to an installable Android app while still allowing a later native fallback if device testing exposes unacceptable platform limitations.

### Decision 2: Introduce repository interfaces before mobile UI depends on data access

Move UI-facing data operations behind domain repository interfaces such as `TaskRepository`, `TagRepository`, `HabitRepository`, `ReminderRepository`, and `SyncRepository`. Desktop adapters can wrap existing Tauri `invoke` calls; mobile adapters can use the same commands or mobile-specific platform services.

Rationale: current React code directly imports Tauri command wrappers. That makes desktop UI, command naming, and persistence assumptions leak into every page. Repository interfaces let mobile UI be developed independently and give tests a memory adapter.

### Decision 3: Use local-first sync with queued operations and server revisions

Every client keeps a complete local SQLite database. Writes are applied locally first, recorded in `sync_operations`, and later pushed to the Sync Server. Pull responses deliver revisioned changes. Deletes use tombstones. Conflicts are resolved deterministically where safe and stored in `sync_conflicts` where user review is needed.

Alternatives considered:

- Server-authoritative online-only app: simpler conflict model but violates TodoFlow's local-first identity and breaks offline mobile usage.
- File-level database sync: tempting for SQLite but unsafe across platforms and poor for conflict resolution.
- Full CRDT for all entities in phase 1: robust but too heavy for the first migration.

Rationale: task management needs reliable offline capture and cross-device continuity. Operation-based local-first sync gives the right reliability without overbuilding collaboration features.

### Decision 4: Use a versioned Sync Server API

Add a Sync Server with explicit `/v1` contracts for auth/device registration, bootstrap, push, pull, acknowledgement, and attachment handoff. Store canonical entities and server revisions in PostgreSQL; store large attachment binaries in object storage.

Rationale: Android, Windows, iOS, and HarmonyOS should all integrate through the same stable contract. The server must not know about desktop UI concepts or Android-only UI state.

### Decision 5: Treat reminders as synchronized configuration, not synchronized delivery state

Sync task reminder definitions across devices, but schedule and fire notifications per device. Do not globally sync a single `reminded` flag as the source of truth for whether every device should notify.

Rationale: if a desktop reminder fires while the phone is offline, the phone may still need to notify later depending on local policy. Delivery is a device behavior; reminder configuration is shared data.

### Decision 6: Adapt desktop features into mobile equivalents

Mobile shall not copy desktop-specific interactions. Examples:

- Sidebar becomes bottom navigation plus secondary lists.
- Right-click menus become long-press action sheets.
- Hover controls become explicit buttons or swipe actions.
- Split details become bottom sheet or full-screen detail.
- Floating desktop widgets become Android notifications, focus page, and later home screen widgets.

Rationale: preserving the information architecture matters more than preserving desktop mechanics.

### Decision 7: Separate attachment metadata sync from binary transfer

First sync task/habit/tag/reminder metadata. Then add attachment metadata and binary upload/download. Rich-text embedded data URLs should be migrated toward internal attachment references.

Rationale: current rich text can contain base64 image data. Syncing large HTML payloads repeatedly would be inefficient and fragile. Metadata-first attachment sync lets normal task sync remain fast.

### Decision 8: Export design tokens as platform-neutral data

Create mobile design tokens for colors, spacing, typography, radius, elevation, and motion. Keep token names platform-neutral and consumable by React, Android native, iOS, and HarmonyOS clients.

Rationale: future platforms should inherit TodoFlow's visual system without copying Tailwind class names or desktop CSS implementation details.

## Risks / Trade-offs

- Tauri Android plugin or WebView behavior may be insufficient for notifications, background work, file access, or input handling -> Validate with a phase 1 device proof of concept and keep Kotlin Compose as a fallback UI route.
- Sync bugs can cause data loss -> Use tombstones, local operation queues, conflict records, idempotent server operations, and automatic pre-sync desktop database backup.
- Rich text image payloads may be too large for fast sync -> Limit first-version payload size and migrate embedded images into attachment objects.
- Mobile UI may drift from desktop feature parity -> Define mobile requirements by user workflow rather than pixel parity, and track deferred desktop capabilities explicitly.
- Adding sync metadata to existing tables can regress desktop behavior -> Keep migrations additive, preserve current commands, and run desktop regression tests before enabling sync.
- Server infrastructure increases operational complexity -> Keep the v1 API narrow, contract-tested, and optional behind an explicit sync mode.

## Migration Plan

1. Create OpenSpec specs and task plan for the Android migration.
2. Add repository interfaces and adapters while keeping desktop behavior unchanged.
3. Add SQLite sync metadata migrations and operation queue recording behind feature-safe code paths.
4. Build Android local MVP with mobile routes, local persistence, core task operations, tags, reminders, habits, search, and mobile themes.
5. Implement Sync Server v1 and desktop/Android push-pull integration for tasks, tags, and reminders.
6. Expand sync to habits and habit logs, then reminders and Android notification scheduling.
7. Add attachment metadata, binary transfer, rich-text image migration, focus timer, and advanced mobile views.
8. Validate iOS proof of concept and HarmonyOS integration approach using the same sync contract and design tokens.

Rollback strategy:

- Keep sync opt-in until stable.
- Before first sync enablement, create a local database backup.
- Additive migrations should allow old desktop behavior to continue even when sync is disabled.
- If server sync is disabled, clients continue operating against local SQLite and retain queued operations.

## Open Questions

- Which authentication method should be used first: email code, passkey, local device pairing, or self-hosted token?
- Is end-to-end encryption required for the first public sync release, or should v1 ship with TLS plus encrypted-at-rest server storage and reserve E2EE fields?
- Should Android phase 1 use Tauri notification plugins only, or introduce a native Android notification bridge immediately?
- What payload size limit should trigger rich-text image migration warnings?
- Should mobile task detail default to bottom sheet or full-screen route on small phones?
