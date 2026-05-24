use rusqlite::Connection;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::list::{CreateListRequest, ListWithCount, ReorderListsItem, TodoList, UpdateListRequest};

fn row_to_list(row: &rusqlite::Row) -> rusqlite::Result<TodoList> {
    Ok(TodoList {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        icon: row.get("icon")?,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn create(conn: &Connection, req: CreateListRequest) -> Result<TodoList, AppError> {
    let id = Uuid::new_v4().to_string();
    let color = req.color.unwrap_or_else(|| "#6366f1".to_string());
    let icon = req.icon.unwrap_or_else(|| "list".to_string());

    let max_order: i32 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM lists", [], |row| {
            row.get(0)
        })?;

    conn.execute(
        "INSERT INTO lists (id, name, color, icon, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, req.name, color, icon, max_order + 1],
    )?;

    get_by_id(conn, &id)?.ok_or(AppError::Generic("Failed to create list".to_string()))
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<TodoList>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, icon, sort_order, created_at, updated_at FROM lists WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(rusqlite::params![id], row_to_list)?;
    Ok(rows.next().transpose()?)
}

pub fn get_all_with_counts(conn: &Connection) -> Result<Vec<ListWithCount>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT l.id, l.name, l.color, l.icon, l.sort_order, l.created_at, l.updated_at,
                COUNT(t.id) as task_count,
                SUM(CASE WHEN t.is_completed = 0 AND t.parent_task_id IS NULL THEN 1 ELSE 0 END) as incomplete_count
         FROM lists l
         LEFT JOIN tasks t ON t.list_id = l.id
         GROUP BY l.id
         ORDER BY l.sort_order ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ListWithCount {
            id: row.get("id")?,
            name: row.get("name")?,
            color: row.get("color")?,
            icon: row.get("icon")?,
            sort_order: row.get("sort_order")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            task_count: row.get("task_count")?,
            incomplete_count: row.get("incomplete_count")?,
        })
    })?;
    let result: Result<Vec<_>, _> = rows.collect();
    Ok(result?)
}

pub fn update(conn: &Connection, id: &str, req: UpdateListRequest) -> Result<TodoList, AppError> {
    let existing = get_by_id(conn, id)?.ok_or_else(|| AppError::NotFound(format!("List {} not found", id)))?;

    let name = req.name.unwrap_or(existing.name);
    let color = req.color.unwrap_or(existing.color);
    let icon = req.icon.unwrap_or(existing.icon);

    conn.execute(
        "UPDATE lists SET name = ?1, color = ?2, icon = ?3, updated_at = datetime('now') WHERE id = ?4",
        rusqlite::params![name, color, icon, id],
    )?;

    get_by_id(conn, id)?.ok_or(AppError::Generic("Failed to update list".to_string()))
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM lists WHERE id = ?1", rusqlite::params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("List {} not found", id)));
    }
    Ok(())
}

pub fn reorder(conn: &Connection, items: Vec<ReorderListsItem>) -> Result<(), AppError> {
    for item in &items {
        conn.execute(
            "UPDATE lists SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![item.sort_order, item.id],
        )?;
    }
    Ok(())
}
