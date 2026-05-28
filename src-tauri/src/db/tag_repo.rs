use rusqlite::Connection;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::tag::{CreateTagRequest, TagWithCount, ReorderTagsItem, Tag, UpdateTagRequest};

const TAG_COLOR_PALETTE: &[&str] = &[
    "#7C72F6", "#3B82F6", "#EF4444", "#F59E0B", "#10B981",
    "#EC4899", "#06B6D4", "#F97316", "#8B5CF6", "#14B8A6",
    "#E11D48", "#6366F1", "#84CC16", "#D946EF", "#0EA5E9",
];

fn pick_auto_color(conn: &Connection) -> String {
    let existing: Vec<String> = conn
        .prepare("SELECT DISTINCT color FROM tags")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    for c in TAG_COLOR_PALETTE {
        if !existing.iter().any(|e| e.eq_ignore_ascii_case(c)) {
            return c.to_string();
        }
    }

    TAG_COLOR_PALETTE[existing.len() % TAG_COLOR_PALETTE.len()].to_string()
}

fn row_to_tag(row: &rusqlite::Row) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        icon: row.get("icon")?,
        sort_order: row.get("sort_order")?,
        parent_tag_id: row.get("parent_tag_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn create(conn: &Connection, req: CreateTagRequest) -> Result<Tag, AppError> {
    let name = req.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation("Tag name cannot be empty".to_string()));
    }

    let id = Uuid::new_v4().to_string();
    let color = req.color.unwrap_or_else(|| pick_auto_color(conn));
    let icon = req.icon.unwrap_or_else(|| "tag".to_string());

    let max_order: i32 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM tags", [], |row| {
            row.get(0)
        })?;

    conn.execute(
        "INSERT INTO tags (id, name, color, icon, sort_order, parent_tag_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, name, color, icon, max_order + 1, req.parent_tag_id],
    )?;

    get_by_id(conn, &id)?.ok_or(AppError::Generic("Failed to create tag".to_string()))
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Tag>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, icon, sort_order, parent_tag_id, created_at, updated_at FROM tags WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(rusqlite::params![id], row_to_tag)?;
    Ok(rows.next().transpose()?)
}

pub fn get_all_with_counts(conn: &Connection) -> Result<Vec<TagWithCount>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, t.icon, t.sort_order, t.parent_tag_id, t.created_at, t.updated_at,
                COUNT(CASE WHEN tk.is_archived = 0 THEN tk.id END) as task_count,
                SUM(CASE WHEN tk.is_completed = 0 AND tk.is_archived = 0 AND tk.parent_task_id IS NULL THEN 1 ELSE 0 END) as incomplete_count
         FROM tags t
         LEFT JOIN tasks tk ON tk.tag_id = t.id
         GROUP BY t.id
         ORDER BY t.sort_order ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TagWithCount {
            id: row.get("id")?,
            name: row.get("name")?,
            color: row.get("color")?,
            icon: row.get("icon")?,
            sort_order: row.get("sort_order")?,
            parent_tag_id: row.get("parent_tag_id")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            task_count: row.get("task_count")?,
            incomplete_count: row.get("incomplete_count")?,
            children: Vec::new(),
        })
    })?;
    let tags: Vec<TagWithCount> = rows.collect::<Result<Vec<_>, _>>()?;

    // Build tree: root tags get children, nested tags go under their parent
    let mut roots: Vec<TagWithCount> = Vec::new();
    let mut child_map: std::collections::HashMap<String, Vec<TagWithCount>> = std::collections::HashMap::new();

    for tag in tags {
        match &tag.parent_tag_id {
            Some(pid) if !pid.is_empty() => {
                child_map.entry(pid.clone()).or_default().push(tag);
            }
            _ => roots.push(tag),
        }
    }

    fn attach_children(tags: &mut Vec<TagWithCount>, child_map: &mut std::collections::HashMap<String, Vec<TagWithCount>>) {
        for tag in tags.iter_mut() {
            if let Some(children) = child_map.remove(&tag.id) {
                tag.children = children;
                attach_children(&mut tag.children, child_map);
            }
        }
    }

    attach_children(&mut roots, &mut child_map);
    Ok(roots)
}

pub fn update(conn: &Connection, id: &str, req: UpdateTagRequest) -> Result<Tag, AppError> {
    let existing = get_by_id(conn, id)?.ok_or_else(|| AppError::NotFound(format!("Tag {} not found", id)))?;

    let name = match req.name {
        Some(n) => {
            let trimmed = n.trim().to_string();
            if trimmed.is_empty() {
                return Err(AppError::Validation("Tag name cannot be empty".to_string()));
            }
            trimmed
        }
        None => existing.name,
    };
    let color = req.color.unwrap_or(existing.color);
    let icon = req.icon.unwrap_or(existing.icon);
    let parent_tag_id = match req.parent_tag_id {
        Some(v) => v,
        None => existing.parent_tag_id,
    };

    conn.execute(
        "UPDATE tags SET name = ?1, color = ?2, icon = ?3, parent_tag_id = ?4, updated_at = datetime('now') WHERE id = ?5",
        rusqlite::params![name, color, icon, parent_tag_id, id],
    )?;

    get_by_id(conn, id)?.ok_or(AppError::Generic("Failed to update tag".to_string()))
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM tags WHERE id = ?1", rusqlite::params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Tag {} not found", id)));
    }
    Ok(())
}

pub fn reorder(conn: &Connection, items: Vec<ReorderTagsItem>) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    for item in &items {
        tx.execute(
            "UPDATE tags SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![item.sort_order, item.id],
        )?;
    }
    tx.commit()?;
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

    fn create_req(name: &str) -> CreateTagRequest {
        CreateTagRequest { name: name.to_string(), color: None, icon: None, parent_tag_id: None }
    }

    #[test]
    fn test_create_and_retrieve() {
        let conn = setup();
        let tag = create(&conn, create_req("Work")).unwrap();
        assert_eq!(tag.name, "Work");
        assert_eq!(tag.color, "#7C72F6"); // first palette color

        let fetched = get_by_id(&conn, &tag.id).unwrap().unwrap();
        assert_eq!(fetched.name, "Work");
    }

    #[test]
    fn test_empty_name_rejected() {
        let conn = setup();
        let result = create(&conn, create_req("   "));
        assert!(result.is_err());
    }

    #[test]
    fn test_get_all_with_counts() {
        let conn = setup();
        create(&conn, create_req("Personal")).unwrap();
        create(&conn, create_req("Work")).unwrap();

        let tags = get_all_with_counts(&conn).unwrap();
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0].task_count, 0);
    }

    #[test]
    fn test_update_tag() {
        let conn = setup();
        let tag = create(&conn, create_req("Old Name")).unwrap();

        let updated = update(&conn, &tag.id, UpdateTagRequest {
            name: Some("New Name".to_string()),
            color: Some("#ff0000".to_string()),
            icon: None,
            parent_tag_id: None,
        }).unwrap();
        assert_eq!(updated.name, "New Name");
        assert_eq!(updated.color, "#ff0000");
    }

    #[test]
    fn test_delete_tag() {
        let conn = setup();
        let tag = create(&conn, create_req("To Delete")).unwrap();
        delete(&conn, &tag.id).unwrap();
        assert!(get_by_id(&conn, &tag.id).unwrap().is_none());
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
        let result = update(&conn, "nonexistent", UpdateTagRequest {
            name: None, color: None, icon: None, parent_tag_id: None,
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_reorder_tags() {
        let conn = setup();
        let t1 = create(&conn, create_req("First")).unwrap();
        let t2 = create(&conn, create_req("Second")).unwrap();

        reorder(&conn, vec![
            ReorderTagsItem { id: t2.id.clone(), sort_order: 0 },
            ReorderTagsItem { id: t1.id.clone(), sort_order: 1 },
        ]).unwrap();

        let tags = get_all_with_counts(&conn).unwrap();
        assert_eq!(tags[0].id, t2.id);
        assert_eq!(tags[1].id, t1.id);
    }
}
