use rusqlite::Connection;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::attachment::Attachment;

fn row_to_attachment(row: &rusqlite::Row) -> rusqlite::Result<Attachment> {
    Ok(Attachment {
        id: row.get("id")?,
        task_id: row.get("task_id")?,
        original_name: row.get("original_name")?,
        storage_name: row.get("storage_name")?,
        mime_type: row.get("mime_type")?,
        file_size: row.get("file_size")?,
        thumbnail_name: row.get("thumbnail_name")?,
        created_at: row.get("created_at")?,
    })
}

pub fn create(
    conn: &Connection,
    task_id: &str,
    original_name: &str,
    storage_name: &str,
    mime_type: &str,
    file_size: i64,
    thumbnail_name: Option<&str>,
) -> Result<Attachment, AppError> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO attachments (id, task_id, original_name, storage_name, mime_type, file_size, thumbnail_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            id,
            task_id,
            original_name,
            storage_name,
            mime_type,
            file_size,
            thumbnail_name,
        ],
    )?;
    get_by_id(conn, &id)?.ok_or(AppError::Generic("Failed to create attachment".to_string()))
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Attachment>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, original_name, storage_name, mime_type, file_size, thumbnail_name, created_at
         FROM attachments WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(rusqlite::params![id], row_to_attachment)?;
    Ok(rows.next().transpose()?)
}

pub fn get_by_task(conn: &Connection, task_id: &str) -> Result<Vec<Attachment>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, original_name, storage_name, mime_type, file_size, thumbnail_name, created_at
         FROM attachments WHERE task_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(rusqlite::params![task_id], row_to_attachment)?;
    let result: Result<Vec<_>, _> = rows.collect();
    Ok(result?)
}

pub fn delete(conn: &Connection, id: &str) -> Result<Attachment, AppError> {
    let attachment = get_by_id(conn, id)?
        .ok_or_else(|| AppError::NotFound(format!("Attachment {} not found", id)))?;
    conn.execute("DELETE FROM attachments WHERE id = ?1", rusqlite::params![id])?;
    Ok(attachment)
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
        // Need a task row since attachments reference tasks
        conn.execute(
            "INSERT INTO tasks (id, title) VALUES ('task-1', 'Test Task')",
            [],
        ).unwrap();
        conn
    }

    #[test]
    fn test_create_attachment() {
        let conn = setup();
        let att = create(
            &conn, "task-1", "photo.png", "abc123.png",
            "image/png", 1024, None,
        ).unwrap();
        assert_eq!(att.original_name, "photo.png");
        assert_eq!(att.file_size, 1024);
        assert_eq!(att.task_id, "task-1");
    }

    #[test]
    fn test_get_by_task() {
        let conn = setup();
        create(&conn, "task-1", "a.png", "s1.png", "image/png", 100, None).unwrap();
        create(&conn, "task-1", "b.png", "s2.png", "image/png", 200, None).unwrap();

        let atts = get_by_task(&conn, "task-1").unwrap();
        assert_eq!(atts.len(), 2);
    }

    #[test]
    fn test_get_by_task_empty() {
        let conn = setup();
        let atts = get_by_task(&conn, "task-1").unwrap();
        assert!(atts.is_empty());
    }

    #[test]
    fn test_delete_attachment() {
        let conn = setup();
        let att = create(&conn, "task-1", "x.png", "sx.png", "image/png", 50, None).unwrap();
        let deleted = delete(&conn, &att.id).unwrap();
        assert_eq!(deleted.id, att.id);
        assert!(get_by_id(&conn, &att.id).unwrap().is_none());
    }

    #[test]
    fn test_delete_not_found() {
        let conn = setup();
        let result = delete(&conn, "nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_get_file_path() {
        let conn = setup();
        let att = create(&conn, "task-1", "doc.pdf", "stored.pdf", "application/pdf", 500, None).unwrap();
        let data_dir = std::path::PathBuf::from("/tmp/test-todoflow");
        let path = get_file_path(&conn, &att.id, &data_dir).unwrap();
        assert!(path.contains("stored.pdf"));
        assert!(path.contains("task-1"));
    }
}

pub fn get_file_path(
    conn: &Connection,
    attachment_id: &str,
    data_dir: &std::path::Path,
) -> Result<String, AppError> {
    let attachment = get_by_id(conn, attachment_id)?
        .ok_or_else(|| AppError::NotFound(format!("Attachment {} not found", attachment_id)))?;
    let file_path = data_dir
        .join("attachments")
        .join(&attachment.task_id)
        .join(&attachment.storage_name);
    Ok(file_path.to_string_lossy().to_string())
}
