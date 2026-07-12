## ADDED Requirements

### Requirement: Local-first writes
Clients SHALL apply supported user writes to local SQLite before attempting network synchronization.

#### Scenario: Local write succeeds before sync
- **WHEN** the user creates or edits a task on any client
- **THEN** the client writes the change locally and records a pending sync operation

#### Scenario: Network unavailable
- **WHEN** the network is unavailable during a write
- **THEN** the client keeps the local change and leaves the operation queued for retry

### Requirement: Sync operation queue
Clients SHALL record syncable local changes in an operation queue with operation id, entity type, entity id, operation type, payload, base revision, client time, device id, status, retry count, and last error.

#### Scenario: Queue task update
- **WHEN** a task field changes locally
- **THEN** a corresponding sync operation is stored with enough payload to reproduce the change on the server

#### Scenario: Retry failed operation
- **WHEN** a queued operation fails due to a transient network or server error
- **THEN** the client increments retry metadata and retries without duplicating the operation

### Requirement: Tombstone deletes
Syncable entity deletes SHALL use tombstones instead of immediate irreversible removal until the delete has synchronized.

#### Scenario: Delete task locally
- **WHEN** the user deletes a task while sync is enabled
- **THEN** the client marks the task as deleted and queues a delete operation

#### Scenario: Pull remote delete
- **WHEN** the client pulls a tombstone for an entity
- **THEN** the client hides the entity from normal views and preserves enough metadata to avoid resurrecting it

### Requirement: Revisioned pull
Clients SHALL pull changes using a server cursor or revision marker and apply only changes newer than the last acknowledged cursor.

#### Scenario: Incremental pull
- **WHEN** the client sends its last sync cursor
- **THEN** the server returns only later changes and a new cursor

### Requirement: Deterministic conflict handling
The sync system SHALL handle conflicts using documented entity and field-level rules and SHALL store unresolved conflicts for later review.

#### Scenario: Different fields changed
- **WHEN** desktop changes a task due date and Android changes the same task title before syncing
- **THEN** the merged task contains both changes if neither field conflict rule rejects them

#### Scenario: Same field changed
- **WHEN** two clients change the same scalar task field from the same base revision
- **THEN** the system resolves according to the documented last-write or server-accepted ordering rule and records conflict metadata when required

### Requirement: Per-device reminder delivery
The sync system SHALL synchronize reminder definitions but SHALL NOT treat a single global reminded flag as the source of truth for all device notification delivery.

#### Scenario: Reminder sync
- **WHEN** a reminder is created on desktop
- **THEN** Android receives the reminder definition and schedules local notification delivery according to Android policy

### Requirement: Sync status visibility
Clients SHALL expose synchronization status for local changes.

#### Scenario: Pending change shown
- **WHEN** a local task has not yet been acknowledged by the server
- **THEN** the client displays a pending sync state in a non-blocking way

#### Scenario: Failed sync shown
- **WHEN** a queued operation repeatedly fails
- **THEN** the client displays a recoverable sync failure state without discarding the local change
