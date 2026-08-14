pub mod commands;
pub mod db;
mod db_watcher;
pub mod error;
pub mod mcp;
pub mod models;
mod reminders;
pub mod shortcuts;

#[cfg(not(mobile))]
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
#[cfg(not(mobile))]
use tauri::image::Image;
#[cfg(not(mobile))]
use tauri::tray::TrayIconBuilder;
#[cfg(not(mobile))]
use tauri::Emitter;
use tauri::Manager;
#[cfg(not(mobile))]
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

/// 解析 TodoFlow 数据目录(与 Tauri app_data_dir 对齐,identifier = com.todoflow.desktop)。
/// 供 CLI/MCP 入口在无 Tauri AppHandle 时定位数据库。
pub fn default_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(PathBuf::from).map(|p| p.join("com.todoflow.desktop"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join("Library/Application Support/com.todoflow.desktop"))
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(|d| PathBuf::from(d).join("com.todoflow.desktop"))
            .or_else(|| {
                std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share/com.todoflow.desktop"))
            })
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

#[cfg(target_os = "windows")]
mod single_instance {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(
            lpMutexAttributes: *mut std::ffi::c_void,
            bInitialOwner: i32,
            lpName: *const u16,
        ) -> *mut std::ffi::c_void;
        fn GetLastError() -> u32;
        fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
    }

    #[link(name = "user32")]
    extern "system" {
        fn FindWindowW(lpClassName: *const u16, lpWindowName: *const u16) -> *mut std::ffi::c_void;
        fn ShowWindow(hWnd: *mut std::ffi::c_void, nCmdShow: i32) -> i32;
        fn SetForegroundWindow(hWnd: *mut std::ffi::c_void) -> i32;
        fn IsIconic(hWnd: *mut std::ffi::c_void) -> i32;
    }

    const SW_RESTORE: i32 = 9;
    const ERROR_ALREADY_EXISTS: u32 = 183;

    /// Returns true if another instance is already running.
    /// If so, finds the existing window and brings it to front.
    pub fn detect_and_show_existing() -> bool {
        let mutex_name: Vec<u16> = OsStr::new("TodoFlow_SingleInstance_Global_Mutex")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 1, mutex_name.as_ptr()) };
        let last_error = unsafe { GetLastError() };

        if last_error == ERROR_ALREADY_EXISTS {
            // Find the existing TodoFlow window by title
            let title: Vec<u16> = OsStr::new("TodoFlow")
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let hwnd = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };

            if !hwnd.is_null() {
                // If minimized, restore it
                if unsafe { IsIconic(hwnd) } != 0 {
                    unsafe { ShowWindow(hwnd, SW_RESTORE) };
                }
                unsafe {
                    ShowWindow(hwnd, 5); // SW_SHOW
                    SetForegroundWindow(hwnd);
                }
            }

            // Close the mutex handle before exiting
            if !handle.is_null() {
                unsafe { CloseHandle(handle) };
            }

            return true;
        }

        false
    }
}

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub data_dir: PathBuf,
    #[cfg(not(mobile))]
    pub global_shortcut_map: Arc<Mutex<HashMap<Shortcut, String>>>,
}

impl AppState {
    pub fn db(&self) -> Result<std::sync::MutexGuard<'_, Connection>, crate::error::AppError> {
        self.db
            .lock()
            .map_err(|e| crate::error::AppError::Lock(e.to_string()))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 单实例检测：如果已有实例在运行，激活已有窗口并退出
    #[cfg(target_os = "windows")]
    {
        if single_instance::detect_and_show_existing() {
            std::process::exit(0);
        }
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(not(mobile))]
    let builder = builder
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    // 从 AppState 中查找当前快捷键对应的操作 ID
                    if let Some(state) = app.try_state::<AppState>() {
                        if let Ok(map) = state.global_shortcut_map.lock() {
                            if let Some(id) = map.get(shortcut) {
                                let id = id.clone();
                                drop(map);
                                crate::shortcuts::handle_global_shortcut_action(app, &id);
                            }
                        }
                    }
                }
            })
            .build(),
    );

    let result = builder
        .setup(|app| {
            let app_dir = app.path().app_data_dir().map_err(|e| {
                eprintln!("FATAL: Failed to resolve app data directory: {}", e);
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                ))
            })?;

            if let Err(e) = std::fs::create_dir_all(&app_dir) {
                eprintln!(
                    "FATAL: Failed to create app data directory '{}': {}",
                    app_dir.display(),
                    e
                );
                return Err(Box::new(e));
            }

            let attachments_dir = app_dir.join("attachments");
            if let Err(e) = std::fs::create_dir_all(&attachments_dir) {
                eprintln!(
                    "FATAL: Failed to create attachments directory '{}': {}",
                    attachments_dir.display(),
                    e
                );
                return Err(Box::new(e));
            }

            let db_path = app_dir.join("todo.db");
            let conn = match db::connection::open(&db_path) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!(
                        "FATAL: Failed to open database '{}': {}",
                        db_path.display(),
                        e
                    );
                    return Err(Box::new(e));
                }
            };

            if let Err(e) = db::migrations::run(&conn) {
                eprintln!("FATAL: Failed to run database migrations: {}", e);
                return Err(Box::new(e));
            }

            let db = Arc::new(Mutex::new(conn));
            #[cfg(not(mobile))]
            let global_shortcut_map = Arc::new(Mutex::new(HashMap::new()));
            let state = AppState {
                db: db.clone(),
                data_dir: app_dir,
                #[cfg(not(mobile))]
                global_shortcut_map,
            };

            // Start reminder polling
            reminders::start_polling(app.handle().clone(), db.clone());

            // Start DB watcher: 检测外部进程(Agent/CLI)写入,触发前端刷新
            db_watcher::start_polling(app.handle().clone(), db_path.clone(), db.clone());

            app.manage(state);

            #[cfg(not(mobile))]
            {
                let db_for_widget = db.clone();

                // ---- System tray ----
                let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))
                    .expect("Failed to load tray icon");

                // Build tray context menu
                use tauri::menu::{MenuBuilder, MenuItemBuilder};
                let show_item = MenuItemBuilder::with_id("show", "打开主界面")
                    .build(app)
                    .expect("Failed to build show menu item");
                let settings_item = MenuItemBuilder::with_id("settings", "设置")
                    .build(app)
                    .expect("Failed to build settings menu item");
                let quit_item = MenuItemBuilder::with_id("quit", "退出")
                    .build(app)
                    .expect("Failed to build quit menu item");
                let tray_menu = MenuBuilder::new(app)
                    .item(&show_item)
                    .item(&settings_item)
                    .item(&quit_item)
                    .build()
                    .expect("Failed to build tray menu");

                let app_handle = app.handle().clone();

                let _tray = TrayIconBuilder::with_id("todoflow-tray")
                    .icon(icon)
                    .tooltip("TodoFlow")
                    .show_menu_on_left_click(false)
                    .on_tray_icon_event(move |_tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            ..
                        } = event
                        {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            if let Some(widget) = app_handle.get_webview_window("widget") {
                                let _ = widget.hide();
                            }
                        }
                    })
                    .on_menu_event(|tray, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            if let Some(widget) = tray.app_handle().get_webview_window("widget") {
                                let _ = widget.hide();
                            }
                        }
                        "settings" => {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            if let Some(widget) = tray.app_handle().get_webview_window("widget") {
                                let _ = widget.hide();
                            }
                            let _ = tray
                                .app_handle()
                                .emit_to("main", "navigate-to-settings", ());
                        }
                        "quit" => {
                            let app = tray.app_handle();
                            let _ = app.exit(0);
                        }
                        _ => {}
                    })
                    .menu(&tray_menu)
                    .build(app)?;

                // Intercept main window close → hide + maybe show widget
                if let Some(window) = app.get_webview_window("main") {
                    let win_clone = window.clone();
                    let db_close = db_for_widget.clone();
                    let app_close = app.handle().clone();
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = win_clone.hide();
                            let enabled = db_close
                                .lock()
                                .ok()
                                .and_then(|db| {
                                    db.query_row(
                                        "SELECT value FROM settings WHERE key = 'widget_enabled'",
                                        rusqlite::params![],
                                        |row| row.get::<_, String>(0),
                                    )
                                    .ok()
                                })
                                .map(|v| v != "0")
                                .unwrap_or(true);
                            if enabled {
                                if let Some(widget) = app_close.get_webview_window("widget") {
                                    let _ = widget.show();
                                    // 通知前端以气泡形态出现并校正位置(悬浮球贴边时面板会展开到屏外)
                                    let _ = app_close.emit_to("widget", "widget-shown", ());
                                }
                            }
                        }
                    });
                }

                // ---- Desktop widget window ----
                let widget = tauri::WebviewWindowBuilder::new(
                    app,
                    "widget",
                    tauri::WebviewUrl::App("/?widget=1".into()),
                )
                .title("TodoFlow Widget")
                .inner_size(300.0, 420.0)
                .min_inner_size(80.0, 80.0)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .visible(false)
                .transparent(true)
                .shadow(false)
                .build()?;

                // Try to restore saved widget position from settings
                let mut positioned = false;
                if let Ok(db) = db_for_widget.lock() {
                    let x_str: Option<String> = db
                        .query_row(
                            "SELECT value FROM settings WHERE key = 'widget_x'",
                            rusqlite::params![],
                            |row| row.get(0),
                        )
                        .ok();
                    let y_str: Option<String> = db
                        .query_row(
                            "SELECT value FROM settings WHERE key = 'widget_y'",
                            rusqlite::params![],
                            |row| row.get(0),
                        )
                        .ok();
                    if let (Some(x_str), Some(y_str)) = (x_str, y_str) {
                        if let (Ok(x), Ok(y)) = (x_str.parse::<i32>(), y_str.parse::<i32>()) {
                            let _ = widget.set_position(tauri::PhysicalPosition::new(x, y));
                            positioned = true;
                        }
                    }
                }
                // Fallback: bottom-right corner of primary monitor
                if !positioned {
                    if let Ok(monitors) = widget.available_monitors() {
                        if let Some(monitor) = monitors.into_iter().next() {
                            let size = monitor.size();
                            let scale = monitor.scale_factor();
                            let x = (size.width as f64 / scale) - 310.0;
                            let y = (size.height as f64 / scale) - 440.0;
                            let _ = widget
                                .set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                        }
                    }
                }

                // ---- Pomodoro standalone window ----
                let pomodoro_win = tauri::WebviewWindowBuilder::new(
                    app,
                    "pomodoro",
                    tauri::WebviewUrl::App("/?pomodoro=1".into()),
                )
                .title("TodoFlow Pomodoro")
                .inner_size(190.0, 200.0)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(true)
                .visible(false)
                .transparent(true)
                .shadow(false)
                .build()?;

                // Try to restore saved pomodoro position from settings
                let mut pomo_positioned = false;
                if let Ok(db) = db_for_widget.lock() {
                    let x_str: Option<String> = db
                        .query_row(
                            "SELECT value FROM settings WHERE key = 'pomodoro_x'",
                            rusqlite::params![],
                            |row| row.get(0),
                        )
                        .ok();
                    let y_str: Option<String> = db
                        .query_row(
                            "SELECT value FROM settings WHERE key = 'pomodoro_y'",
                            rusqlite::params![],
                            |row| row.get(0),
                        )
                        .ok();
                    if let (Some(x_str), Some(y_str)) = (x_str, y_str) {
                        if let (Ok(x), Ok(y)) = (x_str.parse::<i32>(), y_str.parse::<i32>()) {
                            let _ = pomodoro_win.set_position(tauri::PhysicalPosition::new(x, y));
                            pomo_positioned = true;
                        }
                    }
                }
                // Fallback: bottom-right above widget area
                if !pomo_positioned {
                    if let Ok(monitors) = pomodoro_win.available_monitors() {
                        if let Some(monitor) = monitors.into_iter().next() {
                            let size = monitor.size();
                            let scale = monitor.scale_factor();
                            let x = (size.width as f64 / scale) - 240.0;
                            let y = (size.height as f64 / scale) - 540.0;
                            let _ = pomodoro_win
                                .set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                        }
                    }
                }

                // ---- Task note windows (启动时重建全部便签) ----
                {
                    let notes = db_for_widget
                        .lock()
                        .ok()
                        .and_then(|conn| crate::db::task_note_repo::get_all(&conn).ok())
                        .unwrap_or_default();
                    for note in notes.iter() {
                        if let Err(e) = commands::note_commands::build_note_window(
                            app.handle(),
                            db_for_widget.clone(),
                            note,
                        ) {
                            eprintln!(
                                "Warning: Failed to restore note window for task {}: {}",
                                note.task_id, e
                            );
                        }
                    }
                }

                // ---- Global shortcuts ----
                // 使用动态注册，从 settings 表中读取用户自定义的快捷键配置
                {
                    let app_state = app.state::<AppState>();
                    let conn = app_state.db.lock().map_err(|e| {
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            e.to_string(),
                        ))
                    })?;
                    if let Err(e) = crate::shortcuts::register_global_shortcuts(app.handle(), &conn)
                    {
                        eprintln!("Warning: Failed to register global shortcuts: {}", e);
                    }
                }

                // Clicking X closes the app; use the tray menu "Quit" or Ctrl+Shift+T to reopen
                // Hide-to-widget is available via the hide_to_tray command (called from frontend)
            }

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
            commands::reminder_commands::get_task_reminders,
            commands::reminder_commands::create_task_reminder,
            commands::reminder_commands::delete_task_reminder,
            commands::reminder_commands::clear_task_reminders,
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
            commands::settings_commands::export_csv,
            commands::settings_commands::import_database,
            commands::settings_commands::write_debug_log,
            commands::shortcut_commands::update_global_shortcuts,
            commands::shortcut_commands::get_all_shortcuts,
            commands::widget_commands::hide_to_tray,
            commands::widget_commands::show_main_from_widget,
            commands::widget_commands::show_widget_context_menu,
            commands::widget_commands::show_pomodoro_window,
            commands::widget_commands::hide_pomodoro_window,
            commands::note_commands::open_task_note,
            commands::note_commands::close_task_note,
            commands::note_commands::get_task_note,
            commands::note_commands::get_all_task_notes,
            commands::note_commands::set_note_always_on_top,
            commands::note_commands::set_note_style,
            commands::note_commands::set_note_collapsed,
            commands::stats_commands::get_dashboard_stats,
            commands::habit_commands::create_habit,
            commands::habit_commands::get_habits,
            commands::habit_commands::update_habit,
            commands::habit_commands::delete_habit,
            commands::habit_commands::reorder_habits,
            commands::habit_commands::toggle_habit_log,
            commands::sync_commands::get_sync_meta,
            commands::sync_commands::set_sync_meta,
            commands::sync_commands::list_sync_meta,
            commands::sync_commands::record_sync_operation,
            commands::sync_commands::list_sync_operations,
            commands::sync_commands::mark_sync_operation_status,
            commands::sync_commands::increment_sync_operation_retry,
            commands::sync_commands::save_sync_conflict,
            commands::sync_commands::list_sync_conflicts,
            commands::sync_commands::resolve_sync_conflict,
            commands::sync_commands::derive_sync_status,
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
                MessageBoxW(
                    std::ptr::null_mut(),
                    msg.as_ptr(),
                    title.as_ptr(),
                    0x00000010,
                );
            }
        }

        std::process::exit(1);
    }
}
