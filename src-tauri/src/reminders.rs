use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use chrono::Local;
use rusqlite::Connection;
use tauri::AppHandle;
use tauri::Emitter;

pub fn start_polling(app_handle: AppHandle, db: &Mutex<Connection>) {
    let db_ptr: *const Mutex<Connection> = db;
    // SAFETY: We ensure the Mutex outlives the thread (it lives in AppState which is managed).
    let db_ref: &'static Mutex<Connection> = unsafe { &*db_ptr };

    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(60));

        let now = Local::now().format("%Y-%m-%d %H:%M").to_string();

        let conn = match db_ref.lock() {
            Ok(c) => c,
            Err(_) => continue,
        };

        let result: Result<Vec<(String, String, String)>, _> = {
            let mut stmt = match conn.prepare(
                "SELECT t.id, t.title, t.reminder
                 FROM tasks t
                 WHERE t.is_completed = 0
                   AND t.is_archived = 0
                   AND t.reminder IS NOT NULL
                   AND t.reminder <= ?1
                   AND t.reminded = 0",
            ) {
                Ok(s) => s,
                Err(_) => continue,
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
                let _ = conn.execute(
                    "UPDATE tasks SET reminded = 1 WHERE id = ?1",
                    [&task_id],
                );

                // Send OS notification
                use tauri_plugin_notification::NotificationExt;
                let _ = app_handle
                    .notification()
                    .builder()
                    .title("TodoFlow Reminder")
                    .body(&title)
                    .show();

                // Also emit event for in-app handling
                let _ = app_handle.emit("reminder-triggered", serde_json::json!({
                    "task_id": task_id,
                    "title": title,
                }));
            }
        }
    });
}
