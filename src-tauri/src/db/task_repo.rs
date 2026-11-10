use chrono::{Datelike, Days, Local, Months, NaiveDate};
use rusqlite::Connection;
use serde_json::json;
use serde_json::Value;
use uuid::Uuid;

use crate::db::history_repo;
use crate::db::progress_repo;
use crate::db::reminder_repo;
use crate::db::sync_repo;
use crate::error::AppError;
use crate::models::task::{
    CreateTaskRequest, ReorderItem, Task, TaskDetail, TaskFilter, UpdateTaskRequest,
};

fn now_local() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn parse_recurrence(recurrence: &str) -> Option<(String, i64)> {
    let v: Value = serde_json::from_str(recurrence).ok()?;
    let typ = v.get("type")?.as_str()?.to_string();
    let interval = v.get("interval")?.as_i64().unwrap_or(1);
    Some((typ, interval))
}

fn parse_due_date_only(due: &str) -> &str {
    if due.len() > 10 {
        &due[..10]
    } else {
        due
    }
}

fn compute_next_due(current_due: &str, rec_type: &str, interval: i64) -> Option<String> {
    let date = NaiveDate::parse_from_str(parse_due_date_only(current_due), "%Y-%m-%d").ok()?;
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
    let old_due_date = NaiveDate::parse_from_str(parse_due_date_only(old_due), "%Y-%m-%d").ok()?;
    let old_rem_dt = NaiveDateTime::parse_from_str(old_reminder, "%Y-%m-%d %H:%M").ok()?;
    let new_due_date = NaiveDate::parse_from_str(parse_due_date_only(new_due), "%Y-%m-%d").ok()?;
    let old_rem_date = old_rem_dt.date();
    let offset = old_rem_date.signed_duration_since(old_due_date);
    let new_rem_date = new_due_date.checked_add_days(Days::new(offset.num_days().max(0) as u64))?;
    let new_rem_time = old_rem_dt.time();
    Some(format!(
        "{} {}",
        new_rem_date.format("%Y-%m-%d"),
        new_rem_time.format("%H:%M")
    ))
}

fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get("id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        is_completed: row.get::<_, i32>("is_completed")? != 0,
        is_archived: row.get::<_, i32>("is_archived")? != 0,
        is_suspended: row.get::<_, i32>("is_suspended")? != 0,
        is_abandoned: row.get::<_, i32>("is_abandoned")? != 0,
        is_pinned: row.get::<_, i32>("is_pinned")? != 0,
        priority: row.get("priority")?,
        due_date: row.get("due_date")?,
        reminder: row.get("reminder")?,
        tag_ids: {
            let raw: String = row.get("tag_ids").unwrap_or_else(|_| "[]".into());
            serde_json::from_str(&raw).unwrap_or_default()
        },
        parent_task_id: row.get("parent_task_id")?,
        sort_order: row.get("sort_order")?,
        recurrence: row.get("recurrence")?,
        my_day_date: row.get("my_day_date").ok(),
        children_count: row.get("children_count").ok(),
        source: row.get("source").ok(),
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

    let sort_order: i32 = if req.parent_task_id.is_some() {
        let max: i32 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM tasks WHERE parent_task_id = ?1",
            rusqlite::params![req.parent_task_id],
            |row| row.get(0),
        )?;
        max + 1
    } else {
        conn.execute(
            "UPDATE tasks SET sort_order = sort_order + 1 WHERE parent_task_id IS NULL",
            rusqlite::params![],
        )?;
        0
    };

    let now = now_local();
    conn.execute(
        "INSERT INTO tasks (id, title, description, parent_task_id, due_date, priority, reminder, recurrence, my_day_date, sort_order, source, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            id,
            title,
            req.description.unwrap_or_default(),
            req.parent_task_id,
            req.due_date,
            req.priority.unwrap_or(0),
            req.reminder,
            req.recurrence,
            req.my_day_date,
            sort_order,
            req.source,
            now,
            now,
        ],
    )?;

    // 写入多标签关联
    if let Some(ref tag_ids) = req.tag_ids {
        for tid in tag_ids {
            if !tid.is_empty() {
                conn.execute(
                    "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                    rusqlite::params![id, tid],
                )?;
            }
        }
    }

    let task =
        get_by_id(conn, &id)?.ok_or(AppError::Generic("Failed to create task".to_string()))?;
    let _ = sync_repo::record_local_operation(
        conn,
        "task",
        &task.id,
        "create",
        json!({ "task": task }),
    )?;
    get_by_id(conn, &id)?.ok_or(AppError::Generic("Failed to create task".to_string()))
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Task>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, is_completed, is_archived, is_suspended, is_abandoned, is_pinned,
                priority, due_date, reminder,
                COALESCE((SELECT json_group_array(tag_id) FROM task_tags WHERE task_id = tasks.id AND tag_id IS NOT NULL), '[]') AS tag_ids,
                parent_task_id, sort_order, recurrence, my_day_date, source, created_at, updated_at
         FROM tasks WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(rusqlite::params![id], row_to_task)?;
    Ok(rows.next().transpose()?)
}

pub fn get_children(conn: &Connection, parent_id: &str) -> Result<Vec<Task>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, is_completed, is_archived, is_suspended, is_abandoned, is_pinned,
                priority, due_date, reminder,
                COALESCE((SELECT json_group_array(tag_id) FROM task_tags WHERE task_id = tasks.id AND tag_id IS NOT NULL), '[]') AS tag_ids,
                parent_task_id, sort_order, recurrence, my_day_date, source, created_at, updated_at
         FROM tasks WHERE parent_task_id = ?1 AND is_archived = 0 AND deleted_at IS NULL
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
    let completed_at = if task.is_completed {
        history_repo::confirmed_completed_at(conn, id)?
    } else {
        None
    };
    let children = get_children(conn, id)?;
    Ok(Some(TaskDetail {
        task,
        children,
        completed_at,
    }))
}

pub fn get_all(conn: &Connection, filter: TaskFilter) -> Result<Vec<Task>, AppError> {
    let mut sql = String::from(
        "SELECT t.id, t.title, t.description, t.is_completed, t.is_archived, t.is_suspended, t.is_abandoned, t.is_pinned,
                t.priority, t.due_date,
                t.reminder, COALESCE((SELECT json_group_array(tag_id) FROM task_tags WHERE task_id = t.id AND tag_id IS NOT NULL), '[]') AS tag_ids,
                t.parent_task_id, t.sort_order, t.recurrence, t.my_day_date, t.source,
                (SELECT COUNT(*) FROM tasks c WHERE c.parent_task_id = t.id AND c.is_archived = 0 AND c.deleted_at IS NULL) AS children_count,
                t.created_at, t.updated_at
         FROM tasks t WHERE t.deleted_at IS NULL",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let inc_children = filter.include_children.unwrap_or(false);

    if !filter.include_archived.unwrap_or(false) {
        sql.push_str(" AND t.is_archived = 0");
    }

    if let Some(ref parent_id) = filter.parent_task_id {
        sql.push_str(" AND t.parent_task_id = ?");
        params.push(Box::new(parent_id.clone()));
    } else if !inc_children {
        sql.push_str(" AND t.parent_task_id IS NULL");
    }

    if let Some(ref tag_ids) = filter.tag_ids {
        if !tag_ids.is_empty() {
            let placeholders = vec!["?"; tag_ids.len()].join(", ");
            if inc_children {
                sql.push_str(&format!(
                    " AND (t.parent_task_id IS NOT NULL OR t.id IN (SELECT task_id FROM task_tags WHERE tag_id IN ({})))",
                    placeholders
                ));
            } else {
                sql.push_str(&format!(
                    " AND t.id IN (SELECT task_id FROM task_tags WHERE tag_id IN ({}))",
                    placeholders
                ));
            }
            for tid in tag_ids {
                params.push(Box::new(tid.clone()));
            }
        }
    }

    if let Some(completed) = filter.is_completed {
        sql.push_str(" AND t.is_completed = ?");
        params.push(Box::new(completed as i32));
    }

    if let Some(ref from) = filter.due_date_from {
        if inc_children {
            sql.push_str(" AND (t.parent_task_id IS NOT NULL OR t.due_date >= ?)");
        } else {
            sql.push_str(" AND t.due_date >= ?");
        }
        params.push(Box::new(from.clone()));
    }

    if let Some(ref to) = filter.due_date_to {
        if inc_children {
            sql.push_str(" AND (t.parent_task_id IS NOT NULL OR substr(t.due_date, 1, 10) <= ?)");
        } else {
            sql.push_str(" AND substr(t.due_date, 1, 10) <= ?");
        }
        params.push(Box::new(to.clone()));
    }

    if let Some(ref query) = filter.search_query {
        sql.push_str(" AND (t.title LIKE ? OR t.description LIKE ?)");
        let pattern = format!("%{}%", query);
        params.push(Box::new(pattern.clone()));
        params.push(Box::new(pattern));
    }

    if let Some(ref my_day) = filter.my_day_date {
        if inc_children {
            sql.push_str(" AND (t.parent_task_id IS NOT NULL OR t.my_day_date = ?)");
        } else {
            sql.push_str(" AND t.my_day_date = ?");
        }
        params.push(Box::new(my_day.clone()));
    }

    if let Some(priority) = filter.priority {
        sql.push_str(" AND t.priority = ?");
        params.push(Box::new(priority));
    }

    if let Some(suspended) = filter.is_suspended {
        if suspended && inc_children {
            sql.push_str(" AND (t.parent_task_id IS NOT NULL OR t.is_suspended = ?)");
        } else {
            sql.push_str(" AND t.is_suspended = ?");
        }
        params.push(Box::new(suspended as i32));
    }

    if let Some(abandoned) = filter.is_abandoned {
        if abandoned && inc_children {
            sql.push_str(" AND (t.parent_task_id IS NOT NULL OR t.is_abandoned = ?)");
        } else {
            sql.push_str(" AND t.is_abandoned = ?");
        }
        params.push(Box::new(abandoned as i32));
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
        "SELECT COUNT(*) FROM tasks WHERE is_archived = 0 AND is_completed = 0 AND deleted_at IS NULL AND parent_task_id IS NULL AND substr(due_date, 1, 10) = ?1",
        rusqlite::params![today],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn update(conn: &Connection, id: &str, req: UpdateTaskRequest) -> Result<Task, AppError> {
    // 任务变化与状态事件同一事务提交:事件写入失败时整体回滚(设计 §4)
    let tx = conn.unchecked_transaction()?;
    let existing =
        get_by_id(&tx, id)?.ok_or_else(|| AppError::NotFound(format!("Task {} not found", id)))?;

    let title = req.title.clone().unwrap_or(existing.title.clone());
    if title.trim().is_empty() {
        return Err(AppError::Validation("Title cannot be empty".to_string()));
    }

    let description = req.description.clone().unwrap_or(existing.description.clone());
    let is_completed = req.is_completed.unwrap_or(existing.is_completed);
    let priority = req.priority.unwrap_or(existing.priority);
    let due_date = match req.due_date {
        None => existing.due_date.clone(),
        Some(ref d) if d.is_empty() => None,
        Some(ref d) => Some(d.clone()),
    };
    let tag_ids = match req.tag_ids {
        None => existing.tag_ids.clone(),
        Some(ref list) => list.clone(),
    };
    let original_reminder = existing.reminder.clone();
    let reminder = req.reminder.clone().or(original_reminder.clone());
    let recurrence = match req.recurrence {
        None => existing.recurrence.clone(),
        Some(ref d) if d.is_empty() => None,
        Some(ref d) => Some(d.clone()),
    };
    let my_day_date = match req.my_day_date {
        None => existing.my_day_date.clone(),
        Some(None) => None,
        Some(Some(ref d)) => Some(d.clone()),
    };
    let is_suspended = req.is_suspended.unwrap_or(existing.is_suspended);
    let is_abandoned = req.is_abandoned.unwrap_or(existing.is_abandoned);
    let is_pinned = req.is_pinned.unwrap_or(existing.is_pinned);

    let existing_parent_task_id = existing.parent_task_id.clone();

    let parent_task_id = match req.parent_task_id {
        None => existing.parent_task_id.clone(),
        Some(None) => None,
        Some(Some(ref new_parent)) => {
            if new_parent == id {
                return Err(AppError::Validation(
                    "Task cannot be its own parent".to_string(),
                ));
            }
            let parent = get_by_id(&tx, new_parent)?.ok_or_else(|| {
                AppError::NotFound(format!("Parent task {} not found", new_parent))
            })?;
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
                            &tx,
                            CreateTaskRequest {
                                title: title.clone(),
                                description: Some(description.clone()),
                                tag_ids: Some(tag_ids.clone()),
                                parent_task_id: existing_parent_task_id.clone(),
                                due_date: Some(next_due),
                                priority: Some(priority),
                                reminder: next_reminder,
                                recurrence: Some(rec.clone()),
                                my_day_date: None,
                                source: None,
                            },
                        );
                    }
                }
            }
        }
    }

    let reminder_changed = reminder != original_reminder;
    let now = now_local();
    tx.execute(
        "UPDATE tasks SET title = ?1, description = ?2, is_completed = ?3, priority = ?4,
         due_date = ?5, parent_task_id = ?6, reminder = ?7, recurrence = ?8,
         my_day_date = ?9, is_suspended = ?10, is_abandoned = ?11,
         is_pinned = ?15,
         reminded = CASE WHEN ?13 THEN 0 ELSE reminded END,
         updated_at = ?14 WHERE id = ?12",
        rusqlite::params![
            title,
            description,
            is_completed as i32,
            priority,
            due_date,
            parent_task_id,
            reminder,
            recurrence,
            my_day_date,
            is_suspended as i32,
            is_abandoned as i32,
            id,
            reminder_changed,
            now,
            is_pinned as i32,
        ],
    )?;

    // 多标签关联:tag_ids 显式传入时替换
    if let Some(ref list) = req.tag_ids {
        tx.execute(
            "DELETE FROM task_tags WHERE task_id = ?1",
            rusqlite::params![id],
        )?;
        for tid in list {
            if !tid.is_empty() {
                tx.execute(
                    "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                    rusqlite::params![id, tid],
                )?;
            }
        }
    }

    // 真实状态转换事件:与任务变化同事务;留存关闭时不写(任务照常完成)
    let transitions = history_repo::compute_transitions(
        existing.is_completed,
        is_completed,
        existing.is_suspended,
        is_suspended,
        existing.is_abandoned,
        is_abandoned,
    );
    if !transitions.is_empty() && history_repo::is_retention_enabled(&tx)? {
        let mut snapshot = existing.clone();
        snapshot.title = title.clone();
        snapshot.is_completed = is_completed;
        snapshot.is_suspended = is_suspended;
        snapshot.is_abandoned = is_abandoned;
        snapshot.parent_task_id = parent_task_id.clone();
        history_repo::record_transitions(
            &tx,
            &snapshot,
            &transitions,
            req.status_event_source.as_deref().unwrap_or("gui"),
        )?;
    }

    let task =
        get_by_id(&tx, id)?.ok_or(AppError::Generic("Failed to update task".to_string()))?;
    let _ = sync_repo::record_local_operation(&tx, "task", id, "update", json!({ "task": task }))?;
    tx.commit()?;
    Ok(task)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    if sync_repo::is_sync_enabled(&tx)? {
        let _existing = get_by_id(&tx, id)?
            .ok_or_else(|| AppError::NotFound(format!("Task {} not found", id)))?;
        let _ =
            sync_repo::record_local_operation(&tx, "task", id, "delete", json!({ "id": id }))?;
        tx.execute(
            "UPDATE tasks
             SET deleted_at = COALESCE(deleted_at, ?1),
                 updated_at = ?1,
                 sync_status = 'deleted'
             WHERE parent_task_id = ?2",
            rusqlite::params![now_local(), id],
        )?;
        // 软删除:清除本任务与子任务的手写正文,保留最小状态事实
        let mut related = vec![id.to_string()];
        related.extend(child_ids(&tx, id)?);
        progress_repo::clear_record_bodies_for_tasks(&tx, &related)?;
        tx.commit()?;
        return Ok(());
    }

    // 硬删除前收集子任务,删除后清除关联手写正文(事件按逻辑引用保留)
    let related = {
        let mut ids = vec![id.to_string()];
        ids.extend(child_ids(&tx, id)?);
        ids
    };
    let affected = tx.execute("DELETE FROM tasks WHERE id = ?1", rusqlite::params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Task {} not found", id)));
    }
    progress_repo::clear_record_bodies_for_tasks(&tx, &related)?;
    tx.commit()?;
    Ok(())
}

fn child_ids(conn: &Connection, parent_id: &str) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare("SELECT id FROM tasks WHERE parent_task_id = ?1")?;
    let ids = stmt
        .query_map(rusqlite::params![parent_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

pub fn reorder(conn: &Connection, items: Vec<ReorderItem>) -> Result<(), AppError> {
    for item in &items {
        if let Some(ref parent_id) = item.parent_task_id {
            let parent = get_by_id(conn, parent_id)?.ok_or_else(|| {
                AppError::NotFound(format!("Parent task {} not found", parent_id))
            })?;
            if parent.parent_task_id.is_some() {
                return Err(AppError::Validation(
                    "Maximum subtask depth is 2 levels".to_string(),
                ));
            }
        }
    }
    let now = now_local();
    let tx = conn.unchecked_transaction()?;
    for item in &items {
        tx.execute(
            "UPDATE tasks SET sort_order = ?1, parent_task_id = ?2, updated_at = ?3 WHERE id = ?4",
            rusqlite::params![item.sort_order, item.parent_task_id, now, item.id],
        )?;
    }
    tx.commit()?;
    if sync_repo::is_sync_enabled(conn)? {
        for item in &items {
            let _ = sync_repo::record_local_operation(
                conn,
                "task",
                &item.id,
                "reorder",
                json!({
                    "id": item.id,
                    "sort_order": item.sort_order,
                    "parent_task_id": item.parent_task_id,
                }),
            )?;
        }
    }
    Ok(())
}

pub fn duplicate(conn: &Connection, id: &str) -> Result<Task, AppError> {
    let original =
        get_by_id(conn, id)?.ok_or_else(|| AppError::NotFound(format!("Task {} not found", id)))?;

    let new_id = Uuid::new_v4().to_string();
    let new_title = format!("{} (copy)", original.title);
    let now = now_local();

    conn.execute(
        "UPDATE tasks SET sort_order = sort_order + 1 WHERE parent_task_id IS ?1",
        rusqlite::params![original.parent_task_id],
    )?;

    conn.execute(
        "INSERT INTO tasks (id, title, description, is_completed, priority, due_date,
         parent_task_id, sort_order, recurrence, created_at, updated_at)
         VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, 0, ?7, ?8, ?9)",
        rusqlite::params![
            new_id,
            new_title,
            original.description,
            original.priority,
            original.due_date,
            original.parent_task_id,
            original.recurrence,
            now,
            now,
        ],
    )?;

    // 复制标签关联
    for tid in &original.tag_ids {
        conn.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![new_id, tid],
        )?;
    }

    let children = get_children(conn, id)?;
    for (i, child) in children.iter().enumerate() {
        let child_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO tasks (id, title, description, is_completed, priority, due_date,
             parent_task_id, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                child_id,
                child.title,
                child.description,
                child.priority,
                child.due_date,
                new_id,
                i as i32,
                now,
                now,
            ],
        )?;
        for tid in &child.tag_ids {
            conn.execute(
                "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![child_id, tid],
            )?;
        }
    }

    let _ = reminder_repo::copy_reminders(conn, id, &new_id);

    let task = get_by_id(conn, &new_id)?
        .ok_or(AppError::Generic("Failed to duplicate task".to_string()))?;
    let _ = sync_repo::record_local_operation(
        conn,
        "task",
        &new_id,
        "create",
        json!({ "task": task }),
    )?;
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
            tag_ids: None,
            parent_task_id: parent,
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
            my_day_date: None,
            source: None,
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
                tag_ids: None,
                parent_task_id: None,
                reminder: None,
                recurrence: None,
                my_day_date: None,
                is_suspended: None,
                is_abandoned: None,
                is_pinned: None,
                status_event_source: None,
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
                    tag_ids: None,
                    is_completed: None,
                    due_date_from: None,
                    due_date_to: None,
                    search_query: None,
                    parent_task_id: None,
                    my_day_date: None,
                    priority: None,
                    is_suspended: None,
                    is_abandoned: None,
                    include_children: None,
                    include_archived: None,
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
                ReorderItem {
                    id: t3.id.clone(),
                    sort_order: 0,
                    parent_task_id: None,
                },
                ReorderItem {
                    id: t1.id.clone(),
                    sort_order: 1,
                    parent_task_id: None,
                },
                ReorderItem {
                    id: t2.id.clone(),
                    sort_order: 2,
                    parent_task_id: None,
                },
            ],
        )
        .unwrap();

        let all = get_all(
            &conn,
            TaskFilter {
                tag_ids: None,
                is_completed: None,
                due_date_from: None,
                due_date_to: None,
                search_query: None,
                parent_task_id: None,
                my_day_date: None,
                priority: None,
                is_suspended: None,
                is_abandoned: None,
                include_children: None,
                include_archived: None,
            },
        )
        .unwrap();
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

        let results = get_all(
            &conn,
            TaskFilter {
                tag_ids: None,
                is_completed: None,
                due_date_from: None,
                due_date_to: None,
                search_query: Some("Buy".to_string()),
                parent_task_id: None,
                my_day_date: None,
                priority: None,
                is_suspended: None,
                is_abandoned: None,
                include_children: None,
                include_archived: None,
            },
        )
        .unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_completed_filter() {
        let conn = setup();
        let t1 = create(&conn, create_req("Incomplete", None)).unwrap();
        create(&conn, create_req("Incomplete 2", None)).unwrap();
        update(
            &conn,
            &t1.id,
            UpdateTaskRequest {
                title: None,
                description: None,
                is_completed: Some(true),
                priority: None,
                due_date: None,
                tag_ids: None,
                parent_task_id: None,
                reminder: None,
                recurrence: None,
                my_day_date: None,
                is_suspended: None,
                is_abandoned: None,
                is_pinned: None,
                status_event_source: None,
            },
        )
        .unwrap();

        let completed = get_all(
            &conn,
            TaskFilter {
                tag_ids: None,
                is_completed: Some(true),
                due_date_from: None,
                due_date_to: None,
                search_query: None,
                parent_task_id: None,
                my_day_date: None,
                priority: None,
                is_suspended: None,
                is_abandoned: None,
                include_children: None,
                include_archived: None,
            },
        )
        .unwrap();
        assert_eq!(completed.len(), 1);
    }

    #[test]
    fn test_update_not_found() {
        let conn = setup();
        let result = update(
            &conn,
            "nonexistent",
            UpdateTaskRequest {
                title: Some("Nope".to_string()),
                description: None,
                is_completed: None,
                priority: None,
                due_date: None,
                tag_ids: None,
                parent_task_id: None,
                reminder: None,
                recurrence: None,
                my_day_date: None,
                is_suspended: None,
                is_abandoned: None,
                is_pinned: None,
                status_event_source: None,
            },
        );
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

    // ---------- 状态事件边界 ----------

    fn event_count(conn: &Connection, task_id: &str) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM task_state_events WHERE task_id = ?1",
            rusqlite::params![task_id],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn all_events(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM task_state_events", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn real_transitions_record_events_with_source() {
        let conn = setup();
        let task = create(&conn, create_req("事件任务", None)).unwrap();

        // 完成:1 条 complete 事件,来源 gui
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(event_count(&conn, &task.id), 1);
        let (transition, source): (String, String) = conn
            .query_row(
                "SELECT transition, source FROM task_state_events WHERE task_id = ?1",
                rusqlite::params![task.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(transition, "complete");
        assert_eq!(source, "gui");

        // 同状态重复写入:不新增事件
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(event_count(&conn, &task.id), 1);

        // 重新打开:reopen 事件
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_completed: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(event_count(&conn, &task.id), 2);

        // 普通字段编辑:不产生事件
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                title: Some("改标题".to_string()),
                priority: Some(3),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(event_count(&conn, &task.id), 2);

        // 挂起/恢复/放弃/恢复使用
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_suspended: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_suspended: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_abandoned: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_abandoned: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(event_count(&conn, &task.id), 6);
    }

    #[test]
    fn editing_completed_task_keeps_completed_at() {
        let conn = setup();
        let task = create(&conn, create_req("完成时间", None)).unwrap();
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let completed_at = history_repo::confirmed_completed_at(&conn, &task.id)
            .unwrap()
            .unwrap();

        // 完成后改标题/描述:完成时间不变(不随 updated_at 移动)
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                title: Some("完成后再编辑".to_string()),
                description: Some("x".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        let after = history_repo::confirmed_completed_at(&conn, &task.id)
            .unwrap()
            .unwrap();
        assert_eq!(completed_at, after);
    }

    #[test]
    fn event_write_failure_rolls_back_task_change() {
        let conn = setup();
        let task = create(&conn, create_req("回滚", None)).unwrap();
        // 注入事件写入失败:删除事件表
        conn.execute("DROP TABLE task_state_events", []).unwrap();

        let result = update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        );
        assert!(result.is_err());
        // 任务变化与事件共同回滚:任务仍未完成
        let reloaded = get_by_id(&conn, &task.id).unwrap().unwrap();
        assert!(!reloaded.is_completed);
    }

    #[test]
    fn retention_off_still_completes_without_events() {
        let conn = setup();
        crate::db::history_repo::set_retention(&conn, false).unwrap();
        let task = create(&conn, create_req("关闭留存", None)).unwrap();
        // 任务照常完成,只是没有事件
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let reloaded = get_by_id(&conn, &task.id).unwrap().unwrap();
        assert!(reloaded.is_completed);
        assert_eq!(all_events(&conn), 0);
        // 手写记录不受影响
        crate::db::progress_repo::create_progress_record(
            &conn,
            crate::models::progress::CreateProgressRequest {
                task_id: task.id.clone(),
                content: "照常记录".to_string(),
                record_date: chrono::Local::now().format("%Y-%m-%d").to_string(),
                operation_id: None,
            },
        )
        .unwrap();
    }

    #[test]
    fn recurrence_completion_records_event_for_original() {
        let conn = setup();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let task = create(
            &conn,
            CreateTaskRequest {
                title: "每日任务".to_string(),
                due_date: Some(today),
                recurrence: Some(r#"{"type":"daily","interval":1}"#.to_string()),
                ..create_req("每日任务", None)
            },
        )
        .unwrap();
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        // 原实例有完成事件
        assert_eq!(event_count(&conn, &task.id), 1);
        // 循环产生下一实例(新实例无事件)
        let instances: Vec<Task> = get_all(
            &conn,
            crate::models::task::TaskFilter {
                search_query: Some("每日任务".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(instances.len() >= 2);
    }

    #[test]
    fn delete_task_clears_record_bodies_keeps_events() {
        let conn = setup();
        let task = create(&conn, create_req("删除任务", None)).unwrap();
        let child = create(&conn, create_req("子任务", Some(task.id.clone()))).unwrap();
        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        crate::db::progress_repo::create_progress_record(
            &conn,
            crate::models::progress::CreateProgressRequest {
                task_id: task.id.clone(),
                content: "根的记录".to_string(),
                record_date: today.clone(),
                operation_id: None,
            },
        )
        .unwrap();
        crate::db::progress_repo::create_progress_record(
            &conn,
            crate::models::progress::CreateProgressRequest {
                task_id: child.id.clone(),
                content: "子的记录".to_string(),
                record_date: today,
                operation_id: None,
            },
        )
        .unwrap();

        delete(&conn, &task.id).unwrap();
        // 最小状态事实保留
        assert_eq!(event_count(&conn, &task.id), 1);
        // 手写正文清除
        let remaining_bodies: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM task_progress_records WHERE is_deleted = 0",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(remaining_bodies, 0);
    }

    #[test]
    fn subtask_event_snapshots_root() {
        let conn = setup();
        let root = create(&conn, create_req("根", None)).unwrap();
        let child = create(&conn, create_req("子", Some(root.id.clone()))).unwrap();
        update(
            &conn,
            &child.id,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let (root_id, title): (String, String) = conn
            .query_row(
                "SELECT root_task_id, title_snapshot FROM task_state_events WHERE task_id = ?1",
                rusqlite::params![child.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(root_id, root.id);
        assert_eq!(title, "子");
    }

    #[test]
    fn update_detail_reports_confirmed_completion() {
        let conn = setup();
        let task = create(&conn, create_req("详情完成时间", None)).unwrap();
        let detail = get_detail(&conn, &task.id).unwrap().unwrap();
        assert!(detail.completed_at.is_none());

        update(
            &conn,
            &task.id,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let detail = get_detail(&conn, &task.id).unwrap().unwrap();
        assert!(detail.completed_at.is_some());
    }
}
