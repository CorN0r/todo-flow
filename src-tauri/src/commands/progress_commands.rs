//! 进展记录与状态历史命令(全部本机数据,不触发 task-changed,不影响任务)

use tauri::State;

use crate::db::history_repo;
use crate::db::progress_repo;
use crate::db::review_repo;
use crate::error::AppError;
use crate::models::progress::{
    CreateProgressRequest, ProgressOverview, ProgressPage, StateEventPage, UpdateProgressRequest,
};
use crate::models::review::SaveReviewRequest;
use crate::AppState;

#[tauri::command(rename_all = "snake_case")]
pub fn progress_create_record(
    state: State<AppState>,
    task_id: String,
    content: String,
    record_date: String,
    operation_id: Option<String>,
) -> Result<ProgressRecordResult, AppError> {
    let conn = state.db()?;
    let (record, already_saved) = progress_repo::create_progress_record(
        &conn,
        CreateProgressRequest {
            task_id,
            content,
            record_date,
            operation_id,
        },
    )?;
    Ok(ProgressRecordResult {
        record,
        already_saved,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn progress_update_record(
    state: State<AppState>,
    record_id: String,
    content: String,
    record_date: String,
    expected_version: i64,
    operation_id: Option<String>,
) -> Result<ProgressRecordResult, AppError> {
    let conn = state.db()?;
    let (record, already_saved) = progress_repo::update_progress_record(
        &conn,
        UpdateProgressRequest {
            record_id,
            content,
            record_date,
            expected_version,
            operation_id,
        },
    )?;
    Ok(ProgressRecordResult {
        record,
        already_saved,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn progress_delete_record(
    state: State<AppState>,
    record_id: String,
    expected_version: i64,
) -> Result<(), AppError> {
    let conn = state.db()?;
    progress_repo::delete_progress_record(&conn, &record_id, expected_version)
}

#[tauri::command(rename_all = "snake_case")]
pub fn progress_list_records(
    state: State<AppState>,
    task_id: String,
    include_children: Option<bool>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<ProgressPage, AppError> {
    let conn = state.db()?;
    progress_repo::list_records(
        &conn,
        &task_id,
        include_children.unwrap_or(false),
        page.unwrap_or(1),
        page_size.unwrap_or(20),
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn progress_list_events(
    state: State<AppState>,
    task_id: String,
    include_children: Option<bool>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<StateEventPage, AppError> {
    let conn = state.db()?;
    progress_repo::list_events(
        &conn,
        &task_id,
        include_children.unwrap_or(false),
        page.unwrap_or(1),
        page_size.unwrap_or(20),
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn progress_get_overview(
    state: State<AppState>,
    task_id: String,
) -> Result<ProgressOverview, AppError> {
    let conn = state.db()?;
    progress_repo::overview(&conn, &task_id)
}

// ---------- 历史留存与清理 ----------

#[tauri::command]
pub fn get_history_retention(state: State<AppState>) -> Result<bool, AppError> {
    let conn = state.db()?;
    history_repo::is_retention_enabled(&conn)
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_history_retention(
    state: State<AppState>,
    enabled: bool,
) -> Result<(), AppError> {
    let conn = state.db()?;
    history_repo::set_retention(&conn, enabled)
}

#[tauri::command(rename_all = "snake_case")]
pub fn clear_state_events_range(
    state: State<AppState>,
    start_date: String,
    end_date: String,
) -> Result<i64, AppError> {
    let conn = state.db()?;
    history_repo::clear_state_events_range(&conn, &start_date, &end_date)
}

#[tauri::command]
pub fn get_history_coverage(
    state: State<AppState>,
) -> Result<crate::models::progress::CoverageInfo, AppError> {
    let conn = state.db()?;
    history_repo::coverage_info(&conn)
}

// ---------- 回顾基础(事实/材料/保存稿,全部离线可用) ----------

#[tauri::command(rename_all = "snake_case")]
pub fn get_review_facts(
    state: State<AppState>,
    period_kind: String,
    start_date: String,
    tag_ids: Option<Vec<String>>,
) -> Result<crate::models::review::ReviewFacts, AppError> {
    let conn = state.db()?;
    let scope = review_repo::compute_scope(&period_kind, &start_date, &tag_ids.unwrap_or_default())?;
    review_repo::get_review_facts(&conn, &scope)
}

#[tauri::command(rename_all = "snake_case")]
pub fn review_list_material(
    state: State<AppState>,
    period_kind: String,
    start_date: String,
    tag_ids: Option<Vec<String>>,
    material_kind: String,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<crate::models::progress::ReviewMaterialPage, AppError> {
    let conn = state.db()?;
    let scope = review_repo::compute_scope(&period_kind, &start_date, &tag_ids.unwrap_or_default())?;
    review_repo::list_material(
        &conn,
        &scope,
        &material_kind,
        page.unwrap_or(1),
        page_size.unwrap_or(20),
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_saved_review(
    state: State<AppState>,
    period_kind: String,
    start_date: String,
    tag_ids: Option<Vec<String>>,
) -> Result<Option<crate::models::review::SavedReview>, AppError> {
    let conn = state.db()?;
    let scope = review_repo::compute_scope(&period_kind, &start_date, &tag_ids.unwrap_or_default())?;
    review_repo::get_review(&conn, &scope)
}

#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments)]
pub fn save_review(
    state: State<AppState>,
    period_kind: String,
    start_date: String,
    tag_ids: Option<Vec<String>>,
    manual_text: Option<String>,
    ai: Option<crate::models::review::AiReviewPayload>,
    expected_revision: i64,
    operation_id: Option<String>,
) -> Result<SaveReviewResult, AppError> {
    let conn = state.db()?;
    let (review, already_saved) = review_repo::save_review(
        &conn,
        &SaveReviewRequest {
            period_kind,
            start_date,
            tag_ids: tag_ids.unwrap_or_default(),
            manual_text,
            ai,
            expected_revision,
            operation_id,
        },
    )?;
    Ok(SaveReviewResult {
        review,
        already_saved,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_review(
    state: State<AppState>,
    period_kind: String,
    start_date: String,
    tag_ids: Option<Vec<String>>,
) -> Result<(), AppError> {
    let conn = state.db()?;
    let scope = review_repo::compute_scope(&period_kind, &start_date, &tag_ids.unwrap_or_default())?;
    review_repo::delete_review(&conn, &scope)
}

#[derive(serde::Serialize)]
pub struct ProgressRecordResult {
    pub record: crate::models::progress::ProgressRecord,
    pub already_saved: bool,
}

#[derive(serde::Serialize)]
pub struct SaveReviewResult {
    pub review: crate::models::review::SavedReview,
    pub already_saved: bool,
}
