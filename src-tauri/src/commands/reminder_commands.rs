use tauri::{AppHandle, Emitter, State};

use crate::db::reminder_repo;
use crate::error::AppError;
use crate::models::task_reminder::{CreateReminderRequest, TaskReminder};
use crate::AppState;

#[tauri::command(rename_all = "snake_case")]
pub fn get_task_reminders(
    state: State<AppState>,
    task_id: String,
) -> Result<Vec<TaskReminder>, AppError> {
    let conn = state.db.lock().unwrap();
    reminder_repo::get_reminders_for_task(&conn, &task_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_task_reminder(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    offset: String,
    due_date: Option<String>,
) -> Result<TaskReminder, AppError> {
    let conn = state.db.lock().unwrap();
    let reminder = reminder_repo::create_reminder(&conn, CreateReminderRequest {
        task_id,
        offset,
        due_date,
    })?;
    let _ = app.emit("task-changed", ());
    Ok(reminder)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_task_reminder(
    app: AppHandle,
    state: State<AppState>,
    reminder_id: String,
) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    reminder_repo::delete_reminder(&conn, &reminder_id)?;
    let _ = app.emit("task-changed", ());
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn clear_task_reminders(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    reminder_repo::clear_reminders_for_task(&conn, &task_id)?;
    let _ = app.emit("task-changed", ());
    Ok(())
}
