# TodoFlow Platform Service Contracts

This document defines the cross-platform service boundary used by desktop, Android, web test doubles, and future clients. UI code must call the repository contract instead of importing Tauri, Android, or browser APIs directly.

## Contract Rules

- Services return typed success or capability results instead of throwing for unsupported platform features.
- Paths, notification ids, share payloads, and background work ids are client-local. They must not be stored in sync payloads unless explicitly listed as syncable metadata.
- Syncable data must use domain ids, timestamps, and portable metadata only.
- Platform implementations may add native permissions or scheduling policies, but they must keep the TypeScript contract stable.

## Notification Service

Purpose: deliver local user-visible notifications for reminders and focus phase completion.

Input:

- `title`: required user-visible notification title.
- `body`: optional user-visible detail.

Behavior:

- Desktop may use Tauri notification plugins.
- Android may use Android notification channels and runtime permission prompts.
- Delivery state is device-local. The sync system synchronizes reminder definitions, not a global `reminded` delivery flag.

Failure:

- Permission denial should be reported as unsupported or failed at the platform layer.
- Sync should continue even if notification scheduling fails.

## File Service

Purpose: choose files, choose save paths, read bytes, and turn local paths into UI-safe asset URLs.

Input:

- `chooseFiles(options)`: optional filters and multiple selection.
- `chooseSavePath(options)`: optional default path and filters.
- `readFileBytes(path)`: platform-local path.
- `toFileAssetUrl(path)`: platform-local path.

Behavior:

- File paths are local-only and must not be used as cross-device attachment locations.
- Attachment sync uses metadata and server upload handoff before binary transfer.
- Android implementations should use content URIs or scoped storage adapters where appropriate.

## Share Service

Purpose: invoke the native share sheet or equivalent desktop/web fallback.

Input:

- `title`: optional share title.
- `text`: optional plain text body.
- `url`: optional URL.

Behavior:

- Android should route to share intents.
- Desktop may return unsupported until a native share target is implemented.
- Shared data is transient and must not create sync operations by itself.

## Storage Service

Purpose: persist local-first domain data and support backup/import/export.

Required capabilities:

- Local SQLite or equivalent durable storage.
- `backupDatabase(destination)` before first sync enablement on desktop.
- Import/export paths remain platform-local.
- Sync metadata tables or equivalent stores for cursors, operation queues, and conflicts.

Behavior:

- Writes are local-first and queue sync operations after local persistence succeeds.
- Tombstone deletes hide syncable entities while preserving enough metadata to avoid resurrection.
- Platform storage details must not leak into sync payloads.

## Background Work Service

Purpose: register device-local work for sync, reminders, focus sessions, and other deferred behavior.

Input:

- `id`: stable local work id, such as `reminder:<id>`.
- `reason`: one of `sync`, `notification`, `focus-session`, or `other`.

Behavior:

- Android may map this to WorkManager, alarms, foreground services, or notification scheduling depending on policy.
- Desktop may return unsupported or use a tray/background process.
- Background registration must be idempotent for the same id.

Failure:

- Unsupported background work should not block domain writes.
- Sync status UI should surface recoverable failures without discarding queued operations.

## AI Model Service

Purpose: manage local AI model connections, credentials, verification, the task breakdown workflow, and the description polish workflow through the shared `AiModelRepository` domain contract (added by the `add-ai-model-access` change 2026-10-25; extended by `add-ai-description-polish`, 2026-10-29).

Contract rules:

- Frontend components call `getRepositories().ai`; they never invoke model HTTP endpoints or read credentials directly.
- Desktop implements the contract over Tauri commands (`ai_*`, all `rename_all = "snake_case"`); the memory adapter provides a deterministic test double.
- Errors are structured `{ code, message, detail? }` objects (`AiErrorShape`), classified by machine-readable code, never string matching.

Behavior:

- Connections, model entries, verification state, and invocation summaries are device-local and never enter the task sync whitelist.
- Credentials live in the OS credential store (Windows Credential Manager via keyring, entry `com.todoflow.desktop/ai/<connection_id>`); the raw key never crosses the repository boundary to UI code.
- Android must adapt credential storage and platform networking behind the same contract; business rules (breakdown validation, apply idempotency via `operation_id` receipts, context fingerprints) stay in shared Rust/domain logic rather than being reimplemented per platform.
- Breakdown proposals are session-scoped in runtime memory; adoption receipts (`ai_apply_receipts`) are durable so retries after restarts fail safely with an explicit conflict instead of duplicating tasks.
- Polish proposals are preview-only (never persisted server-side); adoption goes through the regular task update path replacing just the description field. The optional polish direction note (≤200 chars) rides the same command boundary.

Failure:

- Model unavailability or call failures must not affect any non-AI feature.
- Devices without this module must not render actionable AI entry points.
