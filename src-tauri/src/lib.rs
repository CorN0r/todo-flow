pub mod commands;
pub mod db;
pub mod error;
pub mod models;
mod reminders;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use tauri::Emitter;
use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tauri::image::Image;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn db(&self) -> Result<std::sync::MutexGuard<'_, Connection>, crate::error::AppError> {
        self.db.lock().map_err(|e| crate::error::AppError::Lock(e.to_string()))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    if let Some(widget) = app.get_webview_window("widget") {
                        let _ = widget.hide();
                    }
                    let _ = app.emit("global-shortcut-new-task", ());
                }
            })
            .build())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().map_err(|e| {
                eprintln!("FATAL: Failed to resolve app data directory: {}", e);
                Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
            })?;

            if let Err(e) = std::fs::create_dir_all(&app_dir) {
                eprintln!("FATAL: Failed to create app data directory '{}': {}", app_dir.display(), e);
                return Err(Box::new(e));
            }

            let attachments_dir = app_dir.join("attachments");
            if let Err(e) = std::fs::create_dir_all(&attachments_dir) {
                eprintln!("FATAL: Failed to create attachments directory '{}': {}", attachments_dir.display(), e);
                return Err(Box::new(e));
            }

            let db_path = app_dir.join("todo.db");
            let conn = match db::connection::open(&db_path) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("FATAL: Failed to open database '{}': {}", db_path.display(), e);
                    return Err(Box::new(e));
                }
            };

            if let Err(e) = db::migrations::run(&conn) {
                eprintln!("FATAL: Failed to run database migrations: {}", e);
                return Err(Box::new(e));
            }

            let db = Arc::new(Mutex::new(conn));
            let state = AppState {
                db: db.clone(),
                data_dir: app_dir,
            };

            // Start reminder polling
            reminders::start_polling(app.handle().clone(), db);

            app.manage(state);

            // ---- System tray ----
            let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .expect("Failed to load tray icon");

            // Build tray context menu
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            let quit_item = MenuItemBuilder::with_id("quit", "Quit")
                .build(app)
                .expect("Failed to build quit menu item");
            let tray_menu = MenuBuilder::new(app)
                .item(&quit_item)
                .build()
                .expect("Failed to build tray menu");

            let app_handle = app.handle().clone();

            let _tray = TrayIconBuilder::with_id("todoflow-tray")
                .icon(icon)
                .tooltip("TodoFlow")
                .on_tray_icon_event(move |_tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        if let Some(widget) = app_handle.get_webview_window("widget") {
                            let _ = widget.hide();
                        }
                    }
                })
                .on_menu_event(|tray, event| {
                    if event.id.as_ref() == "quit" {
                        let app = tray.app_handle();
                        let _ = app.exit(0);
                    }
                })
                .menu(&tray_menu)
                .build(app)?;

            // ---- Desktop widget window ----
            let widget = tauri::WebviewWindowBuilder::new(
                app,
                "widget",
                tauri::WebviewUrl::App("/widget".into()),
            )
            .title("TodoFlow Widget")
            .inner_size(240.0, 320.0)
            .min_inner_size(220.0, 280.0)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .transparent(true)
            .build()?;

            // Position widget at bottom-right corner of primary monitor
            if let Ok(monitors) = widget.available_monitors() {
                if let Some(monitor) = monitors.into_iter().next() {
                    let size = monitor.size();
                    let scale = monitor.scale_factor();
                    let x = (size.width as f64 / scale) - 250.0;
                    let y = (size.height as f64 / scale) - 340.0;
                    let _ = widget.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                }
            }

            // ---- Global shortcut: Ctrl+Shift+T → show main + quick add ----
            app.handle().global_shortcut().register(
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyT),
            ).expect("Failed to register global shortcut Ctrl+Shift+T");

            // Clicking X closes the app; use the tray menu "Quit" or Ctrl+Shift+T to reopen
            // Hide-to-widget is available via the hide_to_tray command (called from frontend)

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::task_commands::create_task,
            commands::task_commands::get_task,
            commands::task_commands::update_task,
            commands::task_commands::delete_task,
            commands::task_commands::reorder_tasks,
            commands::task_commands::get_tasks,
            commands::task_commands::duplicate_task,
            commands::task_commands::add_task_to_my_day,
            commands::task_commands::remove_task_from_my_day,
            commands::task_commands::get_today_task_count,
            commands::tag_commands::create_tag,
            commands::tag_commands::get_tags,
            commands::tag_commands::update_tag,
            commands::tag_commands::delete_tag,
            commands::tag_commands::reorder_tags,
            commands::attachment_commands::upload_attachment,
            commands::attachment_commands::upload_attachments_bulk,
            commands::attachment_commands::upload_link_attachment,
            commands::attachment_commands::get_attachments,
            commands::attachment_commands::delete_attachment,
            commands::attachment_commands::get_attachment_file_path,
            commands::settings_commands::get_setting,
            commands::settings_commands::set_setting,
            commands::settings_commands::get_all_settings,
            commands::settings_commands::backup_database,
            commands::widget_commands::hide_to_tray,
            commands::widget_commands::show_main_from_widget,
            commands::stats_commands::get_dashboard_stats,
            commands::habit_commands::create_habit,
            commands::habit_commands::get_habits,
            commands::habit_commands::update_habit,
            commands::habit_commands::delete_habit,
            commands::habit_commands::reorder_habits,
            commands::habit_commands::toggle_habit_log,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        let error_msg = format!("TodoFlow failed to start:\n\n{}", e);
        eprintln!("FATAL: {}", error_msg);

        let log_path = std::env::temp_dir().join("todoflow_error.log");
        let _ = std::fs::write(&log_path, &error_msg);

        #[cfg(target_os = "windows")]
        {
            use std::ffi::OsStr;
            use std::os::windows::ffi::OsStrExt;
            let title: Vec<u16> = OsStr::new("TodoFlow Error")
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let msg: Vec<u16> = OsStr::new(&error_msg)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            unsafe {
                #[link(name = "user32")]
                extern "system" {
                    fn MessageBoxW(
                        hwnd: *mut std::ffi::c_void,
                        text: *const u16,
                        caption: *const u16,
                        uType: u32,
                    ) -> i32;
                }
                MessageBoxW(std::ptr::null_mut(), msg.as_ptr(), title.as_ptr(), 0x00000010);
            }
        }

        std::process::exit(1);
    }
}
