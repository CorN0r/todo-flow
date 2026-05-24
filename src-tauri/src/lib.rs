mod commands;
mod db;
mod error;
mod models;

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub data_dir: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
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

            app.manage(AppState {
                db: Mutex::new(conn),
                data_dir: app_dir,
            });

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
            commands::list_commands::create_list,
            commands::list_commands::get_lists,
            commands::list_commands::update_list,
            commands::list_commands::delete_list,
            commands::list_commands::reorder_lists,
            commands::attachment_commands::upload_attachment,
            commands::attachment_commands::upload_attachments_bulk,
            commands::attachment_commands::get_attachments,
            commands::attachment_commands::delete_attachment,
            commands::attachment_commands::get_attachment_file_path,
            commands::settings_commands::get_setting,
            commands::settings_commands::set_setting,
            commands::settings_commands::get_all_settings,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        let error_msg = format!("TodoFlow failed to start:\n\n{}", e);
        eprintln!("FATAL: {}", error_msg);

        // Write error to temp directory for debugging
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
