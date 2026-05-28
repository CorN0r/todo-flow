use tauri::State;

use crate::db::tag_repo;
use crate::error::AppError;
use crate::models::tag::{
    CreateTagRequest, TagWithCount, ReorderTagsItem, Tag, UpdateTagRequest,
};
use crate::AppState;

#[tauri::command]
pub fn create_tag(
    state: State<AppState>,
    name: String,
    color: Option<String>,
    icon: Option<String>,
    parent_tag_id: Option<String>,
) -> Result<Tag, AppError> {
    let conn = state.db()?;
    tag_repo::create(&conn, CreateTagRequest { name, color, icon, parent_tag_id })
}

#[tauri::command]
pub fn get_tags(state: State<AppState>) -> Result<Vec<TagWithCount>, AppError> {
    let conn = state.db()?;
    tag_repo::get_all_with_counts(&conn)
}

#[tauri::command]
pub fn update_tag(
    state: State<AppState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    parent_tag_id: Option<Option<String>>,
) -> Result<Tag, AppError> {
    let conn = state.db()?;
    tag_repo::update(&conn, &id, UpdateTagRequest { name, color, icon, parent_tag_id })
}

#[tauri::command]
pub fn delete_tag(state: State<AppState>, id: String) -> Result<(), AppError> {
    let conn = state.db()?;
    tag_repo::delete(&conn, &id)
}

#[tauri::command]
pub fn reorder_tags(state: State<AppState>, items: Vec<ReorderTagsItem>) -> Result<(), AppError> {
    let conn = state.db()?;
    tag_repo::reorder(&conn, items)
}
