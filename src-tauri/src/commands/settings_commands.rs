use std::collections::HashMap;

use rusqlite::params;
use tauri::State;

use crate::error::AppError;
use crate::AppState;

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, AppError> {
    let conn = state.db.lock().unwrap();
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
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

#[tauri::command]
pub fn get_all_settings(state: State<AppState>) -> Result<HashMap<String, String>, AppError> {
    let conn = state.db.lock().unwrap();
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
