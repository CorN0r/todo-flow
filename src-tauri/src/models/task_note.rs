use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskNote {
    pub task_id: String,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: i32,
    pub height: i32,
    pub always_on_top: bool,
    pub style: String,
    pub collapsed: bool,
    pub created_at: String,
    pub updated_at: String,
}
