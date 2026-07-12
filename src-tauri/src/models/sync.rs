use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncMetaEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncOperation {
    pub op_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub base_revision: Option<i64>,
    pub payload: Value,
    pub client_time: String,
    pub device_id: String,
    pub status: String,
    pub retry_count: i32,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSyncOperationRequest {
    pub op_id: Option<String>,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub base_revision: Option<i64>,
    pub payload: Value,
    pub client_time: Option<String>,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConflict {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub local_payload: Value,
    pub remote_payload: Value,
    pub created_at: String,
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSyncConflictRequest {
    pub id: Option<String>,
    pub entity_type: String,
    pub entity_id: String,
    pub local_payload: Value,
    pub remote_payload: Value,
    pub created_at: Option<String>,
}
