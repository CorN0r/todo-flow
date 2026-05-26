use rusqlite::Connection;
use serde::Serialize;

use crate::AppState;

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_tasks: i64,
    pub completed_tasks: i64,
    pub incomplete_tasks: i64,
    pub overdue_tasks: i64,
    pub today_completed: i64,
    pub today_total: i64,
    pub streak_days: i64,
    pub completion_by_date: Vec<DayCount>,
    pub tasks_by_list: Vec<ListCount>,
}

#[derive(Debug, Serialize)]
pub struct DayCount {
    pub date: String,
    pub completed: i64,
}

#[derive(Debug, Serialize)]
pub struct ListCount {
    pub list_id: String,
    pub list_name: String,
    pub list_color: String,
    pub count: i64,
}

#[tauri::command]
pub fn get_dashboard_stats(state: tauri::State<'_, AppState>) -> Result<DashboardStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    get_dashboard_stats_impl(&conn)
}

fn get_dashboard_stats_impl(conn: &Connection) -> Result<DashboardStats, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let total_tasks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND parent_task_id IS NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let completed_tasks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_completed = 1 AND parent_task_id IS NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let incomplete_tasks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_completed = 0 AND parent_task_id IS NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let overdue_tasks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_completed = 0 AND due_date IS NOT NULL AND due_date < ?1 AND parent_task_id IS NULL",
            [&today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let today_completed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_completed = 1 AND date(updated_at) = ?1 AND parent_task_id IS NULL",
            [&today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let today_total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND parent_task_id IS NULL AND (due_date = ?1 OR date(updated_at) = ?1)",
            [&today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Completion by date (last 7 days)
    let mut completion_by_date: Vec<DayCount> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT date(updated_at) as d, COUNT(*) as c
         FROM tasks
         WHERE is_archived = 0 AND is_completed = 1 AND parent_task_id IS NULL
           AND date(updated_at) >= date(?1, '-6 days')
         GROUP BY d
         ORDER BY d",
    ) {
        if let Ok(rows) = stmt.query_map([&today], |row| {
            Ok(DayCount {
                date: row.get(0)?,
                completed: row.get(1)?,
            })
        }) {
            for row in rows.flatten() {
                completion_by_date.push(row);
            }
        }
    }

    // Streak (consecutive days completing at least 1 task)
    let streak_days = compute_streak(conn, &today);

    // Tasks by list
    let mut tasks_by_list: Vec<ListCount> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT l.id, l.name, l.color, COUNT(t.id)
         FROM lists l
         LEFT JOIN tasks t ON t.list_id = l.id AND t.is_archived = 0 AND t.parent_task_id IS NULL
         GROUP BY l.id
         ORDER BY COUNT(t.id) DESC",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok(ListCount {
                list_id: row.get(0)?,
                list_name: row.get(1)?,
                list_color: row.get(2)?,
                count: row.get(3)?,
            })
        }) {
            for row in rows.flatten() {
                tasks_by_list.push(row);
            }
        }
    }

    Ok(DashboardStats {
        total_tasks,
        completed_tasks,
        incomplete_tasks,
        overdue_tasks,
        today_completed,
        today_total,
        streak_days,
        completion_by_date,
        tasks_by_list,
    })
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
    fn test_empty_stats() {
        let conn = setup();
        let stats = get_dashboard_stats_impl(&conn).unwrap();
        assert_eq!(stats.total_tasks, 0);
        assert_eq!(stats.completed_tasks, 0);
        assert_eq!(stats.incomplete_tasks, 0);
        assert_eq!(stats.overdue_tasks, 0);
        assert_eq!(stats.streak_days, 0);
        assert!(stats.tasks_by_list.is_empty());
    }

    #[test]
    fn test_task_counts() {
        let conn = setup();
        conn.execute(
            "INSERT INTO tasks (id, title, is_completed) VALUES ('t1', 'Task 1', 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, is_completed) VALUES ('t2', 'Task 2', 1)",
            [],
        ).unwrap();

        let stats = get_dashboard_stats_impl(&conn).unwrap();
        assert_eq!(stats.total_tasks, 2);
        assert_eq!(stats.completed_tasks, 1);
        assert_eq!(stats.incomplete_tasks, 1);
    }

    #[test]
    fn test_overdue_tasks() {
        let conn = setup();
        conn.execute(
            "INSERT INTO tasks (id, title, is_completed, due_date) VALUES ('t1', 'Old', 0, '2020-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, is_completed, due_date) VALUES ('t2', 'Future', 0, '2030-01-01')",
            [],
        ).unwrap();

        let stats = get_dashboard_stats_impl(&conn).unwrap();
        assert_eq!(stats.overdue_tasks, 1);
    }

    #[test]
    fn test_tasks_by_list() {
        let conn = setup();
        conn.execute(
            "INSERT INTO lists (id, name, color) VALUES ('l1', 'Work', '#ff0000')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO lists (id, name, color) VALUES ('l2', 'Home', '#00ff00')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, list_id) VALUES ('t1', 'Work task', 'l1')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, list_id) VALUES ('t2', 'Work task 2', 'l1')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, list_id) VALUES ('t3', 'Home task', 'l2')",
            [],
        ).unwrap();

        let stats = get_dashboard_stats_impl(&conn).unwrap();
        assert_eq!(stats.tasks_by_list.len(), 2);
        let work = stats.tasks_by_list.iter().find(|l| l.list_id == "l1").unwrap();
        assert_eq!(work.count, 2);
    }

    #[test]
    fn test_ignore_subtasks_in_stats() {
        let conn = setup();
        conn.execute(
            "INSERT INTO tasks (id, title, is_completed) VALUES ('parent', 'Parent', 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, is_completed, parent_task_id) VALUES ('child', 'Child', 0, 'parent')",
            [],
        ).unwrap();

        let stats = get_dashboard_stats_impl(&conn).unwrap();
        // Should only count the parent
        assert_eq!(stats.total_tasks, 1);
    }

    #[test]
    fn test_streak_with_no_completions() {
        let conn = setup();
        let streak = compute_streak(&conn, "2026-05-25");
        assert_eq!(streak, 0);
    }
}

fn compute_streak(conn: &Connection, today: &str) -> i64 {
    let mut streak: i64 = 0;
    if let Ok(mut stmt) = conn.prepare(
        "SELECT COUNT(*) FROM tasks
         WHERE is_archived = 0 AND is_completed = 1 AND parent_task_id IS NULL
           AND date(updated_at) = date(?1)",
    ) {
        if let Ok(count) = stmt.query_row([today], |row| row.get::<_, i64>(0)) {
            if count == 0 {
                // Check yesterday
                if let Ok(mut stmt2) = conn.prepare(
                    "SELECT COUNT(*) FROM tasks
                     WHERE is_archived = 0 AND is_completed = 1 AND parent_task_id IS NULL
                       AND date(updated_at) = date(?1, '-1 day')",
                ) {
                    if let Ok(c) = stmt2.query_row([today], |row| row.get::<_, i64>(0)) {
                        if c > 0 { streak = 1; }
                    }
                }
                return streak;
            }
        }
    }

    // Count consecutive days going backwards
    let mut day = 0;
    loop {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks
                 WHERE is_archived = 0 AND is_completed = 1 AND parent_task_id IS NULL
                   AND date(updated_at) = date(?1, '-' || ?2 || ' days')",
                rusqlite::params![today, day],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if count == 0 { break; }
        streak += 1;
        day += 1;
    }

    streak
}
