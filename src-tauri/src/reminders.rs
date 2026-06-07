use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use chrono::Local;
use rusqlite::Connection;
use tauri::AppHandle;
use tauri::Emitter;

use crate::db::reminder_repo;

pub fn start_polling(app_handle: AppHandle, db: Arc<Mutex<Connection>>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(60));

        let now = Local::now().format("%Y-%m-%d %H:%M").to_string();

        let conn = match db.lock() {
            Ok(c) => c,
            Err(e) => { eprintln!("[reminder] Failed to acquire db lock: {}", e); continue; }
        };

        let reminders = match reminder_repo::get_due_reminders(&conn, &now) {
            Ok(r) => r,
            Err(e) => { eprintln!("[reminder] Query failed: {}", e); continue; }
        };

        for (reminder_id, title) in reminders {
            if let Err(e) = reminder_repo::mark_reminded(&conn, &reminder_id) {
                eprintln!("[reminder] Failed to mark {} as reminded: {}", reminder_id, e);
            }

            use tauri_plugin_notification::NotificationExt;
            let _ = app_handle
                .notification()
                .builder()
                .title("TodoFlow Reminder")
                .body(&title)
                .show();

            let _ = app_handle.emit_to("main", "reminder-triggered", serde_json::json!({
                "task_id": "",
                "title": title,
            }));
        }
    });
}
