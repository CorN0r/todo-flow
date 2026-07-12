# ADR 0002: Use Local-First Sync And Defer E2EE Implementation

## Status

Accepted.

## Context

TodoFlow is local-first today. Android must work in quick, offline, and unreliable-network moments while also syncing with desktop. The sync model must support tasks, reminders, tags, habits, habit logs, selected settings, and later attachments without resurrecting deleted data or losing local edits.

The project also needs a privacy path for end-to-end encryption, but E2EE changes conflict handling, search, diagnostics, attachment handoff, and server-side validation. Shipping E2EE in the first sync version would make the migration much larger and risk delaying basic cross-device reliability.

## Decision

Use operation-based local-first sync for the first sync architecture:

- Apply supported user writes to local SQLite before network sync.
- Record syncable writes in `sync_operations`.
- Pull server revisions through a cursor.
- Use tombstones for sync-enabled deletes.
- Store unresolved or lossy conflicts in `sync_conflicts`.
- Synchronize reminder definitions while scheduling delivery per device.

Defer E2EE implementation from phase 1. The sync contract will reserve room for future encryption metadata, such as encryption mode, key id, and encrypted payload fields, but v1 behavior is TLS plus server-side storage controls.

## Consequences

Positive:

- Keeps Android usable offline from the first release.
- Preserves the current local-first desktop identity.
- Gives deterministic retry and conflict handling without requiring collaborative CRDTs.
- Keeps E2EE possible without blocking the MVP.

Negative:

- Server operators can still process canonical payloads until E2EE is implemented.
- Conflict and search behavior must be revisited when payload encryption is introduced.

Required follow-up:

- Add additive SQLite migrations for sync metadata.
- Add idempotent push and revisioned pull server contracts.
- Document field-level conflict rules before sync beta.
- Revisit E2EE before public sync positioning depends on private cloud claims.
