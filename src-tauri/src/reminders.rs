use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use chrono::Local;
use rusqlite::Connection;
use tauri::AppHandle;
use tauri::Emitter;

pub fn start_polling(app_handle: AppHandle, db: Arc<Mutex<Connection>>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(60));

        let now = Local::now().format("%Y-%m-%d %H:%M").to_string();

        let conn = match db.lock() {
            Ok(c) => c,
            Err(e) => { eprintln!("[reminder] Failed to acquire db lock: {}", e); continue; }
        };

        let result: Result<Vec<(String, String, String)>, _> = {
            let mut stmt = match conn.prepare(
                "SELECT t.id, t.title, t.reminder
                 FROM tasks t
                 WHERE t.is_completed = 0
                   AND t.is_archived = 0
                   AND t.is_suspended = 0
                   AND t.is_abandoned = 0
                   AND t.reminder IS NOT NULL
                   AND t.reminder <= ?1
                   AND t.reminded = 0",
            ) {
                Ok(s) => s,
                Err(e) => { eprintln!("[reminder] Failed to prepare query: {}", e); continue; }
            };

            stmt.query_map([&now], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        };

        if let Ok(tasks) = result {
            for (task_id, title, _reminder) in tasks {
                // Mark as reminded
                if let Err(e) = conn.execute(
                    "UPDATE tasks SET reminded = 1 WHERE id = ?1",
                    [&task_id],
                ) {
                    eprintln!("[reminder] Failed to mark task {} as reminded: {}", task_id, e);
                }

                // Send OS notification
                use tauri_plugin_notification::NotificationExt;
                let _ = app_handle
                    .notification()
                    .builder()
                    .title("TodoFlow Reminder")
                    .body(&title)
                    .show();

                // Also emit event for in-app handling
                let _ = app_handle.emit_to("main", "reminder-triggered", serde_json::json!({
                    "task_id": task_id,
                    "title": title,
                }));
            }
        }
    });
}
