use chrono::{Datelike, Days, Months, NaiveDate};
use rusqlite::Connection;
use serde_json::Value;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::task::{
    CreateTaskRequest, ReorderItem, Task, TaskDetail, TaskFilter, UpdateTaskRequest,
};

fn parse_recurrence(recurrence: &str) -> Option<(String, i64)> {
    let v: Value = serde_json::from_str(recurrence).ok()?;
    let typ = v.get("type")?.as_str()?.to_string();
    let interval = v.get("interval")?.as_i64().unwrap_or(1);
    Some((typ, interval))
}

fn compute_next_due(current_due: &str, rec_type: &str, interval: i64) -> Option<String> {
    let date = NaiveDate::parse_from_str(current_due, "%Y-%m-%d").ok()?;
    let next = match rec_type {
        "daily" => date.checked_add_days(Days::new(interval as u64))?,
        "weekly" => date.checked_add_days(Days::new((interval * 7) as u64))?,
        "monthly" => date.checked_add_months(Months::new(interval as u32))?,
        "yearly" => {
            let year = date.year() + interval as i32;
            NaiveDate::from_ymd_opt(year, date.month(), date.day())?
        }
        _ => return None,
    };
    Some(next.format("%Y-%m-%d").to_string())
}

fn advance_reminder_time(old_due: &str, old_reminder: &str, new_due: &str) -> Option<String> {
    use chrono::NaiveDateTime;
    let old_due_date = NaiveDate::parse_from_str(old_due, "%Y-%m-%d").ok()?;
    let old_rem_dt = NaiveDateTime::parse_from_str(old_reminder, "%Y-%m-%d %H:%M").ok()?;
    let new_due_date = NaiveDate::parse_from_str(new_due, "%Y-%m-%d").ok()?;
    let old_rem_date = old_rem_dt.date();
    let offset = old_rem_date.signed_duration_since(old_due_date);
    let new_rem_date = new_due_date.checked_add_days(Days::new(offset.num_days().max(0) as u64))?;
    let new_rem_time = old_rem_dt.time();
    Some(format!("{} {}", new_rem_date.format("%Y-%m-%d"), new_rem_time.format("%H:%M")))
}

fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get("id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        is_completed: row.get::<_, i32>("is_completed")? != 0,
        is_archived: row.get::<_, i32>("is_archived")? != 0,
        priority: row.get("priority")?,
        due_date: row.get("due_date")?,
        reminder: row.get("reminder")?,
        tag_id: row.get("tag_id")?,
        parent_task_id: row.get("parent_task_id")?,
        sort_order: row.get("sort_order")?,
        recurrence: row.get("recurrence")?,
        my_day_date: row.get("my_day_date").ok(),
        children_count: row.get("children_count").ok(),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn create(conn: &Connection, req: CreateTaskRequest) -> Result<Task, AppError> {
    let id = Uuid::new_v4().to_string();

    let title = req.title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::Validation("Title cannot be empty".to_string()));
    }

    if let Some(ref parent_id) = req.parent_task_id {
        let parent = get_by_id(conn, parent_id)?
            .ok_or_else(|| AppError::NotFound(format!("Parent task {} not found", parent_id)))?;
        if parent.parent_task_id.is_some() {
            return Err(AppError::Validation(
                "Maximum subtask depth is 2 levels".to_string(),
            ));
        }
    }

    let max_order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM tasks WHERE parent_task_id IS ?1 AND tag_id IS ?2",
        rusqlite::params![req.parent_task_id, req.tag_id],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT INTO tasks (id, title, description, tag_id, parent_task_id, due_date, priority, reminder, recurrence, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            id,
            title,
            req.description.unwrap_or_default(),
            req.tag_id,
            req.parent_task_id,
            req.due_date,
            req.priority.unwrap_or(0),
            req.reminder,
            req.recurrence,
            max_order + 1,
        ],
    )?;

    get_by_id(conn, &id)?.ok_or(AppError::Generic("Failed to create task".to_string()))
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Task>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, is_completed, is_archived, priority, due_date, reminder,
                tag_id, parent_task_id, sort_order, recurrence, my_day_date, created_at, updated_at
         FROM tasks WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(rusqlite::params![id], row_to_task)?;
    Ok(rows.next().transpose()?)
}

pub fn get_children(conn: &Connection, parent_id: &str) -> Result<Vec<Task>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, is_completed, is_archived, priority, due_date, reminder,
                tag_id, parent_task_id, sort_order, recurrence, my_day_date, created_at, updated_at
         FROM tasks WHERE parent_task_id = ?1 AND is_archived = 0
         ORDER BY sort_order ASC",
    )?;
    let rows = stmt.query_map(rusqlite::params![parent_id], row_to_task)?;
    let result: Result<Vec<_>, _> = rows.collect();
    Ok(result?)
}

pub fn get_detail(conn: &Connection, id: &str) -> Result<Option<TaskDetail>, AppError> {
    let task = match get_by_id(conn, id)? {
        Some(t) => t,
        None => return Ok(None),
    };
    let children = get_children(conn, id)?;
    Ok(Some(TaskDetail { task, children }))
}

pub fn get_all(conn: &Connection, filter: TaskFilter) -> Result<Vec<Task>, AppError> {
    let mut sql = String::from(
        "SELECT t.id, t.title, t.description, t.is_completed, t.is_archived, t.priority, t.due_date,
                t.reminder, t.tag_id, t.parent_task_id, t.sort_order, t.recurrence, t.my_day_date,
                (SELECT COUNT(*) FROM tasks c WHERE c.parent_task_id = t.id AND c.is_archived = 0) AS children_count,
                t.created_at, t.updated_at
         FROM tasks t WHERE t.is_archived = 0",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref parent_id) = filter.parent_task_id {
        sql.push_str(" AND t.parent_task_id = ?");
        params.push(Box::new(parent_id.clone()));
    } else if !filter.include_children.unwrap_or(false) {
        sql.push_str(" AND t.parent_task_id IS NULL");
    }

    if let Some(ref tag_id) = filter.tag_id {
        sql.push_str(" AND t.tag_id = ?");
        params.push(Box::new(tag_id.clone()));
    }

    if let Some(completed) = filter.is_completed {
        sql.push_str(" AND t.is_completed = ?");
        params.push(Box::new(completed as i32));
    }

    if let Some(ref from) = filter.due_date_from {
        sql.push_str(" AND t.due_date >= ?");
        params.push(Box::new(from.clone()));
    }

    if let Some(ref to) = filter.due_date_to {
        sql.push_str(" AND t.due_date <= ?");
        params.push(Box::new(to.clone()));
    }

    if let Some(ref query) = filter.search_query {
        sql.push_str(" AND (t.title LIKE ? OR t.description LIKE ?)");
        let pattern = format!("%{}%", query);
        params.push(Box::new(pattern.clone()));
        params.push(Box::new(pattern));
    }

    if let Some(ref my_day) = filter.my_day_date {
        sql.push_str(" AND t.my_day_date = ?");
        params.push(Box::new(my_day.clone()));
    }

    sql.push_str(" ORDER BY t.sort_order ASC");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(param_refs.as_slice(), row_to_task)?;
    let result: Vec<Task> = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(result)
}

pub fn get_today_count(conn: &Connection, today: &str) -> Result<i64, AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_completed = 0 AND parent_task_id IS NULL AND due_date = ?1",
        rusqlite::params![today],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn update(conn: &Connection, id: &str, req: UpdateTaskRequest) -> Result<Task, AppError> {
    let existing = get_by_id(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Task {} not found", id)))?;

    let title = req.title.unwrap_or(existing.title);
    if title.trim().is_empty() {
        return Err(AppError::Validation("Title cannot be empty".to_string()));
    }

    let description = req.description.unwrap_or(existing.description);
    let is_completed = req.is_completed.unwrap_or(existing.is_completed);
    let priority = req.priority.unwrap_or(existing.priority);
    let due_date = match req.due_date {
        None => existing.due_date.clone(),
        Some(ref d) if d.is_empty() => None,
        Some(ref d) => Some(d.clone()),
    };
    let tag_id = match req.tag_id {
        None => existing.tag_id.clone(),
        Some(ref d) if d.is_empty() => None,
        Some(ref d) => Some(d.clone()),
    };
    let original_reminder = existing.reminder.clone();
    let reminder = req.reminder.or(original_reminder.clone());
    let recurrence = req.recurrence.or(existing.recurrence);
    let my_day_date = match req.my_day_date {
        None => existing.my_day_date.clone(),
        Some(None) => None,
        Some(Some(ref d)) => Some(d.clone()),
    };

    let existing_parent_task_id = existing.parent_task_id.clone();

    let parent_task_id = match req.parent_task_id {
        None => existing.parent_task_id,
        Some(None) => None,
        Some(Some(ref new_parent)) => {
            if new_parent == id {
                return Err(AppError::Validation("Task cannot be its own parent".to_string()));
            }
            let parent = get_by_id(conn, new_parent)?
                .ok_or_else(|| AppError::NotFound(format!("Parent task {} not found", new_parent)))?;
            if parent.parent_task_id.is_some() {
                return Err(AppError::Validation(
                    "Maximum subtask depth is 2 levels".to_string(),
                ));
            }
            Some(new_parent.clone())
        }
    };

    // Handle recurrence: if just completed and has recurrence, create next occurrence
    let just_completed = !existing.is_completed && is_completed;
    if just_completed {
        if let Some(ref rec) = recurrence {
            if let Some((rec_type, interval)) = parse_recurrence(rec) {
                if let Some(ref current_due) = due_date {
                    if let Some(next_due) = compute_next_due(current_due, &rec_type, interval) {
                        let next_reminder = match (&due_date, &original_reminder) {
                            (Some(old_due), Some(old_rem)) => {
                                advance_reminder_time(old_due, old_rem, &next_due)
                            }
                            _ => reminder.clone(),
                        };
                        let _ = create(
                            conn,
                            CreateTaskRequest {
                                title: title.clone(),
                                description: Some(description.clone()),
                                tag_id: tag_id.clone(),
                                parent_task_id: existing_parent_task_id.clone(),
                                due_date: Some(next_due),
                                priority: Some(priority),
                                reminder: next_reminder,
                                recurrence: Some(rec.clone()),
                            },
                        );
                    }
                }
            }
        }
    }

    let reminder_changed = reminder != original_reminder;
    conn.execute(
        "UPDATE tasks SET title = ?1, description = ?2, is_completed = ?3, priority = ?4,
         due_date = ?5, tag_id = ?6, parent_task_id = ?7, reminder = ?8, recurrence = ?9,
         my_day_date = ?10, reminded = CASE WHEN ?12 THEN 0 ELSE reminded END,
         updated_at = datetime('now') WHERE id = ?11",
        rusqlite::params![
            title,
            description,
            is_completed as i32,
            priority,
            due_date,
            tag_id,
            parent_task_id,
            reminder,
            recurrence,
            my_day_date,
            id,
            reminder_changed,
        ],
    )?;

    get_by_id(conn, id)?.ok_or(AppError::Generic("Failed to update task".to_string()))
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM tasks WHERE id = ?1", rusqlite::params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Task {} not found", id)));
    }
    Ok(())
}

pub fn reorder(conn: &Connection, items: Vec<ReorderItem>) -> Result<(), AppError> {
    for item in &items {
        if let Some(ref parent_id) = item.parent_task_id {
            let parent = get_by_id(conn, parent_id)?
                .ok_or_else(|| AppError::NotFound(format!("Parent task {} not found", parent_id)))?;
            if parent.parent_task_id.is_some() {
                return Err(AppError::Validation(
                    "Maximum subtask depth is 2 levels".to_string(),
                ));
            }
        }
    }
    let tx = conn.unchecked_transaction()?;
    for item in &items {
        tx.execute(
            "UPDATE tasks SET sort_order = ?1, parent_task_id = ?2, updated_at = datetime('now') WHERE id = ?3",
            rusqlite::params![item.sort_order, item.parent_task_id, item.id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn duplicate(conn: &Connection, id: &str) -> Result<Task, AppError> {
    let original = get_by_id(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Task {} not found", id)))?;

    let new_id = Uuid::new_v4().to_string();
    let new_title = format!("{} (copy)", original.title);

    let max_order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM tasks WHERE parent_task_id IS ?1 AND tag_id IS ?2",
        rusqlite::params![original.parent_task_id, original.tag_id],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT INTO tasks (id, title, description, is_completed, priority, due_date, tag_id,
         parent_task_id, sort_order, recurrence)
         VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            new_id,
            new_title,
            original.description,
            original.priority,
            original.due_date,
            original.tag_id,
            original.parent_task_id,
            max_order + 1,
            original.recurrence,
        ],
    )?;

    let children = get_children(conn, id)?;
    for (i, child) in children.iter().enumerate() {
        let child_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO tasks (id, title, description, is_completed, priority, due_date, tag_id,
             parent_task_id, sort_order)
             VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                child_id,
                child.title,
                child.description,
                child.priority,
                child.due_date,
                child.tag_id,
                new_id,
                i as i32,
            ],
        )?;
    }

    get_by_id(conn, &new_id)?.ok_or(AppError::Generic("Failed to duplicate task".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    fn create_req(title: &str, parent: Option<String>) -> CreateTaskRequest {
        CreateTaskRequest {
            title: title.to_string(),
            description: None,
            tag_id: None,
            parent_task_id: parent,
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
        }
    }

    #[test]
    fn test_create_and_retrieve() {
        let conn = setup();
        let task = create(&conn, create_req("Test task", None)).unwrap();
        assert_eq!(task.title, "Test task");
        assert!(!task.is_completed);

        let fetched = get_by_id(&conn, &task.id).unwrap().unwrap();
        assert_eq!(fetched.title, "Test task");
    }

    #[test]
    fn test_empty_title_rejected() {
        let conn = setup();
        let result = create(&conn, create_req("   ", None));
        assert!(result.is_err());
    }

    #[test]
    fn test_subtask_cascade_delete() {
        let conn = setup();
        let parent = create(&conn, create_req("Parent", None)).unwrap();
        let child = create(&conn, create_req("Child", Some(parent.id.clone()))).unwrap();

        let children = get_children(&conn, &parent.id).unwrap();
        assert_eq!(children.len(), 1);

        delete(&conn, &parent.id).unwrap();
        assert!(get_by_id(&conn, &child.id).unwrap().is_none());
    }

    #[test]
    fn test_max_depth_enforcement() {
        let conn = setup();
        let parent = create(&conn, create_req("Level 1", None)).unwrap();
        let child = create(&conn, create_req("Level 2", Some(parent.id.clone()))).unwrap();
        let result = create(&conn, create_req("Level 3", Some(child.id.clone())));
        assert!(result.is_err());
    }

    #[test]
    fn test_update_task() {
        let conn = setup();
        let task = create(&conn, create_req("Original", None)).unwrap();

        let updated = update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                title: Some("Updated".to_string()),
                description: None,
                is_completed: Some(true),
                priority: Some(3),
                due_date: None,
                tag_id: None,
                parent_task_id: None,
                reminder: None,
                recurrence: None,
                my_day_date: None,
            },
        )
        .unwrap();

        assert_eq!(updated.title, "Updated");
        assert!(updated.is_completed);
        assert_eq!(updated.priority, 3);
    }

    #[test]
    fn test_date_filter() {
        let conn = setup();
        create(
            &conn,
            CreateTaskRequest {
                title: "Past".to_string(),
                due_date: Some("2026-01-01".to_string()),
                ..create_req("", None)
            },
        )
        .unwrap();
        create(
            &conn,
            CreateTaskRequest {
                title: "Future".to_string(),
                due_date: Some("2026-12-01".to_string()),
                ..create_req("", None)
            },
        )
        .unwrap();

        let results = get_all(
            &conn,
            TaskFilter {
                due_date_from: Some("2026-06-01".to_string()),
                due_date_to: Some("2026-12-31".to_string()),
                ..TaskFilter {
                    tag_id: None,
                    is_completed: None,
                    due_date_from: None,
                    due_date_to: None,
                    search_query: None,
                    parent_task_id: None,
                    my_day_date: None,
                    include_children: None,
                }
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Future");
    }

    #[test]
    fn test_duplicate_task() {
        let conn = setup();
        let original = create(&conn, create_req("Original", None)).unwrap();
        let _child = create(&conn, create_req("Child", Some(original.id.clone()))).unwrap();

        let dup = duplicate(&conn, &original.id).unwrap();
        assert_eq!(dup.title, "Original (copy)");

        let dup_children = get_children(&conn, &dup.id).unwrap();
        assert_eq!(dup_children.len(), 1);
    }

    #[test]
    fn test_reorder_tasks() {
        let conn = setup();
        let t1 = create(&conn, create_req("First", None)).unwrap();
        let t2 = create(&conn, create_req("Second", None)).unwrap();
        let t3 = create(&conn, create_req("Third", None)).unwrap();

        reorder(
            &conn,
            vec![
                ReorderItem { id: t3.id.clone(), sort_order: 0, parent_task_id: None },
                ReorderItem { id: t1.id.clone(), sort_order: 1, parent_task_id: None },
                ReorderItem { id: t2.id.clone(), sort_order: 2, parent_task_id: None },
            ],
        )
        .unwrap();

        let all = get_all(&conn, TaskFilter {
            tag_id: None, is_completed: None, due_date_from: None,
            due_date_to: None, search_query: None, parent_task_id: None,
            my_day_date: None,include_children: None,
        }).unwrap();
        assert_eq!(all[0].id, t3.id);
        assert_eq!(all[1].id, t1.id);
        assert_eq!(all[2].id, t2.id);
    }

    #[test]
    fn test_search_filter() {
        let conn = setup();
        create(&conn, create_req("Buy groceries", None)).unwrap();
        create(&conn, create_req("Read a book", None)).unwrap();
        create(&conn, create_req("Buy a car", None)).unwrap();

        let results = get_all(&conn, TaskFilter {
            tag_id: None, is_completed: None, due_date_from: None,
            due_date_to: None, search_query: Some("Buy".to_string()),
            parent_task_id: None, my_day_date: None,include_children: None,
        }).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_completed_filter() {
        let conn = setup();
        let t1 = create(&conn, create_req("Incomplete", None)).unwrap();
        create(&conn, create_req("Incomplete 2", None)).unwrap();
        update(&conn, &t1.id, UpdateTaskRequest {
            title: None, description: None, is_completed: Some(true),
            priority: None, due_date: None, tag_id: None,
            parent_task_id: None, reminder: None, recurrence: None,
            my_day_date: None,
        }).unwrap();

        let completed = get_all(&conn, TaskFilter {
            tag_id: None, is_completed: Some(true), due_date_from: None,
            due_date_to: None, search_query: None, parent_task_id: None,
            my_day_date: None,include_children: None,
        }).unwrap();
        assert_eq!(completed.len(), 1);
    }

    #[test]
    fn test_update_not_found() {
        let conn = setup();
        let result = update(&conn, "nonexistent", UpdateTaskRequest {
            title: Some("Nope".to_string()), description: None,
            is_completed: None, priority: None, due_date: None,
            tag_id: None, parent_task_id: None, reminder: None,
            recurrence: None, my_day_date: None,
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_not_found() {
        let conn = setup();
        let result = delete(&conn, "nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_duplicate_not_found() {
        let conn = setup();
        let result = duplicate(&conn, "nonexistent");
        assert!(result.is_err());
    }
}
