use tauri::State;

use crate::db::sync_repo;
use crate::error::AppError;
use crate::models::sync::{
    CreateSyncConflictRequest, CreateSyncOperationRequest, SyncConflict, SyncMetaEntry,
    SyncOperation,
};
use crate::AppState;

#[tauri::command(rename_all = "snake_case")]
pub fn get_sync_meta(state: State<AppState>, key: String) -> Result<Option<String>, AppError> {
    let conn = state.db()?;
    sync_repo::get_meta(&conn, &key)
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_sync_meta(state: State<AppState>, key: String, value: String) -> Result<(), AppError> {
    let conn = state.db()?;
    sync_repo::set_meta(&conn, &key, &value)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_sync_meta(state: State<AppState>) -> Result<Vec<SyncMetaEntry>, AppError> {
    let conn = state.db()?;
    sync_repo::list_meta(&conn)
}

#[tauri::command(rename_all = "snake_case")]
pub fn record_sync_operation(
    state: State<AppState>,
    req: CreateSyncOperationRequest,
) -> Result<SyncOperation, AppError> {
    let conn = state.db()?;
    sync_repo::record_operation(&conn, req)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_sync_operations(
    state: State<AppState>,
    status: Option<String>,
) -> Result<Vec<SyncOperation>, AppError> {
    let conn = state.db()?;
    sync_repo::list_operations(&conn, status.as_deref())
}

#[tauri::command(rename_all = "snake_case")]
pub fn mark_sync_operation_status(
    state: State<AppState>,
    op_id: String,
    status: String,
    last_error: Option<String>,
) -> Result<SyncOperation, AppError> {
    let conn = state.db()?;
    sync_repo::mark_operation_status(&conn, &op_id, &status, last_error.as_deref())
}

#[tauri::command(rename_all = "snake_case")]
pub fn increment_sync_operation_retry(
    state: State<AppState>,
    op_id: String,
    last_error: String,
) -> Result<SyncOperation, AppError> {
    let conn = state.db()?;
    sync_repo::increment_retry(&conn, &op_id, &last_error)
}

#[tauri::command(rename_all = "snake_case")]
pub fn save_sync_conflict(
    state: State<AppState>,
    req: CreateSyncConflictRequest,
) -> Result<SyncConflict, AppError> {
    let conn = state.db()?;
    sync_repo::save_conflict(&conn, req)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_sync_conflicts(
    state: State<AppState>,
    entity_type: Option<String>,
    entity_id: Option<String>,
) -> Result<Vec<SyncConflict>, AppError> {
    let conn = state.db()?;
    sync_repo::list_conflicts(&conn, entity_type.as_deref(), entity_id.as_deref())
}

#[tauri::command(rename_all = "snake_case")]
pub fn resolve_sync_conflict(state: State<AppState>, id: String) -> Result<SyncConflict, AppError> {
    let conn = state.db()?;
    sync_repo::resolve_conflict(&conn, &id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn derive_sync_status(
    state: State<AppState>,
    entity_type: String,
    entity_id: String,
) -> Result<String, AppError> {
    let conn = state.db()?;
    sync_repo::derive_entity_status(&conn, &entity_type, &entity_id)
}
