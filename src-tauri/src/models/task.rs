use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub is_completed: bool,
    pub is_archived: bool,
    pub priority: i32,
    pub due_date: Option<String>,
    pub reminder: Option<String>,
    pub tag_id: Option<String>,
    pub parent_task_id: Option<String>,
    pub sort_order: i32,
    pub recurrence: Option<String>,
    pub my_day_date: Option<String>,
    pub children_count: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDetail {
    pub task: Task,
    pub children: Vec<Task>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub tag_id: Option<String>,
    pub parent_task_id: Option<String>,
    pub due_date: Option<String>,
    pub priority: Option<i32>,
    pub reminder: Option<String>,
    pub recurrence: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub is_completed: Option<bool>,
    pub priority: Option<i32>,
    pub due_date: Option<String>,
    pub tag_id: Option<String>,
    pub parent_task_id: Option<Option<String>>,
    pub reminder: Option<String>,
    pub recurrence: Option<String>,
    pub my_day_date: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
pub struct TaskFilter {
    pub tag_id: Option<String>,
    pub is_completed: Option<bool>,
    pub due_date_from: Option<String>,
    pub due_date_to: Option<String>,
    pub search_query: Option<String>,
    pub parent_task_id: Option<String>,
    pub my_day_date: Option<String>,
    pub include_children: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderItem {
    pub id: String,
    pub sort_order: i32,
    pub parent_task_id: Option<String>,
}
