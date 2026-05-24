use tauri::State;

use crate::db::list_repo;
use crate::error::AppError;
use crate::models::list::{
    CreateListRequest, ListWithCount, ReorderListsItem, TodoList, UpdateListRequest,
};
use crate::AppState;

#[tauri::command]
pub fn create_list(
    state: State<AppState>,
    name: String,
    color: Option<String>,
    icon: Option<String>,
) -> Result<TodoList, AppError> {
    let conn = state.db.lock().unwrap();
    list_repo::create(&conn, CreateListRequest { name, color, icon })
}

#[tauri::command]
pub fn get_lists(state: State<AppState>) -> Result<Vec<ListWithCount>, AppError> {
    let conn = state.db.lock().unwrap();
    list_repo::get_all_with_counts(&conn)
}

#[tauri::command]
pub fn update_list(
    state: State<AppState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
    icon: Option<String>,
) -> Result<TodoList, AppError> {
    let conn = state.db.lock().unwrap();
    list_repo::update(&conn, &id, UpdateListRequest { name, color, icon })
}

#[tauri::command]
pub fn delete_list(state: State<AppState>, id: String) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    list_repo::delete(&conn, &id)
}

#[tauri::command]
pub fn reorder_lists(state: State<AppState>, items: Vec<ReorderListsItem>) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    list_repo::reorder(&conn, items)
}
