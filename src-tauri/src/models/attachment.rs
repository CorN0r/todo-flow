use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub task_id: String,
    pub original_name: String,
    pub storage_name: String,
    pub mime_type: String,
    pub file_size: i64,
    pub thumbnail_name: Option<String>,
    pub created_at: String,
}
