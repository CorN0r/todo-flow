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

    fn create_req(name: &str) -> CreateListRequest {
        CreateListRequest { name: name.to_string(), color: None, icon: None }
    }

    #[test]
    fn test_create_and_retrieve() {
        let conn = setup();
        let list = create(&conn, create_req("Work")).unwrap();
        assert_eq!(list.name, "Work");
        assert_eq!(list.color, "#6366f1");

        let fetched = get_by_id(&conn, &list.id).unwrap().unwrap();
        assert_eq!(fetched.name, "Work");
    }

    #[test]
    fn test_get_all_with_counts() {
        let conn = setup();
        create(&conn, create_req("Personal")).unwrap();
        create(&conn, create_req("Work")).unwrap();

        let lists = get_all_with_counts(&conn).unwrap();
        assert_eq!(lists.len(), 2);
        assert_eq!(lists[0].task_count, 0);
    }

    #[test]
    fn test_update_list() {
        let conn = setup();
        let list = create(&conn, create_req("Old Name")).unwrap();

        let updated = update(&conn, &list.id, UpdateListRequest {
            name: Some("New Name".to_string()),
            color: Some("#ff0000".to_string()),
            icon: None,
        }).unwrap();
        assert_eq!(updated.name, "New Name");
        assert_eq!(updated.color, "#ff0000");
    }

    #[test]
    fn test_delete_list() {
        let conn = setup();
        let list = create(&conn, create_req("To Delete")).unwrap();
        delete(&conn, &list.id).unwrap();
        assert!(get_by_id(&conn, &list.id).unwrap().is_none());
    }

    #[test]
    fn test_delete_not_found() {
        let conn = setup();
        let result = delete(&conn, "nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_update_not_found() {
        let conn = setup();
        let result = update(&conn, "nonexistent", UpdateListRequest {
            name: None, color: None, icon: None,
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_reorder_lists() {
        let conn = setup();
        let l1 = create(&conn, create_req("First")).unwrap();
        let l2 = create(&conn, create_req("Second")).unwrap();

        reorder(&conn, vec![
            ReorderListsItem { id: l2.id.clone(), sort_order: 0 },
            ReorderListsItem { id: l1.id.clone(), sort_order: 1 },
        ]).unwrap();

        let lists = get_all_with_counts(&conn).unwrap();
        assert_eq!(lists[0].id, l2.id);
        assert_eq!(lists[1].id, l1.id);
    }
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
