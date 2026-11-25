pub mod ai;
pub mod alerts;
pub mod commands;
pub mod db;
mod db_watcher;
pub mod error;
pub mod mcp;
pub mod models;
mod reminders;
pub mod shortcuts;
pub mod workspace;
#[cfg(not(mobile))]
mod window_state;

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
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .map(|p| p.join("com.todoflow.desktop"))
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
                std::env::var_os("HOME")
                    .map(|h| PathBuf::from(h).join(".local/share/com.todoflow.desktop"))
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
    const MUTEX_NAME: &str = "TodoFlow_SingleInstance_Global_Mutex";

    fn wide(text: &str) -> Vec<u16> {
        OsStr::new(text).encode_wide().chain(std::iter::once(0)).collect()
    }

    /// 名为 `mutex_name` 的互斥量是否已被某个进程持有。只探测,不占用。
    fn mutex_is_held(mutex_name: &[u16]) -> bool {
        let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 1, mutex_name.as_ptr()) };
        let already_exists = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;

        if !handle.is_null() {
            unsafe { CloseHandle(handle) };
        }

        already_exists
    }

    /// 单实例锁是否已被某个进程持有。只探测,不占用。
    pub fn is_another_instance_running() -> bool {
        mutex_is_held(&wide(MUTEX_NAME))
    }

    /// Returns true if another instance is already running.
    /// If so, finds the existing window and brings it to front.
    pub fn detect_and_show_existing() -> bool {
        let mutex_name = wide(MUTEX_NAME);

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

    #[cfg(test)]
    mod tests {
        use super::*;

        /// 用一个测试专用的锁名,不受机器上正在运行的 TodoFlow 影响
        fn test_mutex() -> Vec<u16> {
            wide(&format!("TodoFlow_SingleInstance_Test_{}", std::process::id()))
        }

        /// 探测只看锁在不在,不会把锁占住:本进程持锁期间报告"已被占用",
        /// 放手之后恢复原样。
        #[test]
        fn detects_a_held_mutex_without_taking_it() {
            let name = test_mutex();
            assert!(!mutex_is_held(&name));

            let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 1, name.as_ptr()) };
            assert!(!handle.is_null());
            assert!(mutex_is_held(&name));

            unsafe { CloseHandle(handle) };
            assert!(!mutex_is_held(&name));
        }

        /// 等待逻辑与真实的探测配合:锁被占用时等待,释放后继续
        #[test]
        fn wait_ends_once_the_other_instance_releases_the_lock() {
            let tmp = tempfile::tempdir().unwrap();
            crate::workspace::set_restart_marker(tmp.path()).unwrap();

            let name = test_mutex();
            let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 1, name.as_ptr()) };
            assert!(mutex_is_held(&name));
            // 裸指针不能跨线程移动,按整数带过去
            let raw = handle as usize;
            let started = std::time::Instant::now();
            let releaser = std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(400));
                unsafe { CloseHandle(raw as *mut std::ffi::c_void) };
            });
            let proceed = crate::workspace::wait_for_previous_instance(
                tmp.path(),
                crate::workspace::RESTART_WAIT_LIMIT,
                || mutex_is_held(&name),
            );
            releaser.join().unwrap();

            assert!(proceed);
            assert!(started.elapsed() >= std::time::Duration::from_millis(400));
        }
    }
}

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    /// 当前工作区的数据目录(数据库与附件所在)
    pub data_dir: PathBuf,
    /// 应用数据目录(工作区清单、窗口状态等属于应用的东西所在)
    pub app_data_dir: PathBuf,
    #[cfg(not(mobile))]
    pub global_shortcut_map: Arc<Mutex<HashMap<Shortcut, String>>>,
    /// AI 模型请求运行时(HTTP 客户端、并发槽、取消注册表);网络执行不持数据库锁。
    pub ai_runtime: Arc<crate::ai::gateway::AiRuntime>,
}

impl AppState {
    pub fn db(&self) -> Result<std::sync::MutexGuard<'_, Connection>, crate::error::AppError> {
        self.db
            .lock()
            .map_err(|e| crate::error::AppError::Lock(e.to_string()))
    }
}

/// 应用退出前的收尾。
pub(crate) fn on_exit(handle: &tauri::AppHandle) {
    // 把主窗口最新的位置与尺寸落盘
    #[cfg(not(mobile))]
    window_state::flush(handle);
    #[cfg(mobile)]
    let _ = handle;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // `tauri dev` 直接启动的进程充当“锚”:不初始化应用,只等应用结束,让开发会话活过工作区切换。
    // 见 workspace::dev_handover。其余构建里这一步什么都不做。
    #[cfg(target_os = "windows")]
    if let Some(code) = workspace::dev_handover::anchor_dev_session() {
        std::process::exit(code);
    }
    #[cfg(target_os = "windows")]
    workspace::dev_handover::watch_anchor();

    // 单实例检测：如果已有实例在运行，激活已有窗口并退出
    #[cfg(target_os = "windows")]
    {
        // 切换工作区后的重启:先等旧实例退出并释放单实例锁,
        // 否则新实例会被当成第二次启动,显示旧窗口后直接退出,应用就此消失。
        if let Some(dir) = default_data_dir() {
            workspace::wait_for_previous_instance(
                &dir,
                workspace::RESTART_WAIT_LIMIT,
                single_instance::is_another_instance_running,
            );
        }
        if single_instance::detect_and_show_existing() {
            std::process::exit(0);
        }
    }
    // 走到这里说明本实例将正常启动:重启标记(如果有)随之清除。
    // 等不到旧实例退出而超时的那次会作为第二实例退出,标记留给下一次启动处理。
    #[cfg(not(mobile))]
    if let Some(dir) = default_data_dir() {
        workspace::clear_restart_marker(&dir);
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
                Box::new(std::io::Error::other(e.to_string()))
            })?;

            if let Err(e) = std::fs::create_dir_all(&app_dir) {
                eprintln!(
                    "FATAL: Failed to create app data directory '{}': {}",
                    app_dir.display(),
                    e
                );
                return Err(Box::new(e));
            }

            #[cfg(not(mobile))]
            let window_tracker = match app.get_webview_window("main") {
                Some(main) => {
                    // 主窗口建成时是隐藏的:先恢复上次的位置与尺寸,再显示
                    let restored = window_state::restore(&main, &app_dir);
                    Some(window_state::track(&main, &app_dir, restored))
                }
                None => None,
            };

            // 打开当前激活的工作区。清单不存在时,现有数据原地登记为"默认工作区"。
            #[cfg(not(mobile))]
            let startup = workspace::resolve_for_startup(&app_dir)?;
            // 当前工作区的数据目录;移动端沿用应用数据目录
            #[cfg(not(mobile))]
            let data_dir = startup.data_dir.clone();
            #[cfg(mobile)]
            let data_dir = app_dir.clone();

            let attachments_dir = data_dir.join("attachments");
            if let Err(e) = std::fs::create_dir_all(&attachments_dir) {
                eprintln!(
                    "FATAL: Failed to create attachments directory '{}': {}",
                    attachments_dir.display(),
                    e
                );
                return Err(Box::new(e));
            }

            let db_path = data_dir.join("todo.db");
            #[cfg(not(mobile))]
            let conn = startup.conn;
            #[cfg(mobile)]
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

            #[cfg(mobile)]
            if let Err(e) = db::migrations::run(&conn) {
                eprintln!("FATAL: Failed to run database migrations: {}", e);
                return Err(Box::new(e));
            }

            let db = Arc::new(Mutex::new(conn));
            #[cfg(not(mobile))]
            let global_shortcut_map = Arc::new(Mutex::new(HashMap::new()));
            let state = AppState {
                db: db.clone(),
                data_dir,
                app_data_dir: app_dir.clone(),
                #[cfg(not(mobile))]
                global_shortcut_map,
                ai_runtime: Arc::new(crate::ai::gateway::AiRuntime::new()),
            };

            // Start reminder polling
            // 注意:实际启动挪到 setup 末尾(见下方),确保 reminder-alert 窗口已创建,
            // 启动即查时不丢首轮弹窗。

            // Start DB watcher: 检测外部进程(Agent/CLI)写入,触发前端刷新
            db_watcher::start_polling(app.handle().clone(), db_path.clone(), db.clone());

            app.manage(state);
            // 提醒弹窗待处理队列(轮询线程入队,alert 命令消费)
            app.manage(alerts::AlertState::default());
            // 启动时要告知用户的事(例如激活的工作区打不开而回退)
            #[cfg(not(mobile))]
            app.manage(commands::workspace_commands::StartupNotice(Mutex::new(
                startup.notice,
            )));
            #[cfg(not(mobile))]
            if let Some(tracker) = window_tracker {
                app.manage(tracker);
            }

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
                            app.exit(0);
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

                // ---- Reminder alert window (提醒弹窗,常驻隐藏,到期弹出) ----
                let alert_win = tauri::WebviewWindowBuilder::new(
                    app,
                    crate::reminders::ALERT_WINDOW_LABEL,
                    tauri::WebviewUrl::App("/?reminder=1".into()),
                )
                .title("TodoFlow 提醒")
                .inner_size(420.0, 380.0)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .visible(false)
                .center()
                .build()?;
                {
                    let alert_win_event = alert_win.clone();
                    alert_win.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            // 同便签窗口:本进程内一旦 destroy 任何窗口,后续
                            // WebviewWindowBuilder::build() 必死锁(tauri 2.11 /
                            // Windows WebView2)。这里只隐藏不销毁;队列非空时
                            // 下一轮轮询会重新弹出。
                            api.prevent_close();
                            let _ = alert_win_event.hide();
                        }
                    });
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
                    let conn = app_state
                        .db
                        .lock()
                        .map_err(|e| Box::new(std::io::Error::other(e.to_string())))?;
                    if let Err(e) = crate::shortcuts::register_global_shortcuts(app.handle(), &conn)
                    {
                        eprintln!("Warning: Failed to register global shortcuts: {}", e);
                    }
                }

                // Clicking X closes the app; use the tray menu "Quit" or Ctrl+Shift+T to reopen
                // Hide-to-widget is available via the hide_to_tray command (called from frontend)
            }

            // Start reminder polling(桌面窗口已就绪,启动首轮检查可立即弹出漏掉的提醒)
            reminders::start_polling(app.handle().clone(), db.clone());

            // 主窗口以隐藏状态创建(位置恢复之前不闪现);一切就绪后再显示
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
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
            commands::alert_commands::get_pending_alerts,
            commands::alert_commands::dismiss_alert,
            commands::alert_commands::snooze_alert,
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
            commands::workspace_commands::list_workspaces,
            commands::workspace_commands::create_workspace,
            commands::workspace_commands::add_workspace_from_file,
            commands::workspace_commands::rename_workspace,
            commands::workspace_commands::delete_workspace,
            commands::workspace_commands::activate_workspace,
            commands::workspace_commands::get_startup_notice,
            commands::backup_recovery_commands::inspect_backup,
            commands::backup_recovery_commands::recover_from_backup,
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
            commands::ai_commands::ai_create_connection,
            commands::ai_commands::ai_update_connection,
            commands::ai_commands::ai_delete_connection,
            commands::ai_commands::ai_set_connection_enabled,
            commands::ai_commands::ai_set_connection_timeout,
            commands::ai_commands::ai_list_connections,
            commands::ai_commands::ai_list_models,
            commands::ai_commands::ai_create_model,
            commands::ai_commands::ai_update_model,
            commands::ai_commands::ai_delete_model,
            commands::ai_commands::ai_get_default_model,
            commands::ai_commands::ai_set_default_model,
            commands::ai_commands::ai_credential_exists,
            commands::ai_commands::ai_get_presets,
            commands::ai_commands::ai_cancel_request,
            commands::ai_commands::ai_list_invocations,
            commands::ai_commands::ai_clear_invocations,
            commands::ai_commands::ai_fetch_models,
            commands::ai_commands::ai_verify_model,
            commands::ai_commands::ai_generate_breakdown,
            commands::ai_commands::ai_apply_breakdown,
            commands::ai_commands::ai_polish_description,
            commands::ai_my_day_commands::ai_prepare_my_day_context,
            commands::ai_my_day_commands::ai_generate_my_day_plan,
            commands::ai_my_day_commands::ai_apply_my_day_plan,
            commands::ai_my_day_commands::ai_get_my_day_plan,
            commands::ai_my_day_commands::ai_clear_my_day_plan,
            commands::progress_commands::progress_create_record,
            commands::progress_commands::progress_update_record,
            commands::progress_commands::progress_delete_record,
            commands::progress_commands::progress_list_records,
            commands::progress_commands::progress_list_events,
            commands::progress_commands::progress_get_overview,
            commands::progress_commands::get_history_retention,
            commands::progress_commands::set_history_retention,
            commands::progress_commands::clear_state_events_range,
            commands::progress_commands::get_history_coverage,
            commands::progress_commands::get_review_facts,
            commands::progress_commands::review_list_material,
            commands::progress_commands::get_saved_review,
            commands::progress_commands::save_review,
            commands::progress_commands::delete_review,
            commands::ai_commands::ai_prepare_review_context,
            commands::ai_commands::ai_get_review_context_status,
            commands::ai_commands::ai_generate_review,
        ])
        .build(tauri::generate_context!())
        .map(|app| {
            // 不用 Builder::run,以便在退出前(包括切换工作区引起的重启)收尾
            app.run(|handle, event| {
                if let tauri::RunEvent::Exit = event {
                    on_exit(handle);
                }
            })
        });

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
