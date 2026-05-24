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
