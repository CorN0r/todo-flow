use crate::db::sync_repo;
use crate::error::AppError;
use crate::models::habit::*;
use chrono::Local;
use rusqlite::{params, Connection};
use serde_json::json;

fn now_local() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn row_to_habit(row: &rusqlite::Row) -> rusqlite::Result<Habit> {
    Ok(Habit {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        icon: row.get(3)?,
        frequency: row.get(4)?,
        target_count: row.get(5)?,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub fn create(conn: &Connection, req: CreateHabitRequest) -> Result<Habit, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let name = req.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation(
            "Habit name cannot be empty".to_string(),
        ));
    }
    let max_order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM habits",
        [],
        |row| row.get(0),
    )?;

    let now = now_local();
    conn.execute(
        "INSERT INTO habits (id, name, color, icon, frequency, target_count, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, name, req.color.unwrap_or("#7C72F6".into()), req.icon.unwrap_or("check-circle".into()), req.frequency.unwrap_or("daily".into()), req.target_count.unwrap_or(1), max_order + 1, now, now],
    )?;
    let habit =
        get_by_id(conn, &id)?.ok_or_else(|| AppError::Generic("Failed to create habit".into()))?;
    let _ = sync_repo::record_local_operation(
        conn,
        "habit",
        &habit.id,
        "create",
        json!({ "habit": habit }),
    )?;
    get_by_id(conn, &id)?.ok_or_else(|| AppError::Generic("Failed to create habit".into()))
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Habit>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, icon, frequency, target_count, sort_order, created_at, updated_at
         FROM habits WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], row_to_habit)?;
    Ok(rows.next().transpose()?)
}

pub fn get_all_with_stats(conn: &Connection, today: &str) -> Result<Vec<HabitWithStats>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT h.id, h.name, h.color, h.icon, h.frequency, h.target_count, h.sort_order,
                h.created_at, h.updated_at
         FROM habits h WHERE h.deleted_at IS NULL ORDER BY h.sort_order ASC",
    )?;
    let habits: Vec<Habit> = stmt
        .query_map([], row_to_habit)?
        .collect::<Result<Vec<_>, _>>()?;

    if habits.is_empty() {
        return Ok(Vec::new());
    }

    // 一次性读取所有习惯的有效日志，按 habit_id, log_date 升序。
    // habit_id 是本地生成的 UUID，使用占位符拼接是安全的。
    let habit_ids: Vec<String> = habits.iter().map(|h| h.id.clone()).collect();
    let placeholders = (0..habit_ids.len())
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT habit_id, log_date FROM habit_logs
         WHERE habit_id IN ({}) AND deleted_at IS NULL
         ORDER BY habit_id, log_date ASC",
        placeholders
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(rusqlite::params_from_iter(habit_ids.iter()))?;
    let mut logs_by_habit: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    while let Some(row) = rows.next()? {
        let habit_id: String = row.get(0)?;
        let log_date: String = row.get(1)?;
        logs_by_habit.entry(habit_id).or_default().push(log_date);
    }

    let mut results = Vec::new();
    for h in habits {
        let dates = logs_by_habit
            .get(&h.id)
            .map(|v| v.as_slice())
            .unwrap_or(&[]);
        let current_streak = compute_streak_from_dates(dates, today);
        let best_streak = compute_best_streak_from_dates(dates);
        let completion_rate = compute_completion_rate_from_dates(dates, today);
        let is_done_today = dates.binary_search_by(|d| d.as_str().cmp(today)).is_ok();

        results.push(HabitWithStats {
            id: h.id,
            name: h.name,
            color: h.color,
            icon: h.icon,
            frequency: h.frequency,
            target_count: h.target_count,
            sort_order: h.sort_order,
            created_at: h.created_at,
            updated_at: h.updated_at,
            current_streak,
            best_streak,
            completion_rate,
            is_done_today,
        });
    }
    Ok(results)
}

pub fn update(conn: &Connection, id: &str, req: UpdateHabitRequest) -> Result<Habit, AppError> {
    let existing = get_by_id(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Habit {} not found", id)))?;

    let name = req.name.unwrap_or(existing.name);
    if name.trim().is_empty() {
        return Err(AppError::Validation(
            "Habit name cannot be empty".to_string(),
        ));
    }

    conn.execute(
        "UPDATE habits SET name=?1, color=?2, icon=?3, frequency=?4, target_count=?5, updated_at=?6 WHERE id=?7",
        params![
            name,
            req.color.unwrap_or(existing.color),
            req.icon.unwrap_or(existing.icon),
            req.frequency.unwrap_or(existing.frequency),
            req.target_count.unwrap_or(existing.target_count),
            now_local(),
            id,
        ],
    )?;
    let habit =
        get_by_id(conn, id)?.ok_or_else(|| AppError::Generic("Failed to update habit".into()))?;
    let _ =
        sync_repo::record_local_operation(conn, "habit", id, "update", json!({ "habit": habit }))?;
    get_by_id(conn, id)?.ok_or_else(|| AppError::Generic("Failed to update habit".into()))
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    if sync_repo::is_sync_enabled(conn)? {
        let _existing = get_by_id(conn, id)?
            .ok_or_else(|| AppError::NotFound(format!("Habit {} not found", id)))?;
        let _ =
            sync_repo::record_local_operation(conn, "habit", id, "delete", json!({ "id": id }))?;
        conn.execute(
            "UPDATE habit_logs
             SET deleted_at = COALESCE(deleted_at, ?1),
                 sync_status = 'deleted'
             WHERE habit_id = ?2",
            params![now_local(), id],
        )?;
        return Ok(());
    }

    let affected = conn.execute("DELETE FROM habits WHERE id = ?1", params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Habit {} not found", id)));
    }
    Ok(())
}

pub fn reorder(conn: &Connection, items: Vec<ReorderHabitsItem>) -> Result<(), AppError> {
    let now = now_local();
    let tx = conn.unchecked_transaction()?;
    for item in &items {
        tx.execute(
            "UPDATE habits SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![item.sort_order, now, item.id],
        )?;
    }
    tx.commit()?;
    if sync_repo::is_sync_enabled(conn)? {
        for item in &items {
            let _ = sync_repo::record_local_operation(
                conn,
                "habit",
                &item.id,
                "reorder",
                json!({
                    "id": item.id,
                    "sort_order": item.sort_order,
                }),
            )?;
        }
    }
    Ok(())
}

pub fn toggle_log(conn: &Connection, habit_id: &str, date: &str) -> Result<HabitLog, AppError> {
    let existing = conn.query_row(
        "SELECT id, deleted_at FROM habit_logs WHERE habit_id = ?1 AND log_date = ?2",
        params![habit_id, date],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
    );

    if let Ok((log_id, deleted_at)) = existing {
        if deleted_at.is_some() {
            conn.execute(
                "UPDATE habit_logs
                 SET deleted_at = NULL,
                     count = 1,
                     sync_status = CASE WHEN sync_status = 'deleted' THEN 'pending' ELSE sync_status END
                 WHERE id = ?1",
                params![log_id],
            )?;
            let log = HabitLog {
                id: log_id.clone(),
                habit_id: habit_id.to_string(),
                log_date: date.to_string(),
                count: 1,
                note: String::new(),
                created_at: String::new(),
            };
            let _ = sync_repo::record_local_operation(
                conn,
                "habit_log",
                &log_id,
                "update",
                json!({ "habit_log": log.clone() }),
            )?;
            return Ok(log);
        }

        if sync_repo::is_sync_enabled(conn)? {
            conn.execute(
                "UPDATE habit_logs
                 SET deleted_at = COALESCE(deleted_at, ?1),
                     sync_status = 'deleted'
                 WHERE id = ?2",
                params![now_local(), log_id],
            )?;
            let _ = sync_repo::record_local_operation(
                conn,
                "habit_log",
                &log_id,
                "delete",
                json!({ "id": log_id.clone() }),
            )?;
        } else {
            conn.execute("DELETE FROM habit_logs WHERE id = ?1", params![log_id])?;
        }
        Ok(HabitLog {
            id: log_id,
            habit_id: habit_id.to_string(),
            log_date: date.to_string(),
            count: 0,
            note: String::new(),
            created_at: String::new(),
        })
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO habit_logs (id, habit_id, log_date, count) VALUES (?1, ?2, ?3, 1)",
            params![id, habit_id, date],
        )?;
        let log = HabitLog {
            id,
            habit_id: habit_id.to_string(),
            log_date: date.to_string(),
            count: 1,
            note: String::new(),
            created_at: String::new(),
        };
        let _ = sync_repo::record_local_operation(
            conn,
            "habit_log",
            &log.id,
            "create",
            json!({ "habit_log": log.clone() }),
        )?;
        Ok(log)
    }
}

fn compute_streak_from_dates(dates: &[String], today: &str) -> i32 {
    if dates.is_empty() {
        return 0;
    }
    let latest = &dates[dates.len() - 1];
    if latest.as_str() < today && latest != today {
        return 0;
    }

    let mut streak = 0i32;
    let mut expected = latest.clone();
    for d in dates.iter().rev() {
        if d == &expected {
            streak += 1;
            expected = prev_date(&expected);
        } else {
            break;
        }
    }
    streak
}

fn compute_best_streak_from_dates(dates: &[String]) -> i32 {
    if dates.is_empty() {
        return 0;
    }

    let mut best = 1i32;
    let mut current = 1i32;
    for i in 1..dates.len() {
        if next_date(&dates[i - 1]) == dates[i] {
            current += 1;
            best = best.max(current);
        } else if dates[i - 1] != dates[i] {
            current = 1;
        }
    }
    best
}

fn compute_completion_rate_from_dates(dates: &[String], today: &str) -> f64 {
    let total = dates.len() as i32;
    if total == 0 {
        return 0.0;
    }

    let first_date = &dates[0];
    let days = days_between(first_date, today);
    if days == 0 {
        return 100.0;
    }
    (total as f64 / days as f64 * 100.0).min(100.0)
}

fn days_between(from: &str, to: &str) -> i32 {
    let from_date = chrono::NaiveDate::parse_from_str(from, "%Y-%m-%d");
    let to_date = chrono::NaiveDate::parse_from_str(to, "%Y-%m-%d");
    match (from_date, to_date) {
        (Ok(f), Ok(t)) => {
            let duration = t.signed_duration_since(f);
            (duration.num_days() as i32).max(1)
        }
        _ => 1,
    }
}

fn prev_date(date: &str) -> String {
    if let Ok(d) = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d") {
        (d - chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string()
    } else {
        date.to_string()
    }
}

fn next_date(date: &str) -> String {
    if let Ok(d) = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d") {
        (d + chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string()
    } else {
        date.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn test_create_and_retrieve() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Exercise".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        assert_eq!(h.name, "Exercise");
        assert_eq!(h.frequency, "daily");
        assert_eq!(h.target_count, 1);
    }

    #[test]
    fn test_empty_name_rejected() {
        let conn = setup();
        let r = create(
            &conn,
            CreateHabitRequest {
                name: "  ".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        );
        assert!(r.is_err());
    }

    #[test]
    fn test_update_habit() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Read".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        let updated = update(
            &conn,
            &h.id,
            UpdateHabitRequest {
                name: Some("Read books".into()),
                color: None,
                icon: None,
                frequency: Some("weekly".into()),
                target_count: Some(3),
            },
        )
        .unwrap();
        assert_eq!(updated.name, "Read books");
        assert_eq!(updated.frequency, "weekly");
        assert_eq!(updated.target_count, 3);
    }

    #[test]
    fn test_delete_habit() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Test".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        delete(&conn, &h.id).unwrap();
        assert!(get_by_id(&conn, &h.id).unwrap().is_none());
    }

    #[test]
    fn test_delete_not_found() {
        let conn = setup();
        let r = delete(&conn, "nonexistent");
        assert!(r.is_err());
    }

    #[test]
    fn test_toggle_log() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Water".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        // Toggle on
        toggle_log(&conn, &h.id, &today).unwrap();
        let stats = get_all_with_stats(&conn, &today).unwrap();
        let habit = stats.iter().find(|s| s.id == h.id).unwrap();
        assert!(habit.is_done_today);

        // Toggle off
        toggle_log(&conn, &h.id, &today).unwrap();
        let stats = get_all_with_stats(&conn, &today).unwrap();
        let habit = stats.iter().find(|s| s.id == h.id).unwrap();
        assert!(!habit.is_done_today);
    }

    #[test]
    fn test_streak_and_completion_rate() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Meditate".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();

        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let yesterday = prev_date(&today);
        let day_before = prev_date(&yesterday);

        toggle_log(&conn, &h.id, &today).unwrap();
        toggle_log(&conn, &h.id, &yesterday).unwrap();
        toggle_log(&conn, &h.id, &day_before).unwrap();

        let stats = get_all_with_stats(&conn, &today).unwrap();
        let habit = stats.iter().find(|s| s.id == h.id).unwrap();
        assert!(habit.current_streak >= 3);
        assert!(habit.completion_rate > 0.0);
    }

    #[test]
    fn test_reorder_habits() {
        let conn = setup();
        let h1 = create(
            &conn,
            CreateHabitRequest {
                name: "A".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        let h2 = create(
            &conn,
            CreateHabitRequest {
                name: "B".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();

        reorder(
            &conn,
            vec![
                ReorderHabitsItem {
                    id: h1.id.clone(),
                    sort_order: 10,
                },
                ReorderHabitsItem {
                    id: h2.id.clone(),
                    sort_order: 20,
                },
            ],
        )
        .unwrap();

        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let stats = get_all_with_stats(&conn, &today).unwrap();
        let a = stats.iter().find(|s| s.id == h1.id).unwrap();
        let b = stats.iter().find(|s| s.id == h2.id).unwrap();
        assert!(a.sort_order < b.sort_order);
    }

    #[test]
    fn test_stats_with_empty_logs() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Empty".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let stats = get_all_with_stats(&conn, &today).unwrap();
        let habit = stats.iter().find(|s| s.id == h.id).unwrap();
        assert_eq!(habit.current_streak, 0);
        assert_eq!(habit.best_streak, 0);
        assert_eq!(habit.completion_rate, 0.0);
        assert!(!habit.is_done_today);
    }

    #[test]
    fn test_stats_ignores_deleted_logs() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Deleted".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        toggle_log(&conn, &h.id, &today).unwrap();
        conn.execute(
            "UPDATE habit_logs SET deleted_at = ?1 WHERE habit_id = ?2",
            params![now_local(), h.id],
        )
        .unwrap();
        let stats = get_all_with_stats(&conn, &today).unwrap();
        let habit = stats.iter().find(|s| s.id == h.id).unwrap();
        assert!(!habit.is_done_today);
        assert_eq!(habit.current_streak, 0);
        assert_eq!(habit.completion_rate, 0.0);
    }

    #[test]
    fn test_stats_dedupes_duplicate_log_dates() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Dup".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        // toggle_log 同一天只维护一条记录
        toggle_log(&conn, &h.id, &today).unwrap();
        let stats = get_all_with_stats(&conn, &today).unwrap();
        let habit = stats.iter().find(|s| s.id == h.id).unwrap();
        assert!(habit.is_done_today);
        assert_eq!(habit.current_streak, 1);

        // 数据库层的 UNIQUE 约束阻止重复日期插入
        let id = uuid::Uuid::new_v4().to_string();
        let result = conn.execute(
            "INSERT INTO habit_logs (id, habit_id, log_date, count) VALUES (?1, ?2, ?3, 1)",
            params![id, h.id, today],
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_stats_with_streak_gap() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Gap".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let yesterday = prev_date(&today);
        let two_days_ago = prev_date(&yesterday);
        let three_days_ago = prev_date(&two_days_ago);

        // 今天 + 前天 + 大前天，昨天断档
        toggle_log(&conn, &h.id, &today).unwrap();
        toggle_log(&conn, &h.id, &two_days_ago).unwrap();
        toggle_log(&conn, &h.id, &three_days_ago).unwrap();

        let stats = get_all_with_stats(&conn, &today).unwrap();
        let habit = stats.iter().find(|s| s.id == h.id).unwrap();
        assert_eq!(habit.current_streak, 1);
        assert_eq!(habit.best_streak, 2);
    }

    #[test]
    fn test_stats_all_logs_before_today() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Before".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let yesterday = prev_date(&today);
        let two_days_ago = prev_date(&yesterday);

        toggle_log(&conn, &h.id, &two_days_ago).unwrap();
        toggle_log(&conn, &h.id, &yesterday).unwrap();

        let stats = get_all_with_stats(&conn, &today).unwrap();
        let habit = stats.iter().find(|s| s.id == h.id).unwrap();
        assert!(!habit.is_done_today);
        assert_eq!(habit.current_streak, 0);
        assert_eq!(habit.best_streak, 2);
    }

    #[test]
    fn test_completion_rate_capped_at_100() {
        let conn = setup();
        let h = create(
            &conn,
            CreateHabitRequest {
                name: "Over".into(),
                color: None,
                icon: None,
                frequency: None,
                target_count: None,
            },
        )
        .unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        // 连续 5 天打卡，但 first_date 到 today 最多 4 天间隔
        let mut d = today.clone();
        for _ in 0..5 {
            toggle_log(&conn, &h.id, &d).unwrap();
            d = prev_date(&d);
        }

        let stats = get_all_with_stats(&conn, &today).unwrap();
        let habit = stats.iter().find(|s| s.id == h.id).unwrap();
        assert_eq!(habit.completion_rate, 100.0);
    }
}
