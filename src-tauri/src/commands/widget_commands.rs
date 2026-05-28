use crate::error::AppError;
use tauri::AppHandle;
use tauri::Manager;

#[tauri::command]
pub fn hide_to_tray(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| AppError::Generic(e.to_string()))?;
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
