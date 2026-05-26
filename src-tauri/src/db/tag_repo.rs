use rusqlite::Connection;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::task::Tag;

pub fn get_all(conn: &Connection) -> Result<Vec<Tag>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, COUNT(tt.task_id) as task_count
         FROM tags t LEFT JOIN task_tags tt ON t.id = tt.tag_id
         GROUP BY t.id ORDER BY t.name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            task_count: Some(row.get::<_, i32>(3)?),
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create(conn: &Connection, name: String, color: String) -> Result<Tag, AppError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation("Tag name cannot be empty".to_string()));
    }
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, name, color],
    )?;
    Ok(Tag { id, name, color, task_count: Some(0) })
}

pub fn update(conn: &Connection, id: &str, name: Option<String>, color: Option<String>) -> Result<Tag, AppError> {
    let existing = conn.query_row(
        "SELECT id, name, color FROM tags WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            task_count: None,
        }),
    ).map_err(|_| AppError::NotFound(format!("Tag {} not found", id)))?;

    let name = name.unwrap_or(existing.name);
    if name.trim().is_empty() {
        return Err(AppError::Validation("Tag name cannot be empty".to_string()));
    }
    let color = color.unwrap_or(existing.color);

    conn.execute(
        "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
        rusqlite::params![name, color, id],
    )?;
    Ok(Tag { id: id.to_string(), name, color, task_count: None })
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
    fn test_create_tag() {
        let conn = setup();
        let tag = create(&conn, "urgent".to_string(), "#ef4444".to_string()).unwrap();
        assert_eq!(tag.name, "urgent");
        assert_eq!(tag.color, "#ef4444");
        assert_eq!(tag.task_count, Some(0));
    }

    #[test]
    fn test_create_empty_name_rejected() {
        let conn = setup();
        let result = create(&conn, "  ".to_string(), "#ef4444".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_get_all_tags() {
        let conn = setup();
        create(&conn, "tag-a".to_string(), "#111".to_string()).unwrap();
        create(&conn, "tag-b".to_string(), "#222".to_string()).unwrap();

        let tags = get_all(&conn).unwrap();
        assert_eq!(tags.len(), 2);
    }

    #[test]
    fn test_update_tag() {
        let conn = setup();
        let tag = create(&conn, "old".to_string(), "#333".to_string()).unwrap();

        let updated = update(&conn, &tag.id, Some("new".to_string()), None).unwrap();
        assert_eq!(updated.name, "new");
        assert_eq!(updated.color, "#333");
    }

    #[test]
    fn test_delete_tag() {
        let conn = setup();
        let tag = create(&conn, "temp".to_string(), "#444".to_string()).unwrap();
        delete(&conn, &tag.id).unwrap();
        assert_eq!(get_all(&conn).unwrap().len(), 0);
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
        let result = update(&conn, "nonexistent", Some("nope".to_string()), None);
        assert!(result.is_err());
    }

    #[test]
    fn test_tags_alphabetical_order() {
        let conn = setup();
        create(&conn, "zulu".to_string(), "#111".to_string()).unwrap();
        create(&conn, "alpha".to_string(), "#222".to_string()).unwrap();
        create(&conn, "mike".to_string(), "#333".to_string()).unwrap();

        let tags = get_all(&conn).unwrap();
        assert_eq!(tags[0].name, "alpha");
        assert_eq!(tags[1].name, "mike");
        assert_eq!(tags[2].name, "zulu");
    }
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM task_tags WHERE tag_id = ?1", rusqlite::params![id])?;
    let affected = conn.execute("DELETE FROM tags WHERE id = ?1", rusqlite::params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Tag {} not found", id)));
    }
    Ok(())
}
