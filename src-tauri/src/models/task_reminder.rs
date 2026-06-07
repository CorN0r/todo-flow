use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskReminder {
    pub id: String,
    pub task_id: String,
    pub offset: String,
    pub reminder_time: String,
    pub reminded: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateReminderRequest {
    pub task_id: String,
    pub offset: String,
    pub due_date: Option<String>,
}
