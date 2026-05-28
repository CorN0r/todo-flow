use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub sort_order: i32,
    pub parent_tag_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagWithCount {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub sort_order: i32,
    pub parent_tag_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub task_count: i32,
    pub incomplete_count: i32,
    pub children: Vec<TagWithCount>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTagRequest {
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub parent_tag_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTagRequest {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub parent_tag_id: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderTagsItem {
    pub id: String,
    pub sort_order: i32,
}
