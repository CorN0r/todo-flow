## ADDED Requirements

### Requirement: Layered client architecture
Client code SHALL separate domain models, repository interfaces, platform adapters, and UI components.

#### Scenario: Mobile UI reads tasks
- **WHEN** a mobile task list needs tasks
- **THEN** it calls a repository interface rather than directly invoking a desktop Tauri command wrapper

### Requirement: Desktop behavior preservation
Architecture changes for Android SHALL preserve existing desktop workflows unless a separate requirement explicitly changes them.

#### Scenario: Desktop task update
- **WHEN** the desktop user edits a task after repository abstraction is introduced
- **THEN** the existing desktop edit behavior remains functionally equivalent

### Requirement: Platform-specific services
Platform-specific capabilities SHALL be isolated behind service boundaries.

#### Scenario: Schedule notification
- **WHEN** a reminder needs local notification scheduling
- **THEN** the app calls a platform notification service rather than embedding Android or Windows APIs in domain logic

### Requirement: Portable sync contract
The sync contract SHALL be usable by Windows desktop, Android, future iOS, and future HarmonyOS clients without requiring platform-specific payload fields.

#### Scenario: Future client pulls tasks
- **WHEN** a future iOS or HarmonyOS client calls the sync API with a valid account and cursor
- **THEN** the server returns the same canonical entity shapes used by desktop and Android

### Requirement: Additive storage migration
SQLite schema changes for sync SHALL be additive where possible and SHALL avoid breaking existing local desktop data.

#### Scenario: Upgrade existing desktop database
- **WHEN** an existing desktop user upgrades to a sync-capable build
- **THEN** the migration preserves existing tasks, tags, reminders, attachments, habits, habit logs, and settings

### Requirement: Platform-neutral design token export
Design tokens SHALL be representable in a platform-neutral format suitable for React, Android native, iOS, and HarmonyOS consumers.

#### Scenario: Consume tokens outside React
- **WHEN** a future native client consumes TodoFlow design tokens
- **THEN** it can map token names and values without parsing desktop Tailwind classes or CSS overrides
