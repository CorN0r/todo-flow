use std::collections::HashMap;
use std::path::PathBuf;

use rusqlite::{params, Connection};
use tauri::{AppHandle, Emitter, State};

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
        params![key, value],
    )?;
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
    std::fs::write(&path, &content)
        .map_err(|e| AppError::Generic(format!("Export failed: {}", e)))
}

#[tauri::command]
pub fn import_database(app: AppHandle, state: State<AppState>, source: String) -> Result<String, AppError> {
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err(AppError::Validation("Source file does not exist".to_string()));
    }
    let src_conn = Connection::open(&src)
        .map_err(|e| AppError::Generic(format!("Cannot open source database: {}", e)))?;

    let conn = state.db()?;

    let imported_tasks: usize = {
        let mut stmt = src_conn.prepare(
            "SELECT id, title, description, is_completed, is_archived, is_suspended, is_abandoned,
                    priority, due_date, reminder, recurrence, tag_id, parent_task_id, sort_order,
                    my_day_date, created_at, updated_at FROM tasks"
        )?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt.query_map([], |row| {
            Ok(vec![
                Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                Box::new(row.get::<_, String>(1)?),
                Box::new(row.get::<_, String>(2)?),
                Box::new(row.get::<_, i32>(3)?),
                Box::new(row.get::<_, i32>(4)?),
                Box::new(row.get::<_, i32>(5)?),
                Box::new(row.get::<_, i32>(6)?),
                Box::new(row.get::<_, i32>(7)?),
                Box::new(row.get::<_, Option<String>>(8)?),
                Box::new(row.get::<_, Option<String>>(9)?),
                Box::new(row.get::<_, Option<String>>(10)?),
                Box::new(row.get::<_, Option<String>>(11)?),
                Box::new(row.get::<_, Option<String>>(12)?),
                Box::new(row.get::<_, i32>(13)?),
                Box::new(row.get::<_, Option<String>>(14)?),
                Box::new(row.get::<_, String>(15)?),
                Box::new(row.get::<_, String>(16)?),
            ])
        })?.flatten().collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO tasks (id, title, description, is_completed, is_archived,
                 is_suspended, is_abandoned, priority, due_date, reminder, recurrence, tag_id,
                 parent_task_id, sort_order, my_day_date, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result { if n > 0 { count += 1; } }
        }
        count
    };

    let imported_tags: usize = {
        let mut stmt = src_conn.prepare("SELECT id, name, color, icon, sort_order, parent_tag_id FROM tags")?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt.query_map([], |row| {
            Ok(vec![
                Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                Box::new(row.get::<_, String>(1)?),
                Box::new(row.get::<_, String>(2)?),
                Box::new(row.get::<_, String>(3)?),
                Box::new(row.get::<_, i32>(4)?),
                Box::new(row.get::<_, Option<String>>(5)?),
            ])
        })?.flatten().collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO tags (id, name, color, icon, sort_order, parent_tag_id)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result { if n > 0 { count += 1; } }
        }
        count
    };

    let imported_reminders: usize = {
        let mut stmt = src_conn.prepare(
            "SELECT id, task_id, offset, reminder_time, reminded, created_at FROM task_reminders"
        )?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt.query_map([], |row| {
            Ok(vec![
                Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                Box::new(row.get::<_, String>(1)?),
                Box::new(row.get::<_, String>(2)?),
                Box::new(row.get::<_, String>(3)?),
                Box::new(row.get::<_, i32>(4)?),
                Box::new(row.get::<_, String>(5)?),
            ])
        })?.flatten().collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO task_reminders (id, task_id, offset, reminder_time, reminded, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result { if n > 0 { count += 1; } }
        }
        count
    };

    let imported_attachments: usize = {
        let mut stmt = src_conn.prepare(
            "SELECT id, task_id, original_name, storage_name, mime_type, file_size, created_at FROM attachments"
        )?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt.query_map([], |row| {
            Ok(vec![
                Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                Box::new(row.get::<_, String>(1)?),
                Box::new(row.get::<_, String>(2)?),
                Box::new(row.get::<_, String>(3)?),
                Box::new(row.get::<_, String>(4)?),
                Box::new(row.get::<_, i64>(5)?),
                Box::new(row.get::<_, String>(6)?),
            ])
        })?.flatten().collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO attachments (id, task_id, original_name, storage_name, mime_type, file_size, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result { if n > 0 { count += 1; } }
        }
        count
    };

    let imported_habits: usize = {
        let mut stmt = src_conn.prepare(
            "SELECT id, name, color, icon, frequency, target_count, sort_order FROM habits"
        )?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt.query_map([], |row| {
            Ok(vec![
                Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                Box::new(row.get::<_, String>(1)?),
                Box::new(row.get::<_, String>(2)?),
                Box::new(row.get::<_, String>(3)?),
                Box::new(row.get::<_, String>(4)?),
                Box::new(row.get::<_, i32>(5)?),
                Box::new(row.get::<_, i32>(6)?),
            ])
        })?.flatten().collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO habits (id, name, color, icon, frequency, target_count, sort_order)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result { if n > 0 { count += 1; } }
        }
        count
    };

    let imported_habit_logs: usize = {
        let mut stmt = src_conn.prepare(
            "SELECT id, habit_id, log_date, count, note FROM habit_logs"
        )?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt.query_map([], |row| {
            Ok(vec![
                Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                Box::new(row.get::<_, String>(1)?),
                Box::new(row.get::<_, String>(2)?),
                Box::new(row.get::<_, i32>(3)?),
                Box::new(row.get::<_, String>(4)?),
            ])
        })?.flatten().collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO habit_logs (id, habit_id, log_date, count, note)
                 VALUES (?1,?2,?3,?4,?5)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result { if n > 0 { count += 1; } }
        }
        count
    };

    drop(conn);
    let _ = app.emit("task-changed", ());

    Ok(format!(
        "已导入 {} 个任务、{} 个标签、{} 个提醒、{} 个附件、{} 个习惯、{} 条打卡记录",
        imported_tasks, imported_tags, imported_reminders,
        imported_attachments, imported_habits, imported_habit_logs,
    ))
}
