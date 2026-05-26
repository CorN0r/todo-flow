use tauri::State;

use crate::AppState;
use crate::db;
use crate::error::AppError;
use crate::models::task::Tag;

#[tauri::command]
pub fn get_tags(state: State<AppState>) -> Result<Vec<Tag>, AppError> {
    let conn = state.db.lock().unwrap();
    db::tag_repo::get_all(&conn)
}

#[tauri::command]
pub fn create_tag(name: String, color: String, state: State<AppState>) -> Result<Tag, AppError> {
    let conn = state.db.lock().unwrap();
    db::tag_repo::create(&conn, name, color)
}

#[tauri::command]
pub fn update_tag(id: String, name: Option<String>, color: Option<String>, state: State<AppState>) -> Result<Tag, AppError> {
    let conn = state.db.lock().unwrap();
    db::tag_repo::update(&conn, &id, name, color)
}

#[tauri::command]
pub fn delete_tag(id: String, state: State<AppState>) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    db::tag_repo::delete(&conn, &id)
}
