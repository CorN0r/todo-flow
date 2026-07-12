# Future Platform Readiness

This note captures the minimum platform work needed after the Android MVP so the TodoFlow domain and sync layers can be reused by iOS and HarmonyOS clients.

## iOS Proof Of Concept Prerequisites

- Apple Developer account, signing certificates, provisioning profiles, and a physical iPhone test device.
- macOS build host with Xcode, Rust targets for iOS, Node.js, and the matching Tauri mobile toolchain.
- Confirmation that the current repository interfaces cover iOS storage, notification permission, share sheet, file picker, and background refresh behavior.
- A local SQLite storage adapter or Tauri mobile storage path that supports the existing migrations and backup/export expectations.
- Notification policy spike for reminders and focus phase completion, including permission prompts and local scheduling limits.
- Background sync policy spike for foreground-only sync, background app refresh, and user-triggered manual sync.
- Attachment handoff spike for Photos/File Provider access without storing device-local paths in sync payloads.
- A smoke test that launches the mobile shell, creates an offline task, restarts the app, and syncs through the v1 contract.

## HarmonyOS Client Options

Option A: Web shell over shared sync API

- Lowest initial cost.
- Reuses the React mobile UI and v1 Sync Server contract.
- Best for validating demand, but native notifications/background work may be limited.

Option B: ArkUI native client over shared domain contract

- Better platform fit for navigation, notifications, and background policy.
- Requires a native repository adapter that implements the TodoFlow domain interfaces.
- Must consume `sync-server/openapi.json` and avoid copying desktop or Android UI fields into payloads.

Option C: Tauri-compatible route if mature support exists

- Reuses more of the current stack if the ecosystem becomes practical.
- Should be treated as experimental until build, signing, plugin, and storage support are proven.

## Shared Acceptance Bar

- Client can create, edit, complete, delete, and reopen tasks offline.
- Client can sync tasks, tags, reminders, habits, habit logs, settings, and attachment metadata through `/v1`.
- Client schedules reminder delivery per device without syncing delivery state globally.
- Sync payloads contain only portable domain fields.
- Token consumption works from `docs/android-migration/mobile-design-tokens.json`.
- Platform capabilities are implemented behind the documented service contract.
