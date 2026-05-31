use crate::error::AppError;
use crate::AppState;
use rusqlite::params;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn hide_to_tray(app: AppHandle, state: State<AppState>) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| AppError::Generic(e.to_string()))?;
    }
    if let Ok(db) = state.db() {
        let _ = db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('widget_enabled', '1')", params![]);
    }
    if let Some(widget) = app.get_webview_window("widget") {
        widget.show().map_err(|e| AppError::Generic(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn show_main_from_widget(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| AppError::Generic(e.to_string()))?;
        window.set_focus().map_err(|e| AppError::Generic(e.to_string()))?;
    }
    if let Some(widget) = app.get_webview_window("widget") {
        widget.hide().map_err(|e| AppError::Generic(e.to_string()))?;
    }
    Ok(())
}
