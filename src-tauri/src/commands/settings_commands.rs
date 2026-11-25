use std::collections::HashMap;
use std::path::PathBuf;

use rusqlite::params;
use tauri::State;

use crate::db::sync_repo;
use crate::error::AppError;
use crate::AppState;

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, AppError> {
    let conn = state.db()?;
    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    );
    match result {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), AppError> {
    let conn = state.db()?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![&key, &value],
    )?;
    let _ = sync_repo::record_setting_update(&conn, &key, &value)?;
    Ok(())
}

#[tauri::command]
pub fn get_all_settings(state: State<AppState>) -> Result<HashMap<String, String>, AppError> {
    let conn = state.db()?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row?;
        map.insert(k, v);
    }
    Ok(map)
}

#[tauri::command]
pub fn backup_database(state: State<AppState>, destination: String) -> Result<(), AppError> {
    let conn = state.db()?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").ok();
    drop(conn);
    let src = state.data_dir.join("todo.db");
    let dest = PathBuf::from(&destination);
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            return Err(AppError::Validation(format!(
                "Directory '{}' does not exist",
                parent.display()
            )));
        }
    }
    // 如果目标文件已存在，先删除再复制（覆盖导出）
    if dest.exists() {
        std::fs::remove_file(&dest)
            .map_err(|e| AppError::Generic(format!("无法覆盖已有文件: {}", e)))?;
    }
    std::fs::copy(&src, &dest).map_err(|e| AppError::Generic(format!("Backup failed: {}", e)))?;
    Ok(())
}

#[tauri::command]
pub fn export_csv(path: String, content: String) -> Result<(), AppError> {
    std::fs::write(&path, &content).map_err(|e| AppError::Generic(format!("Export failed: {}", e)))
}

#[tauri::command]
pub fn write_debug_log(path: String, content: String) -> Result<(), String> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    let ts = chrono::Local::now().format("%H:%M:%S%.3f");
    writeln!(file, "[{}] {}", ts, content).map_err(|e| e.to_string())?;
    Ok(())
}
