//! 从备份找回:先预览、再勾选,把选中的任务从备份并入当前工作区。
//!
//! 预览和执行都只读备份文件:先做一份升级到当前结构的临时副本,再读副本。
//! 整次找回在一个事务里完成;它不改动设置、模型配置、同步状态和"我的一天"。

use std::path::Path;

use rusqlite::Connection;
use tauri::{AppHandle, Emitter, State};

use crate::db::recovery_repo::{self, BackupPreview, RecoverCounts};
use crate::error::AppError;
use crate::workspace::files;
use crate::AppState;

/// 打开备份的升级副本。副本随返回值一起存活,用完即删。
fn open_snapshot(source: &str) -> Result<(files::TempSnapshot, Connection), AppError> {
    let snapshot = files::temp_snapshot(Path::new(source))?;
    let conn = crate::db::connection::open(&snapshot.path).map_err(|e| {
        AppError::Generic(format!(
            "无法打开备份副本: {}",
            files::sqlite_message(&e)
        ))
    })?;
    Ok((snapshot, conn))
}

/// 预览一份备份:里面有哪些任务、哪些是当前库中没有的。不写入任何数据。
#[tauri::command]
pub fn inspect_backup(state: State<AppState>, source: String) -> Result<BackupPreview, AppError> {
    let (_snapshot, backup) = open_snapshot(&source)?;
    let current = state.db()?;
    recovery_repo::preview(&current, &backup)
}

/// 把勾选的任务从备份找回当前工作区。整次执行原子完成。
#[tauri::command(rename_all = "snake_case")]
pub fn recover_from_backup(
    app: AppHandle,
    state: State<AppState>,
    source: String,
    task_ids: Vec<String>,
    include_reviews: bool,
) -> Result<RecoverCounts, AppError> {
    let (_snapshot, backup) = open_snapshot(&source)?;
    let counts = {
        let current = state.db()?;
        recovery_repo::recover(&current, &backup, &task_ids, include_reviews)?
    };
    if counts.recovered + counts.replaced > 0 {
        let _ = app.emit("task-changed", ());
        // 找回的任务可能带着桌面便签记录
        let _ = app.emit("task-notes-changed", ());
    }
    Ok(counts)
}
