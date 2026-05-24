use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoList {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListWithCount {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
    pub task_count: i32,
    pub incomplete_count: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateListRequest {
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateListRequest {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderListsItem {
    pub id: String,
    pub sort_order: i32,
}
