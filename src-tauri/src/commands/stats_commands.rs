use rusqlite::Connection;
use serde::Serialize;

use crate::error::AppError;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_tasks: i64,
    pub completed_tasks: i64,
    pub incomplete_tasks: i64,
    pub overdue_tasks: i64,
    pub suspended_tasks: i64,
    pub abandoned_tasks: i64,
    pub today_completed: i64,
    pub today_total: i64,
    pub completion_by_date: Vec<DayCount>,
    pub tasks_by_tag: Vec<TagCount>,
}

#[derive(Debug, Serialize)]
pub struct DayCount {
    pub date: String,
    pub completed: i64,
}

#[derive(Debug, Serialize)]
pub struct TagCount {
    pub tag_id: String,
    pub tag_name: String,
    pub tag_color: String,
    pub count: i64,
}

#[tauri::command]
pub fn get_dashboard_stats(state: tauri::State<'_, AppState>) -> Result<DashboardStats, AppError> {
    let conn = state.db()?;
    get_dashboard_stats_impl(&conn)
}

fn get_dashboard_stats_impl(conn: &Connection) -> Result<DashboardStats, AppError> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let total_tasks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND parent_task_id IS NULL",
            [],
            |row| row.get(0),
        )?;

    let completed_tasks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND (is_completed = 1 OR is_abandoned = 1) AND parent_task_id IS NULL",
            [],
            |row| row.get(0),
        )?;

    let incomplete_tasks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_completed = 0 AND is_abandoned = 0 AND parent_task_id IS NULL",
            [],
            |row| row.get(0),
        )?;

    let overdue_tasks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_completed = 0 AND is_abandoned = 0 AND due_date IS NOT NULL AND due_date < ?1 AND parent_task_id IS NULL",
            [&today],
            |row| row.get(0),
        )?;

    let suspended_tasks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_suspended = 1 AND parent_task_id IS NULL",
            [],
            |row| row.get(0),
        )?;

    let abandoned_tasks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_abandoned = 1 AND parent_task_id IS NULL",
            [],
            |row| row.get(0),
        )?;

    let today_completed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_completed = 1 AND date(updated_at) = ?1 AND parent_task_id IS NULL",
            [&today],
            |row| row.get(0),
        )?;

    let today_total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND parent_task_id IS NULL AND (substr(due_date, 1, 10) = ?1 OR date(updated_at) = ?1)",
            [&today],
            |row| row.get(0),
        )?;

    // Completion by date (last 7 days)
    let completion_by_date: Vec<DayCount> = {
        let mut stmt = conn.prepare(
            "SELECT date(updated_at) as d, COUNT(*) as c
             FROM tasks
             WHERE is_archived = 0 AND is_completed = 1 AND parent_task_id IS NULL
               AND date(updated_at) >= date(?1, '-6 days')
             GROUP BY d
             ORDER BY d",
        )?;
        let rows = stmt.query_map([&today], |row| {
            Ok(DayCount {
                date: row.get(0)?,
                completed: row.get(1)?,
            })
        })?;
        rows.flatten().collect()
    };

    // Tasks by tag
    let tasks_by_tag: Vec<TagCount> = {
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, t.color, COUNT(tk.id)
             FROM tags t
             LEFT JOIN tasks tk ON tk.tag_id = t.id AND tk.is_archived = 0 AND tk.is_suspended = 0 AND tk.is_abandoned = 0 AND tk.parent_task_id IS NULL
             GROUP BY t.id
             ORDER BY COUNT(tk.id) DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(TagCount {
                tag_id: row.get(0)?,
                tag_name: row.get(1)?,
                tag_color: row.get(2)?,
                count: row.get(3)?,
            })
        })?;
        rows.flatten().collect()
    };

    Ok(DashboardStats {
        total_tasks,
        completed_tasks,
        incomplete_tasks,
        overdue_tasks,
        suspended_tasks,
        abandoned_tasks,
        today_completed,
        today_total,
        completion_by_date,
        tasks_by_tag,
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
        assert_eq!(stats.suspended_tasks, 0);
        assert_eq!(stats.abandoned_tasks, 0);
        assert!(stats.tasks_by_tag.is_empty());
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
    fn test_tasks_by_tag() {
        let conn = setup();
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES ('l1', 'Work', '#ff0000')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES ('l2', 'Home', '#00ff00')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, tag_id) VALUES ('t1', 'Work task', 'l1')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, tag_id) VALUES ('t2', 'Work task 2', 'l1')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, tag_id) VALUES ('t3', 'Home task', 'l2')",
            [],
        ).unwrap();

        let stats = get_dashboard_stats_impl(&conn).unwrap();
        assert_eq!(stats.tasks_by_tag.len(), 2);
        let work = stats.tasks_by_tag.iter().find(|t| t.tag_id == "l1").unwrap();
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

}
