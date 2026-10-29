use chrono::Local;
use rusqlite::Connection;
use serde_json::json;
use uuid::Uuid;

use crate::db::sync_repo;
use crate::error::AppError;
use crate::models::task_reminder::{CreateReminderRequest, TaskReminder};

fn now_local() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn row_to_reminder(row: &rusqlite::Row) -> rusqlite::Result<TaskReminder> {
    Ok(TaskReminder {
        id: row.get("id")?,
        task_id: row.get("task_id")?,
        offset: row.get("offset")?,
        reminder_time: row.get("reminder_time")?,
        reminded: row.get::<_, i32>("reminded")? != 0,
        created_at: row.get("created_at")?,
    })
}

fn compute_reminder_time(due_date: &str, offset: &str) -> Option<String> {
    use chrono::NaiveDate;

    if offset.starts_with("custom:") {
        let raw = offset.strip_prefix("custom:")?;
        return Some(raw.to_string());
    }

    let presets: &[(&str, i64)] = &[
        ("0m", 0),
        ("-5m", -5),
        ("-30m", -30),
        ("-1h", -60),
        ("-1d", -1440),
        ("-1w", -10080),
    ];
    let (&_, minutes) = presets.iter().find(|(k, _)| *k == offset)?;

    let date_str = if due_date.len() > 10 {
        &due_date[..10]
    } else {
        due_date
    };
    let date = NaiveDate::parse_from_str(date_str, "%Y-%m-%d").ok()?;

    let hour: u32 = if due_date.len() > 10 {
        due_date[11..13].parse().unwrap_or(9)
    } else {
        9
    };
    let min: u32 = if due_date.len() > 10 {
        due_date[14..16].parse().unwrap_or(0)
    } else {
        0
    };

    let dt = date.and_hms_opt(hour, min, 0)?;
    let rem = dt - chrono::Duration::minutes(minutes.abs());
    Some(rem.format("%Y-%m-%d %H:%M").to_string())
}

pub fn get_reminders_for_task(
    conn: &Connection,
    task_id: &str,
) -> Result<Vec<TaskReminder>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, offset, reminder_time, reminded, created_at
         FROM task_reminders WHERE task_id = ?1 AND deleted_at IS NULL ORDER BY reminder_time ASC",
    )?;
    let rows = stmt.query_map(rusqlite::params![task_id], row_to_reminder)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn create_reminder(
    conn: &Connection,
    req: CreateReminderRequest,
) -> Result<TaskReminder, AppError> {
    let id = Uuid::new_v4().to_string();
    let reminder_time = compute_reminder_time(req.due_date.as_deref().unwrap_or(""), &req.offset)
        .unwrap_or_default();

    conn.execute(
        "INSERT INTO task_reminders (id, task_id, offset, reminder_time, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, req.task_id, req.offset, reminder_time, now_local()],
    )?;

    let mut stmt = conn.prepare(
        "SELECT id, task_id, offset, reminder_time, reminded, created_at
         FROM task_reminders WHERE id = ?1",
    )?;
    let reminder = stmt.query_row(rusqlite::params![id], row_to_reminder)?;
    let _ = sync_repo::record_local_operation(
        conn,
        "task_reminder",
        &reminder.id,
        "create",
        json!({ "reminder": reminder.clone() }),
    )?;
    get_reminders_for_task(conn, &reminder.task_id)?
        .into_iter()
        .find(|item| item.id == reminder.id)
        .ok_or_else(|| AppError::Generic("Failed to create reminder".to_string()))
}

pub fn delete_reminder(conn: &Connection, reminder_id: &str) -> Result<(), AppError> {
    if sync_repo::is_sync_enabled(conn)? {
        let affected = conn.execute(
            "UPDATE task_reminders
             SET deleted_at = COALESCE(deleted_at, ?1),
                 sync_status = 'deleted'
             WHERE id = ?2",
            rusqlite::params![now_local(), reminder_id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Reminder {} not found",
                reminder_id
            )));
        }
        let _ = sync_repo::record_local_operation(
            conn,
            "task_reminder",
            reminder_id,
            "delete",
            json!({ "id": reminder_id }),
        )?;
        return Ok(());
    }

    conn.execute(
        "DELETE FROM task_reminders WHERE id = ?1",
        rusqlite::params![reminder_id],
    )?;
    Ok(())
}

pub fn clear_reminders_for_task(conn: &Connection, task_id: &str) -> Result<(), AppError> {
    if sync_repo::is_sync_enabled(conn)? {
        let reminders = get_reminders_for_task(conn, task_id)?;
        for reminder in reminders {
            delete_reminder(conn, &reminder.id)?;
        }
        return Ok(());
    }

    conn.execute(
        "DELETE FROM task_reminders WHERE task_id = ?1",
        rusqlite::params![task_id],
    )?;
    Ok(())
}

pub fn copy_reminders(
    conn: &Connection,
    source_task_id: &str,
    dest_task_id: &str,
) -> Result<(), AppError> {
    let mut stmt =
        conn.prepare("SELECT offset, reminder_time FROM task_reminders WHERE task_id = ?1")?;
    let rows: Vec<(String, String)> = stmt
        .query_map(rusqlite::params![source_task_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let now = now_local();
    for (offset, reminder_time) in rows {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO task_reminders (id, task_id, offset, reminder_time, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, dest_task_id, offset, reminder_time, now],
        )?;
    }
    Ok(())
}

pub fn reset_reminded_for_task(conn: &Connection, task_id: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE task_reminders SET reminded = 0 WHERE task_id = ?1",
        rusqlite::params![task_id],
    )?;
    Ok(())
}

pub fn get_due_reminders(
    conn: &Connection,
    now: &str,
) -> Result<Vec<crate::alerts::PendingAlert>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT r.id, r.task_id, t.title, r.reminder_time
         FROM task_reminders r
         JOIN tasks t ON t.id = r.task_id
         WHERE t.is_completed = 0
           AND t.is_archived = 0
           AND t.deleted_at IS NULL
           AND t.is_suspended = 0
           AND t.is_abandoned = 0
           AND r.reminded = 0
           AND r.deleted_at IS NULL
           AND r.reminder_time <= ?1
         ORDER BY r.reminder_time ASC",
    )?;
    let rows = stmt.query_map(rusqlite::params![now], |row| {
        Ok(crate::alerts::PendingAlert {
            reminder_id: row.get(0)?,
            task_id: row.get(1)?,
            title: row.get(2)?,
            reminder_time: row.get(3)?,
        })
    })?;
    let collected: Vec<_> = rows.collect();
    // 坏数据(如外部程序以非 UTF-8 写入的标题)不应让提醒静默失效,记日志后跳过该行
    for r in collected.iter().filter(|r| r.is_err()) {
        eprintln!("[reminder] skip corrupt reminder row: {:?}", r);
    }
    Ok(collected.into_iter().filter_map(|r| r.ok()).collect())
}

/// 弹窗待处理条目是否仍然有效(提醒未删未触达、任务未完成/归档/挂起/放弃)。
/// 用于弹窗拉取队列时剔除已在主界面被处理掉的过期条目。
pub fn is_alert_alive(conn: &Connection, reminder_id: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*)
         FROM task_reminders r
         JOIN tasks t ON t.id = r.task_id
         WHERE r.id = ?1
           AND r.deleted_at IS NULL
           AND r.reminded = 0
           AND t.is_completed = 0
           AND t.is_archived = 0
           AND t.deleted_at IS NULL
           AND t.is_suspended = 0
           AND t.is_abandoned = 0",
        rusqlite::params![reminder_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|c| c > 0)
    .unwrap_or(false)
}

/// 推迟提醒:reminder_time 顺延 minutes 分钟并复位 reminded,
/// offset 同步改写为 custom 时间,保持 ReminderList UI 展示一致。
pub fn snooze_reminder(
    conn: &Connection,
    reminder_id: &str,
    minutes: i64,
) -> Result<(), AppError> {
    let new_time = (Local::now() + chrono::Duration::minutes(minutes))
        .format("%Y-%m-%d %H:%M")
        .to_string();
    let affected = conn.execute(
        "UPDATE task_reminders
         SET reminder_time = ?1, offset = ?2, reminded = 0
         WHERE id = ?3 AND deleted_at IS NULL",
        rusqlite::params![new_time, format!("custom:{}", new_time), reminder_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!(
            "Reminder {} not found",
            reminder_id
        )));
    }
    Ok(())
}

pub fn mark_reminded(conn: &Connection, reminder_id: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE task_reminders SET reminded = 1 WHERE id = ?1",
        rusqlite::params![reminder_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use crate::db::task_repo;
    use crate::models::task::CreateTaskRequest;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    fn create_task(conn: &Connection, title: &str) -> String {
        task_repo::create(
            conn,
            CreateTaskRequest {
                title: title.to_string(),
                description: None,
                tag_ids: None,
                parent_task_id: None,
                due_date: None,
                priority: None,
                reminder: None,
                recurrence: None,
                my_day_date: None,
                source: None,
            },
        )
        .unwrap()
        .id
    }

    fn create_custom_reminder(conn: &Connection, task_id: &str, time: &str) -> String {
        create_reminder(
            conn,
            CreateReminderRequest {
                task_id: task_id.to_string(),
                offset: format!("custom:{}", time),
                due_date: None,
            },
        )
        .unwrap()
        .id
    }

    #[test]
    fn test_snooze_reschedules_and_resets() {
        let conn = setup();
        let task_id = create_task(&conn, "测试任务");
        let reminder_id = create_custom_reminder(&conn, &task_id, "2000-01-01 08:00");

        mark_reminded(&conn, &reminder_id).unwrap();

        snooze_reminder(&conn, &reminder_id, 10).unwrap();

        let reminders = get_reminders_for_task(&conn, &task_id).unwrap();
        let r = reminders.iter().find(|r| r.id == reminder_id).unwrap();
        assert!(!r.reminded, "snooze 后应复位 reminded");
        assert!(r.offset.starts_with("custom:"), "offset 应改为 custom 时间");
        // 新时间 = now + 10min,必然晚于 2000 年的旧时间
        assert!(r.reminder_time.as_str() > "2000-01-01 08:00");
    }

    #[test]
    fn test_snooze_missing_reminder_errors() {
        let conn = setup();
        assert!(snooze_reminder(&conn, "not-exist", 5).is_err());
    }

    #[test]
    fn test_get_due_and_alert_alive() {
        let conn = setup();
        let task_id = create_task(&conn, "到期任务");
        let past_id = create_custom_reminder(&conn, &task_id, "2000-01-01 08:00");
        create_custom_reminder(&conn, &task_id, "2999-01-01 08:00");

        let due = get_due_reminders(&conn, "2026-10-25 10:00").unwrap();
        assert_eq!(due.len(), 1, "只有过去时间的提醒到期");
        assert_eq!(due[0].reminder_id, past_id);
        assert_eq!(due[0].task_id, task_id);
        assert_eq!(due[0].title, "到期任务");
        assert_eq!(due[0].reminder_time, "2000-01-01 08:00");

        assert!(is_alert_alive(&conn, &past_id));

        // 任务完成后弹窗条目应视为失效
        conn.execute(
            "UPDATE tasks SET is_completed = 1 WHERE id = ?1",
            rusqlite::params![task_id],
        )
        .unwrap();
        assert!(!is_alert_alive(&conn, &past_id));
    }
}

