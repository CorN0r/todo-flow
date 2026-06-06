use tauri::{AppHandle, Emitter, State};

use crate::db::task_repo;
use crate::error::AppError;
use crate::models::task::{
    CreateTaskRequest, ReorderItem, Task, TaskDetail, TaskFilter, UpdateTaskRequest,
};
use crate::AppState;

#[tauri::command(rename_all = "snake_case")]
pub fn create_task(
    app: AppHandle,
    state: State<AppState>,
    title: String,
    description: Option<String>,
    tag_id: Option<String>,
    parent_task_id: Option<String>,
    due_date: Option<String>,
    priority: Option<i32>,
    reminder: Option<String>,
    recurrence: Option<String>,
    my_day_date: Option<String>,
) -> Result<Task, AppError> {
    let conn = state.db()?;
    let task = task_repo::create(
        &conn,
        CreateTaskRequest {
            title,
            description,
            tag_id,
            parent_task_id,
            due_date,
            priority,
            reminder,
            recurrence,
            my_day_date,
        },
    )?;
    let _ = app.emit("task-changed", ());
    Ok(task)
}

#[tauri::command]
pub fn get_task(state: State<AppState>, id: String) -> Result<TaskDetail, AppError> {
    let conn = state.db()?;
    task_repo::get_detail(&conn, &id)?
        .ok_or_else(|| AppError::NotFound(format!("Task {} not found", id)))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_task(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    is_completed: Option<bool>,
    priority: Option<i32>,
    due_date: Option<String>,
    tag_id: Option<String>,
    parent_task_id: Option<Option<String>>,
    reminder: Option<String>,
    recurrence: Option<String>,
    my_day_date: Option<Option<String>>,
    is_suspended: Option<bool>,
    is_abandoned: Option<bool>,
    is_pinned: Option<bool>,
) -> Result<Task, AppError> {
    let conn = state.db()?;
    let task = task_repo::update(
        &conn,
        &id,
        UpdateTaskRequest {
            title,
            description,
            is_completed,
            priority,
            due_date,
            tag_id,
            parent_task_id,
            reminder,
            recurrence,
            my_day_date,
            is_suspended,
            is_abandoned,
            is_pinned,
        },
    )?;
    let _ = app.emit("task-changed", ());
    Ok(task)
}

#[tauri::command]
pub fn delete_task(app: AppHandle, state: State<AppState>, id: String) -> Result<(), AppError> {
    let conn = state.db()?;
    task_repo::delete(&conn, &id)?;
    let _ = app.emit("task-changed", ());
    Ok(())
}

#[tauri::command]
pub fn reorder_tasks(state: State<AppState>, items: Vec<ReorderItem>) -> Result<(), AppError> {
    let conn = state.db()?;
    task_repo::reorder(&conn, items)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_tasks(
    state: State<AppState>,
    tag_id: Option<String>,
    is_completed: Option<bool>,
    due_date_from: Option<String>,
    due_date_to: Option<String>,
    search_query: Option<String>,
    parent_task_id: Option<String>,
    my_day_date: Option<String>,
    priority: Option<i32>,
    is_suspended: Option<bool>,
    is_abandoned: Option<bool>,
    include_children: Option<bool>,
    include_archived: Option<bool>,
) -> Result<Vec<Task>, AppError> {
    let conn = state.db()?;
    task_repo::get_all(
        &conn,
        TaskFilter {
            tag_id,
            is_completed,
            due_date_from,
            due_date_to,
            search_query,
            parent_task_id,
            my_day_date,
            priority,
            is_suspended,
            is_abandoned,
            include_children,
            include_archived,
        },
    )
}

#[tauri::command]
pub fn get_today_task_count(state: State<AppState>) -> Result<i64, AppError> {
    let conn = state.db()?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    task_repo::get_today_count(&conn, &today)
}

#[tauri::command]
pub fn duplicate_task(app: AppHandle, state: State<AppState>, id: String) -> Result<Task, AppError> {
    let conn = state.db()?;
    let task = task_repo::duplicate(&conn, &id)?;
    let _ = app.emit("task-changed", ());
    Ok(task)
}

#[tauri::command]
pub fn add_task_to_my_day(app: AppHandle, state: State<AppState>, id: String) -> Result<Task, AppError> {
    let conn = state.db()?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let task = task_repo::update(
        &conn,
        &id,
        UpdateTaskRequest {
            title: None,
            description: None,
            is_completed: None,
            priority: None,
            due_date: None,
            tag_id: None,
            parent_task_id: None,
            reminder: None,
            recurrence: None,
            my_day_date: Some(Some(today)),
            is_suspended: None,
            is_abandoned: None,
            is_pinned: None,
        },
    )?;
    let _ = app.emit("task-changed", ());
    Ok(task)
}

#[tauri::command]
pub fn remove_task_from_my_day(app: AppHandle, state: State<AppState>, id: String) -> Result<Task, AppError> {
    let conn = state.db()?;
    let task = task_repo::update(
        &conn,
        &id,
        UpdateTaskRequest {
            title: None,
            description: None,
            is_completed: None,
            priority: None,
            due_date: None,
            tag_id: None,
            parent_task_id: None,
            reminder: None,
            recurrence: None,
            my_day_date: Some(None),
            is_suspended: None,
            is_abandoned: None,
            is_pinned: None,
        },
    )?;
    let _ = app.emit("task-changed", ());
    Ok(task)
}
