use tauri::{AppHandle, Emitter, State};

use crate::alerts::{AlertState, PendingAlert};
use crate::db::reminder_repo;
use crate::error::AppError;
use crate::AppState;

/// 返回提醒弹窗待处理队列快照。
/// 顺带剔除任务已完成/归档/删除或提醒已删除的过期条目,保持队列与库一致。
#[tauri::command(rename_all = "snake_case")]
pub fn get_pending_alerts(
    state: State<AppState>,
    alerts: State<AlertState>,
) -> Result<Vec<PendingAlert>, AppError> {
    let conn = state.db.lock().unwrap();
    let pending = alerts.snapshot();
    let alive: Vec<PendingAlert> = pending
        .iter()
        .filter(|a| reminder_repo::is_alert_alive(&conn, &a.reminder_id))
        .cloned()
        .collect();
    for stale in pending {
        if !alive.iter().any(|a| a.reminder_id == stale.reminder_id) {
            alerts.remove(&stale.reminder_id);
        }
    }
    Ok(alive)
}

/// 关闭当前提醒弹窗:仅出队并 mark_reminded,不改动提醒数据。
#[tauri::command(rename_all = "snake_case")]
pub fn dismiss_alert(
    state: State<AppState>,
    alerts: State<AlertState>,
    reminder_id: String,
) -> Result<(), AppError> {
    alerts.remove(&reminder_id);
    let conn = state.db.lock().unwrap();
    reminder_repo::mark_reminded(&conn, &reminder_id)?;
    Ok(())
}

/// 推迟提醒:出队并把 reminder_time 顺延 minutes 分钟,复位 reminded。
#[tauri::command(rename_all = "snake_case")]
pub fn snooze_alert(
    app: AppHandle,
    state: State<AppState>,
    alerts: State<AlertState>,
    reminder_id: String,
    minutes: i64,
) -> Result<(), AppError> {
    alerts.remove(&reminder_id);
    let conn = state.db.lock().unwrap();
    reminder_repo::snooze_reminder(&conn, &reminder_id, minutes)?;
    drop(conn);
    let _ = app.emit("task-changed", ());
    Ok(())
}
