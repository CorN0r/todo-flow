use rusqlite::Connection;

use crate::error::AppError;
use crate::models::task_note::TaskNote;

fn row_to_note(row: &rusqlite::Row) -> rusqlite::Result<TaskNote> {
    Ok(TaskNote {
        task_id: row.get("task_id")?,
        x: row.get("x")?,
        y: row.get("y")?,
        width: row.get("width")?,
        height: row.get("height")?,
        always_on_top: row.get("always_on_top")?,
        style: row.get("style")?,
        collapsed: row.get("collapsed")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

const SELECT_COLS: &str =
    "task_id, x, y, width, height, always_on_top, style, collapsed, created_at, updated_at";

/// 不存在时插入(皮肤用 default_style,其余按列默认值);已存在时保留原行(位置/皮肤等不变)。
pub fn upsert(conn: &Connection, task_id: &str, default_style: &str) -> Result<TaskNote, AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO task_notes (task_id, style) VALUES (?1, ?2)",
        rusqlite::params![task_id, default_style],
    )?;
    get(conn, task_id)?.ok_or_else(|| AppError::Generic("Failed to upsert task note".to_string()))
}

pub fn get(conn: &Connection, task_id: &str) -> Result<Option<TaskNote>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM task_notes WHERE task_id = ?1",
        SELECT_COLS
    ))?;
    let mut rows = stmt.query_map(rusqlite::params![task_id], row_to_note)?;
    Ok(rows.next().transpose()?)
}

pub fn get_all(conn: &Connection) -> Result<Vec<TaskNote>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM task_notes ORDER BY created_at ASC",
        SELECT_COLS
    ))?;
    let rows = stmt.query_map([], row_to_note)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn delete(conn: &Connection, task_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM task_notes WHERE task_id = ?1",
        rusqlite::params![task_id],
    )?;
    Ok(())
}

pub fn update_bounds(
    conn: &Connection,
    task_id: &str,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE task_notes SET x = ?1, y = ?2, width = ?3, height = ?4, updated_at = datetime('now','localtime') WHERE task_id = ?5",
        rusqlite::params![x, y, width, height, task_id],
    )?;
    Ok(())
}

/// 折叠态只持久化位置:窗口高被压成 36px,不能覆盖展开态宽高(供展开时恢复)。
pub fn update_position(conn: &Connection, task_id: &str, x: i32, y: i32) -> Result<(), AppError> {
    conn.execute(
        "UPDATE task_notes SET x = ?1, y = ?2, updated_at = datetime('now','localtime') WHERE task_id = ?3",
        rusqlite::params![x, y, task_id],
    )?;
    Ok(())
}

pub fn update_always_on_top(conn: &Connection, task_id: &str, on: bool) -> Result<(), AppError> {
    conn.execute(
        "UPDATE task_notes SET always_on_top = ?1, updated_at = datetime('now','localtime') WHERE task_id = ?2",
        rusqlite::params![on, task_id],
    )?;
    Ok(())
}

pub fn update_style(conn: &Connection, task_id: &str, style: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE task_notes SET style = ?1, updated_at = datetime('now','localtime') WHERE task_id = ?2",
        rusqlite::params![style, task_id],
    )?;
    Ok(())
}

pub fn update_collapsed(conn: &Connection, task_id: &str, collapsed: bool) -> Result<(), AppError> {
    conn.execute(
        "UPDATE task_notes SET collapsed = ?1, updated_at = datetime('now','localtime') WHERE task_id = ?2",
        rusqlite::params![collapsed, task_id],
    )?;
    Ok(())
}

pub fn count(conn: &Connection) -> Result<i64, AppError> {
    Ok(conn.query_row("SELECT COUNT(*) FROM task_notes", [], |row| {
        row.get(0)
    })?)
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

    fn insert_task(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO tasks (id, title, created_at, updated_at) VALUES (?1, ?2, '2026-08-09 00:00:00', '2026-08-09 00:00:00')",
            rusqlite::params![id, format!("Task {}", id)],
        )
        .unwrap();
    }

    #[test]
    fn test_upsert_creates_default_row() {
        let conn = setup();
        insert_task(&conn, "t1");
        let note = upsert(&conn, "t1", "glass").unwrap();
        assert_eq!(note.task_id, "t1");
        assert_eq!(note.x, None);
        assert_eq!(note.y, None);
        assert_eq!(note.width, 280);
        assert_eq!(note.height, 300);
        assert!(!note.always_on_top);
        assert_eq!(note.style, "glass");
        assert!(!note.collapsed);
    }

    #[test]
    fn test_upsert_preserves_existing_row() {
        let conn = setup();
        insert_task(&conn, "t1");
        upsert(&conn, "t1", "glass").unwrap();
        update_bounds(&conn, "t1", 100, 200, 320, 360).unwrap();
        update_style(&conn, "t1", "minimal").unwrap();

        let note = upsert(&conn, "t1", "glass").unwrap();
        assert_eq!(note.x, Some(100));
        assert_eq!(note.y, Some(200));
        assert_eq!(note.width, 320);
        assert_eq!(note.height, 360);
        assert_eq!(note.style, "minimal");
        assert_eq!(count(&conn).unwrap(), 1);
    }

    #[test]
    fn test_get_and_get_all() {
        let conn = setup();
        insert_task(&conn, "t1");
        insert_task(&conn, "t2");
        upsert(&conn, "t1", "glass").unwrap();
        upsert(&conn, "t2", "glass").unwrap();

        assert!(get(&conn, "t1").unwrap().is_some());
        assert!(get(&conn, "missing").unwrap().is_none());

        let all = get_all(&conn).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].task_id, "t1");
        assert_eq!(all[1].task_id, "t2");
    }

    #[test]
    fn test_update_bounds_and_always_on_top() {
        let conn = setup();
        insert_task(&conn, "t1");
        upsert(&conn, "t1", "glass").unwrap();

        update_bounds(&conn, "t1", 10, 20, 300, 400).unwrap();
        update_always_on_top(&conn, "t1", true).unwrap();

        let note = get(&conn, "t1").unwrap().unwrap();
        assert_eq!(note.x, Some(10));
        assert_eq!(note.y, Some(20));
        assert_eq!(note.width, 300);
        assert_eq!(note.height, 400);
        assert!(note.always_on_top);
    }

    #[test]
    fn test_update_style() {
        let conn = setup();
        insert_task(&conn, "t1");
        upsert(&conn, "t1", "glass").unwrap();
        update_style(&conn, "t1", "paper").unwrap();
        assert_eq!(get(&conn, "t1").unwrap().unwrap().style, "paper");
    }

    #[test]
    fn test_update_collapsed() {
        let conn = setup();
        insert_task(&conn, "t1");
        upsert(&conn, "t1", "glass").unwrap();
        assert!(!get(&conn, "t1").unwrap().unwrap().collapsed);

        update_collapsed(&conn, "t1", true).unwrap();
        assert!(get(&conn, "t1").unwrap().unwrap().collapsed);
        update_collapsed(&conn, "t1", false).unwrap();
        assert!(!get(&conn, "t1").unwrap().unwrap().collapsed);
    }

    #[test]
    fn test_update_position_preserves_size() {
        let conn = setup();
        insert_task(&conn, "t1");
        upsert(&conn, "t1", "glass").unwrap();
        update_bounds(&conn, "t1", 10, 20, 300, 400).unwrap();

        update_position(&conn, "t1", 50, 60).unwrap();
        let note = get(&conn, "t1").unwrap().unwrap();
        assert_eq!(note.x, Some(50));
        assert_eq!(note.y, Some(60));
        assert_eq!(note.width, 300);
        assert_eq!(note.height, 400);
    }

    #[test]
    fn test_delete() {
        let conn = setup();
        insert_task(&conn, "t1");
        upsert(&conn, "t1", "glass").unwrap();
        delete(&conn, "t1").unwrap();
        assert!(get(&conn, "t1").unwrap().is_none());
        assert_eq!(count(&conn).unwrap(), 0);
    }

    #[test]
    fn test_task_delete_cascades() {
        let conn = setup();
        insert_task(&conn, "t1");
        upsert(&conn, "t1", "glass").unwrap();
        conn.execute("DELETE FROM tasks WHERE id = 't1'", []).unwrap();
        assert!(get(&conn, "t1").unwrap().is_none());
    }

    #[test]
    fn test_count() {
        let conn = setup();
        for i in 0..3 {
            let id = format!("t{}", i);
            insert_task(&conn, &id);
            upsert(&conn, &id, "glass").unwrap();
        }
        assert_eq!(count(&conn).unwrap(), 3);
    }
}
