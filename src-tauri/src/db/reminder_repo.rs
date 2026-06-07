use rusqlite::Connection;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::task_reminder::{CreateReminderRequest, TaskReminder};

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
        ("0m", 0), ("-5m", -5), ("-30m", -30), ("-1h", -60), ("-1d", -1440), ("-1w", -10080),
    ];
    let (&_, minutes) = presets.iter().find(|(k, _)| *k == offset)?;

    let date_str = if due_date.len() > 10 { &due_date[..10] } else { due_date };
    let date = NaiveDate::parse_from_str(date_str, "%Y-%m-%d").ok()?;

    let hour: u32 = if due_date.len() > 10 { due_date[11..13].parse().unwrap_or(9) } else { 9 };
    let min: u32 = if due_date.len() > 10 { due_date[14..16].parse().unwrap_or(0) } else { 0 };

    let dt = date.and_hms_opt(hour, min, 0)?;
    let rem = dt - chrono::Duration::minutes(minutes.abs());
    Some(rem.format("%Y-%m-%d %H:%M").to_string())
}

pub fn get_reminders_for_task(conn: &Connection, task_id: &str) -> Result<Vec<TaskReminder>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, offset, reminder_time, reminded, created_at
         FROM task_reminders WHERE task_id = ?1 ORDER BY reminder_time ASC",
    )?;
    let rows = stmt.query_map(rusqlite::params![task_id], row_to_reminder)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn create_reminder(conn: &Connection, req: CreateReminderRequest) -> Result<TaskReminder, AppError> {
    let id = Uuid::new_v4().to_string();
    let reminder_time = compute_reminder_time(
        req.due_date.as_deref().unwrap_or(""),
        &req.offset,
    ).unwrap_or_default();

    conn.execute(
        "INSERT INTO task_reminders (id, task_id, offset, reminder_time) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, req.task_id, req.offset, reminder_time],
    )?;

    let mut stmt = conn.prepare(
        "SELECT id, task_id, offset, reminder_time, reminded, created_at
         FROM task_reminders WHERE id = ?1",
    )?;
    Ok(stmt.query_row(rusqlite::params![id], row_to_reminder)?)
}

pub fn delete_reminder(conn: &Connection, reminder_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM task_reminders WHERE id = ?1",
        rusqlite::params![reminder_id],
    )?;
    Ok(())
}

pub fn clear_reminders_for_task(conn: &Connection, task_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM task_reminders WHERE task_id = ?1",
        rusqlite::params![task_id],
    )?;
    Ok(())
}

pub fn copy_reminders(conn: &Connection, source_task_id: &str, dest_task_id: &str) -> Result<(), AppError> {
    let mut stmt = conn.prepare(
        "SELECT offset, reminder_time FROM task_reminders WHERE task_id = ?1",
    )?;
    let rows: Vec<(String, String)> = stmt.query_map(
        rusqlite::params![source_task_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?.filter_map(|r| r.ok()).collect();

    for (offset, reminder_time) in rows {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO task_reminders (id, task_id, offset, reminder_time) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, dest_task_id, offset, reminder_time],
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

pub fn get_due_reminders(conn: &Connection, now: &str) -> Result<Vec<(String, String)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT r.id, t.title
         FROM task_reminders r
         JOIN tasks t ON t.id = r.task_id
         WHERE t.is_completed = 0
           AND t.is_archived = 0
           AND t.is_suspended = 0
           AND t.is_abandoned = 0
           AND r.reminded = 0
           AND r.reminder_time <= ?1",
    )?;
    let rows = stmt.query_map(rusqlite::params![now], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn mark_reminded(conn: &Connection, reminder_id: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE task_reminders SET reminded = 1 WHERE id = ?1",
        rusqlite::params![reminder_id],
    )?;
    Ok(())
}
