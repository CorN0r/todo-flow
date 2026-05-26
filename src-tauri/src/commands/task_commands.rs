use tauri::State;

use crate::db::task_repo;
use crate::error::AppError;
use crate::models::task::{
    CreateTaskRequest, ReorderItem, Task, TaskDetail, TaskFilter, UpdateTaskRequest,
};
use crate::AppState;

#[tauri::command(rename_all = "snake_case")]
pub fn create_task(
    state: State<AppState>,
    title: String,
    description: Option<String>,
    list_id: Option<String>,
    parent_task_id: Option<String>,
    due_date: Option<String>,
    priority: Option<i32>,
    reminder: Option<String>,
    recurrence: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<Task, AppError> {
    let conn = state.db.lock().unwrap();
    task_repo::create(
        &conn,
        CreateTaskRequest {
            title,
            description,
            list_id,
            parent_task_id,
            due_date,
            priority,
            reminder,
            recurrence,
            tags,
        },
    )
}

#[tauri::command]
pub fn get_task(state: State<AppState>, id: String) -> Result<TaskDetail, AppError> {
    let conn = state.db.lock().unwrap();
    task_repo::get_detail(&conn, &id)?
        .ok_or_else(|| AppError::NotFound(format!("Task {} not found", id)))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_task(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    is_completed: Option<bool>,
    priority: Option<i32>,
    due_date: Option<String>,
    list_id: Option<String>,
    parent_task_id: Option<Option<String>>,
    reminder: Option<String>,
    recurrence: Option<String>,
    my_day_date: Option<Option<String>>,
    tags: Option<Vec<String>>,
) -> Result<Task, AppError> {
    let conn = state.db.lock().unwrap();
    task_repo::update(
        &conn,
        &id,
        UpdateTaskRequest {
            title,
            description,
            is_completed,
            priority,
            due_date,
            list_id,
            parent_task_id,
            reminder,
            recurrence,
            my_day_date,
            tags,
        },
    )
}

#[tauri::command]
pub fn delete_task(state: State<AppState>, id: String) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    task_repo::delete(&conn, &id)
}

#[tauri::command]
pub fn reorder_tasks(state: State<AppState>, items: Vec<ReorderItem>) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    task_repo::reorder(&conn, items)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_tasks(
    state: State<AppState>,
    list_id: Option<String>,
    is_completed: Option<bool>,
    due_date_from: Option<String>,
    due_date_to: Option<String>,
    search_query: Option<String>,
    parent_task_id: Option<String>,
    my_day_date: Option<String>,
    tag_id: Option<String>,
) -> Result<Vec<Task>, AppError> {
    let conn = state.db.lock().unwrap();
    task_repo::get_all(
        &conn,
        TaskFilter {
            list_id,
            is_completed,
            due_date_from,
            due_date_to,
            search_query,
            parent_task_id,
            my_day_date,
            tag_id,
        },
    )
}

#[tauri::command]
pub fn get_today_task_count(state: State<AppState>) -> Result<i64, AppError> {
    let conn = state.db.lock().unwrap();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    task_repo::get_today_count(&conn, &today)
}

#[tauri::command]
pub fn duplicate_task(state: State<AppState>, id: String) -> Result<Task, AppError> {
    let conn = state.db.lock().unwrap();
    task_repo::duplicate(&conn, &id)
}

#[tauri::command]
pub fn add_task_to_my_day(state: State<AppState>, id: String) -> Result<Task, AppError> {
    let conn = state.db.lock().unwrap();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    task_repo::update(
        &conn,
        &id,
        UpdateTaskRequest {
            title: None,
            description: None,
            is_completed: None,
            priority: None,
            due_date: None,
            list_id: None,
            parent_task_id: None,
            reminder: None,
            recurrence: None,
            my_day_date: Some(Some(today)),
            tags: None,
        },
    )
}

#[tauri::command]
pub fn remove_task_from_my_day(state: State<AppState>, id: String) -> Result<Task, AppError> {
    let conn = state.db.lock().unwrap();
    task_repo::update(
        &conn,
        &id,
        UpdateTaskRequest {
            title: None,
            description: None,
            is_completed: None,
            priority: None,
            due_date: None,
            list_id: None,
            parent_task_id: None,
            reminder: None,
            recurrence: None,
            my_day_date: Some(None),
            tags: None,
        },
    )
}
