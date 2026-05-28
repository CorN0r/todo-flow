use tauri::State;
use crate::AppState;
use crate::db::habit_repo;
use crate::error::AppError;
use crate::models::habit::*;
use chrono::Local;

#[tauri::command(rename_all = "snake_case")]
pub fn create_habit(state: State<AppState>, req: CreateHabitRequest) -> Result<Habit, AppError> {
    let conn = state.db()?;
    habit_repo::create(&conn, req)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_habits(state: State<AppState>) -> Result<Vec<HabitWithStats>, AppError> {
    let conn = state.db()?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    habit_repo::get_all_with_stats(&conn, &today)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_habit(state: State<AppState>, id: String, req: UpdateHabitRequest) -> Result<Habit, AppError> {
    let conn = state.db()?;
    habit_repo::update(&conn, &id, req)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_habit(state: State<AppState>, id: String) -> Result<(), AppError> {
    let conn = state.db()?;
    habit_repo::delete(&conn, &id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn reorder_habits(state: State<AppState>, items: Vec<ReorderHabitsItem>) -> Result<(), AppError> {
    let conn = state.db()?;
    habit_repo::reorder(&conn, items)
}

#[tauri::command(rename_all = "snake_case")]
pub fn toggle_habit_log(state: State<AppState>, habit_id: String, date: Option<String>) -> Result<HabitLog, AppError> {
    let conn = state.db()?;
    let today = date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    habit_repo::toggle_log(&conn, &habit_id, &today)
}
