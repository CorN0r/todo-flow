use std::collections::HashMap;
use std::path::PathBuf;

use rusqlite::{params, Connection};
use tauri::{AppHandle, Emitter, State};

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

#[tauri::command(rename_all = "snake_case")]
pub fn import_database(
    app: AppHandle,
    state: State<AppState>,
    source: String,
    include_progress: Option<bool>,
) -> Result<String, AppError> {
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err(AppError::Validation(
            "Source file does not exist".to_string(),
        ));
    }
    let src_conn = Connection::open(&src)
        .map_err(|e| AppError::Generic(format!("Cannot open source database: {}", e)))?;

    // 版本校验:不从未知的新版本覆盖本机
    if include_progress.unwrap_or(false) {
        let src_version: i32 = src_conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap_or(0);
        let local_version: i32 = {
            let conn = state.db()?;
            conn.pragma_query_value(None, "user_version", |row| row.get(0))
                .unwrap_or(0)
        };
        if src_version > local_version {
            return Err(AppError::Validation(format!(
                "备份由更新版本创建(user_version {} > {}),请先升级应用再恢复",
                src_version, local_version
            )));
        }
    }

    let conn = state.db()?;

    let imported_tasks: usize = {
        let mut stmt = src_conn.prepare(
            "SELECT id, title, description, is_completed, is_archived, is_suspended, is_abandoned,
                    priority, due_date, reminder, recurrence, tag_id, parent_task_id, sort_order,
                    my_day_date, created_at, updated_at FROM tasks",
        )?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt
            .query_map([], |row| {
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
            })?
            .flatten()
            .collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO tasks (id, title, description, is_completed, is_archived,
                 is_suspended, is_abandoned, priority, due_date, reminder, recurrence, tag_id,
                 parent_task_id, sort_order, my_day_date, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result {
                if n > 0 {
                    count += 1;
                }
            }
        }
        count
    };

    let imported_tags: usize = {
        let mut stmt = src_conn
            .prepare("SELECT id, name, color, icon, sort_order, parent_tag_id FROM tags")?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt
            .query_map([], |row| {
                Ok(vec![
                    Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                    Box::new(row.get::<_, String>(1)?),
                    Box::new(row.get::<_, String>(2)?),
                    Box::new(row.get::<_, String>(3)?),
                    Box::new(row.get::<_, i32>(4)?),
                    Box::new(row.get::<_, Option<String>>(5)?),
                ])
            })?
            .flatten()
            .collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO tags (id, name, color, icon, sort_order, parent_tag_id)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result {
                if n > 0 {
                    count += 1;
                }
            }
        }
        count
    };

    // 复制多标签关联(依赖 tasks/tags 已导入;旧库无 task_tags 表则跳过)
    let _imported_task_tags: usize = {
        if let Ok(mut stmt) = src_conn.prepare("SELECT task_id, tag_id FROM task_tags") {
            let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt
                .query_map([], |row| {
                    Ok(vec![
                        Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                        Box::new(row.get::<_, String>(1)?),
                    ])
                })?
                .flatten()
                .collect();

            let mut count = 0;
            for row in &rows {
                let result = conn.execute(
                    "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1,?2)",
                    rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
                );
                if let Ok(n) = result {
                    if n > 0 {
                        count += 1;
                    }
                }
            }
            count
        } else {
            0
        }
    };

    // 复制桌面便签(依赖 tasks 已导入;旧库无 task_notes 表则跳过)
    let _imported_task_notes: usize = {
        if let Ok(mut stmt) = src_conn.prepare(
            "SELECT task_id, x, y, width, height, always_on_top, style, collapsed FROM task_notes",
        ) {
            let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt
                .query_map([], |row| {
                    Ok(vec![
                        Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                        Box::new(row.get::<_, Option<i32>>(1)?),
                        Box::new(row.get::<_, Option<i32>>(2)?),
                        Box::new(row.get::<_, i32>(3)?),
                        Box::new(row.get::<_, i32>(4)?),
                        Box::new(row.get::<_, i32>(5)?),
                        Box::new(row.get::<_, String>(6)?),
                        Box::new(row.get::<_, i32>(7)?),
                    ])
                })?
                .flatten()
                .collect();

            let mut count = 0;
            for row in &rows {
                let result = conn.execute(
                    "INSERT OR IGNORE INTO task_notes (task_id, x, y, width, height, always_on_top, style, collapsed)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
                );
                if let Ok(n) = result {
                    if n > 0 {
                        count += 1;
                    }
                }
            }
            count
        } else {
            0
        }
    };

    let imported_reminders: usize = {
        let mut stmt = src_conn.prepare(
            "SELECT id, task_id, offset, reminder_time, reminded, created_at FROM task_reminders",
        )?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt
            .query_map([], |row| {
                Ok(vec![
                    Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                    Box::new(row.get::<_, String>(1)?),
                    Box::new(row.get::<_, String>(2)?),
                    Box::new(row.get::<_, String>(3)?),
                    Box::new(row.get::<_, i32>(4)?),
                    Box::new(row.get::<_, String>(5)?),
                ])
            })?
            .flatten()
            .collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO task_reminders (id, task_id, offset, reminder_time, reminded, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result {
                if n > 0 {
                    count += 1;
                }
            }
        }
        count
    };

    let imported_attachments: usize = {
        let mut stmt = src_conn.prepare(
            "SELECT id, task_id, original_name, storage_name, mime_type, file_size, created_at FROM attachments"
        )?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt
            .query_map([], |row| {
                Ok(vec![
                    Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                    Box::new(row.get::<_, String>(1)?),
                    Box::new(row.get::<_, String>(2)?),
                    Box::new(row.get::<_, String>(3)?),
                    Box::new(row.get::<_, String>(4)?),
                    Box::new(row.get::<_, i64>(5)?),
                    Box::new(row.get::<_, String>(6)?),
                ])
            })?
            .flatten()
            .collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO attachments (id, task_id, original_name, storage_name, mime_type, file_size, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result {
                if n > 0 {
                    count += 1;
                }
            }
        }
        count
    };

    let imported_habits: usize = {
        let mut stmt = src_conn.prepare(
            "SELECT id, name, color, icon, frequency, target_count, sort_order FROM habits",
        )?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt
            .query_map([], |row| {
                Ok(vec![
                    Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                    Box::new(row.get::<_, String>(1)?),
                    Box::new(row.get::<_, String>(2)?),
                    Box::new(row.get::<_, String>(3)?),
                    Box::new(row.get::<_, String>(4)?),
                    Box::new(row.get::<_, i32>(5)?),
                    Box::new(row.get::<_, i32>(6)?),
                ])
            })?
            .flatten()
            .collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO habits (id, name, color, icon, frequency, target_count, sort_order)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result {
                if n > 0 {
                    count += 1;
                }
            }
        }
        count
    };

    let imported_habit_logs: usize = {
        let mut stmt =
            src_conn.prepare("SELECT id, habit_id, log_date, count, note FROM habit_logs")?;
        let rows: Vec<Vec<Box<dyn rusqlite::types::ToSql>>> = stmt
            .query_map([], |row| {
                Ok(vec![
                    Box::new(row.get::<_, String>(0)?) as Box<dyn rusqlite::types::ToSql>,
                    Box::new(row.get::<_, String>(1)?),
                    Box::new(row.get::<_, String>(2)?),
                    Box::new(row.get::<_, i32>(3)?),
                    Box::new(row.get::<_, String>(4)?),
                ])
            })?
            .flatten()
            .collect();

        let mut count = 0;
        for row in &rows {
            let result = conn.execute(
                "INSERT OR IGNORE INTO habit_logs (id, habit_id, log_date, count, note)
                 VALUES (?1,?2,?3,?4,?5)",
                rusqlite::params_from_iter(row.iter().map(|v| v.as_ref())),
            );
            if let Ok(n) = result {
                if n > 0 {
                    count += 1;
                }
            }
        }
        count
    };

    // 显式选择时恢复进展记录/状态事件/覆盖与回顾(整批原子;旧备份缺表兼容)
    let progress_summary = if include_progress.unwrap_or(false) {
        let tx = conn.unchecked_transaction()?;
        let counts = crate::db::progress_repo::restore_progress_data(&tx, &src_conn)?;
        crate::db::history_repo::record_import_coverage(
            &tx,
            "从备份恢复了进展与回顾数据;导入的当前任务状态不代表本机当日活动",
        )?;
        tx.commit()?;
        format!(
            ";恢复进展与回顾数据(新增 {} 条,跳过相同 {} 条)",
            counts.inserted, counts.skipped
        )
    } else {
        String::new()
    };

    drop(conn);
    let _ = app.emit("task-changed", ());

    Ok(format!(
        "已导入 {} 个任务、{} 个标签、{} 个提醒、{} 个附件、{} 个习惯、{} 条打卡记录{}",
        imported_tasks,
        imported_tags,
        imported_reminders,
        imported_attachments,
        imported_habits,
        imported_habit_logs,
        progress_summary,
    ))
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
