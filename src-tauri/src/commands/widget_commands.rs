use crate::error::AppError;
use crate::AppState;
use rusqlite::params;
use tauri::{AppHandle, Manager, State};
use tauri::menu::{MenuBuilder, MenuItemBuilder};

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

#[tauri::command]
pub fn show_widget_context_menu(app: AppHandle, state: State<AppState>, _x: f64, _y: f64) -> Result<(), AppError> {
    if let Some(widget) = app.get_webview_window("widget") {
        let show_item = MenuItemBuilder::with_id("show_main", "打开主界面").build(&app).unwrap();
        let hide_item = MenuItemBuilder::with_id("hide_widget", "不再显示悬浮窗").build(&app).unwrap();
        let menu = MenuBuilder::new(&app).item(&show_item).item(&hide_item).build().unwrap();

        let app_clone = app.clone();
        let db = state.db.clone();
        app.on_menu_event(move |_app_handle, event| {
            if event.id().as_ref() == "show_main" {
                if let Some(win) = app_clone.get_webview_window("main") {
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                }
                if let Some(w) = app_clone.get_webview_window("widget") {
                    let _ = w.hide();
                }
            } else if event.id().as_ref() == "hide_widget" {
                if let Some(w) = app_clone.get_webview_window("widget") {
                    let _ = w.hide();
                }
                if let Ok(db) = db.lock() {
                    let _ = db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('widget_enabled', '0')", params![]);
                }
            }
        });

        widget.popup_menu(&menu)
            .map_err(|e| AppError::Generic(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn show_pomodoro_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window("pomodoro") {
        win.show().map_err(|e| AppError::Generic(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_pomodoro_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window("pomodoro") {
        win.hide().map_err(|e| AppError::Generic(e.to_string()))?;
    }
    Ok(())
}

