use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use chrono::Local;
use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager};

use crate::alerts::AlertState;
use crate::db::reminder_repo;

pub const ALERT_WINDOW_LABEL: &str = "reminder-alert";

pub fn start_polling(app_handle: AppHandle, db: Arc<Mutex<Connection>>) {
    thread::spawn(move || loop {
        // 先检查后 sleep:应用启动即查一次,关闭期间漏掉的提醒马上弹出
        check_due_reminders(&app_handle, &db);
        thread::sleep(Duration::from_secs(60));
    });
}

fn check_due_reminders(app_handle: &AppHandle, db: &Arc<Mutex<Connection>>) {
    let now = Local::now().format("%Y-%m-%d %H:%M").to_string();

    let reminders = {
        let conn = match db.lock() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[reminder] Failed to acquire db lock: {}", e);
                return;
            }
        };
        match reminder_repo::get_due_reminders(&conn, &now) {
            Ok(r) => {
                let notify = system_notify_enabled(&conn);
                r.into_iter().map(move |a| (a, notify)).collect::<Vec<_>>()
            }
            Err(e) => {
                eprintln!("[reminder] Query failed: {}", e);
                return;
            }
        }
    };

    if reminders.is_empty() {
        // 无到期提醒但队列有残留(任务已被删除/完成/归档)时,
        // 仍通知弹窗页面刷新:其 get_pending_alerts 会清理失效条目,
        // 队列清空后窗口自动隐藏,避免显示僵尸提醒
        if !app_handle.state::<AlertState>().snapshot().is_empty() {
            let _ = app_handle.emit_to(ALERT_WINDOW_LABEL, "alerts-updated", ());
        }
        return;
    }

    // 入队去重即视为"已送达":不立即 mark_reminded,用户在面板上
    // 关闭/推迟时才落库;进程重启后未处理的提醒会在这里重新弹出。
    let alerts = app_handle.state::<AlertState>();
    let mut pushed_new = false;
    for (alert, notify) in reminders {
        if !alerts.push_if_absent(alert.clone()) {
            continue;
        }
        pushed_new = true;
        if notify {
            use tauri_plugin_notification::NotificationExt;
            let _ = app_handle
                .notification()
                .builder()
                .title("TodoFlow Reminder")
                .body(&alert.title)
                .show();
        }
    }

    // 队列非空就确保弹窗可见:既覆盖新提醒,也覆盖被 Alt+F4 隐藏后
    // 仍未处理的场景(每轮最多重新抢一次焦点,落实"本人不处理就不消失")
    show_alert_window(app_handle, pushed_new);
}

fn system_notify_enabled(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'reminder_system_notify'",
        rusqlite::params![],
        |row| row.get::<_, String>(0),
    )
    .map(|v| v != "0")
    .unwrap_or(true)
}

fn show_alert_window(app_handle: &AppHandle, focus: bool) {
    let has_pending = !app_handle.state::<AlertState>().snapshot().is_empty();
    if !has_pending {
        return;
    }
    match app_handle.get_webview_window(ALERT_WINDOW_LABEL) {
        Some(win) => {
            let was_hidden = !win.is_visible().unwrap_or(true);
            let _ = win.show();
            if focus || was_hidden {
                let _ = win.set_focus();
            }
            let _ = app_handle.emit_to(ALERT_WINDOW_LABEL, "alerts-updated", ());
        }
        None => {
            eprintln!("[reminder] alert window not found by label");
        }
    }
}
