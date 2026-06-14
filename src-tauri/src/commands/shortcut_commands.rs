use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::AppState;

/// 更新全局快捷键配置（由前端在修改设置后调用）
#[tauri::command]
pub fn update_global_shortcuts(
    app: AppHandle,
    state: State<AppState>,
    shortcuts_json: String,
) -> Result<(), AppError> {
    // 1. 持久化到数据库
    {
        let conn = state.db()?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('keyboard_shortcuts', ?1)",
            rusqlite::params![shortcuts_json],
        )?;
    }

    // 2. 重新注册全局快捷键
    let conn = state.db()?;
    crate::shortcuts::reload_global_shortcuts(&app, &conn)?;

    Ok(())
}

/// 获取所有快捷键配置（JSON 字符串）
#[tauri::command]
pub fn get_all_shortcuts(state: State<AppState>) -> Result<String, AppError> {
    let conn = state.db()?;
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'keyboard_shortcuts'",
            rusqlite::params![],
            |row| row.get(0),
        )
        .ok();

    Ok(raw.unwrap_or_else(|| {
        // 返回默认值
        r#"{"global-show-window":{"keys":"Ctrl+Shift+T","enabled":true},"command-palette":{"keys":"Ctrl+K","enabled":true},"toggle-sidebar":{"keys":"Ctrl+B","enabled":true},"new-task":{"keys":"N","enabled":true}}"#
            .to_string()
    }))
}
