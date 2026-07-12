## ADDED Requirements

### Requirement: Versioned sync API
The Sync Server SHALL expose a versioned API namespace for client synchronization.

#### Scenario: Client uses v1 endpoint
- **WHEN** a client sends a sync request to a `/v1` endpoint
- **THEN** the server handles the request according to the v1 contract without requiring UI-platform-specific fields

### Requirement: Device registration
The Sync Server SHALL support registering and identifying individual client devices.

#### Scenario: Register device
- **WHEN** an authenticated client registers a device
- **THEN** the server returns or confirms a stable device identifier usable in future sync operations

### Requirement: Bootstrap
The Sync Server SHALL provide a bootstrap response containing the user's current canonical syncable dataset and initial cursor.

#### Scenario: First sync
- **WHEN** a newly linked Android client requests bootstrap
- **THEN** the server returns tasks, tags, reminders, habits, habit logs, syncable settings, and a cursor for future incremental pulls

### Requirement: Push operations
The Sync Server SHALL accept idempotent batches of client operations.

#### Scenario: Push operation batch
- **WHEN** a client sends a batch of queued operations with unique operation ids
- **THEN** the server applies each operation at most once and returns accepted revisions or conflict information

#### Scenario: Duplicate push
- **WHEN** the same operation id is pushed again after a network retry
- **THEN** the server returns the prior result without applying the operation twice

### Requirement: Pull changes
The Sync Server SHALL return revision-ordered changes newer than the client cursor.

#### Scenario: Pull incremental changes
- **WHEN** the client sends a valid cursor
- **THEN** the server returns changes after that cursor and a next cursor

### Requirement: Acknowledgement
The Sync Server SHALL allow clients to acknowledge a successfully applied cursor or operation batch.

#### Scenario: Acknowledge sync
- **WHEN** the client has safely applied pulled changes
- **THEN** the client can acknowledge progress so future status and diagnostics reflect the applied state

### Requirement: Attachment handoff
The Sync Server SHALL define an attachment handoff path that separates attachment metadata from binary content transfer.

#### Scenario: Initialize upload
- **WHEN** a client requests attachment upload initialization
- **THEN** the server returns an attachment id and upload target without requiring the task metadata sync to carry binary content

### Requirement: Contract testability
The Sync Server API SHALL be described by a machine-readable contract suitable for client and server contract tests.

#### Scenario: Generate tests from contract
- **WHEN** the API contract is updated
- **THEN** clients and server can validate request and response shapes against the same versioned contract
