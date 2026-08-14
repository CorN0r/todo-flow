use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::sync::{
    CreateSyncConflictRequest, CreateSyncOperationRequest, SyncConflict, SyncMetaEntry,
    SyncOperation,
};

fn now_local() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn validate_entity_type(entity_type: &str) -> Result<(), AppError> {
    match entity_type {
        "task" | "task_reminder" | "tag" | "attachment" | "habit" | "habit_log" | "setting" => {
            Ok(())
        }
        _ => Err(AppError::Validation(format!(
            "Unsupported sync entity type: {}",
            entity_type
        ))),
    }
}

fn validate_operation(operation: &str) -> Result<(), AppError> {
    match operation {
        "create" | "update" | "reorder" | "delete" => Ok(()),
        _ => Err(AppError::Validation(format!(
            "Unsupported sync operation: {}",
            operation
        ))),
    }
}

fn validate_status(status: &str) -> Result<(), AppError> {
    match status {
        "pending" | "syncing" | "acked" | "failed" => Ok(()),
        _ => Err(AppError::Validation(format!(
            "Unsupported sync operation status: {}",
            status
        ))),
    }
}

fn entity_table(entity_type: &str) -> Option<(&'static str, &'static str)> {
    match entity_type {
        "task" => Some(("tasks", "id")),
        "task_reminder" => Some(("task_reminders", "id")),
        "tag" => Some(("tags", "id")),
        "attachment" => Some(("attachments", "id")),
        "habit" => Some(("habits", "id")),
        "habit_log" => Some(("habit_logs", "id")),
        "setting" => Some(("settings", "key")),
        _ => None,
    }
}

fn row_to_operation(row: &rusqlite::Row) -> rusqlite::Result<SyncOperation> {
    let payload: String = row.get("payload")?;
    Ok(SyncOperation {
        op_id: row.get("op_id")?,
        entity_type: row.get("entity_type")?,
        entity_id: row.get("entity_id")?,
        operation: row.get("operation")?,
        base_revision: row.get("base_revision")?,
        payload: serde_json::from_str(&payload).unwrap_or(Value::Null),
        client_time: row.get("client_time")?,
        device_id: row.get("device_id")?,
        status: row.get("status")?,
        retry_count: row.get("retry_count")?,
        last_error: row.get("last_error")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_conflict(row: &rusqlite::Row) -> rusqlite::Result<SyncConflict> {
    let local_payload: String = row.get("local_payload")?;
    let remote_payload: String = row.get("remote_payload")?;
    Ok(SyncConflict {
        id: row.get("id")?,
        entity_type: row.get("entity_type")?,
        entity_id: row.get("entity_id")?,
        local_payload: serde_json::from_str(&local_payload).unwrap_or(Value::Null),
        remote_payload: serde_json::from_str(&remote_payload).unwrap_or(Value::Null),
        created_at: row.get("created_at")?,
        resolved_at: row.get("resolved_at")?,
    })
}

pub fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
    Ok(conn
        .query_row(
            "SELECT value FROM sync_meta WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?)
}

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn list_meta(conn: &Connection) -> Result<Vec<SyncMetaEntry>, AppError> {
    let mut stmt = conn.prepare("SELECT key, value FROM sync_meta ORDER BY key ASC")?;
    let rows = stmt.query_map([], |row| {
        Ok(SyncMetaEntry {
            key: row.get(0)?,
            value: row.get(1)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn is_sync_enabled(conn: &Connection) -> Result<bool, AppError> {
    if let Some(value) = get_meta(conn, "sync_enabled")? {
        return Ok(value == "1" || value.eq_ignore_ascii_case("true"));
    }
    let setting: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'sync_enabled'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(setting
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false))
}

pub fn is_syncable_setting_key(key: &str) -> bool {
    matches!(key, "theme" | "language")
}

pub fn set_entity_sync_pending(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    device_id: &str,
    operation: &str,
) -> Result<(), AppError> {
    validate_entity_type(entity_type)?;
    if let Some((table, pk)) = entity_table(entity_type) {
        let status = if operation == "delete" {
            "deleted"
        } else {
            "pending"
        };
        let sql = if operation == "delete" {
            format!(
                "UPDATE {} SET deleted_at = COALESCE(deleted_at, ?1), local_revision = local_revision + 1, last_modified_device_id = ?2, sync_status = ?3 WHERE {} = ?4",
                table, pk
            )
        } else {
            format!(
                "UPDATE {} SET local_revision = local_revision + 1, last_modified_device_id = ?1, sync_status = ?2 WHERE {} = ?3",
                table, pk
            )
        };
        if operation == "delete" {
            conn.execute(&sql, params![now_local(), device_id, status, entity_id])?;
        } else {
            conn.execute(&sql, params![device_id, status, entity_id])?;
        }
    }
    Ok(())
}

pub fn record_operation(
    conn: &Connection,
    req: CreateSyncOperationRequest,
) -> Result<SyncOperation, AppError> {
    validate_entity_type(&req.entity_type)?;
    validate_operation(&req.operation)?;

    let op_id = req.op_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let client_time = req.client_time.unwrap_or_else(now_local);
    let created_at = now_local();
    let payload = serde_json::to_string(&req.payload)
        .map_err(|e| AppError::Generic(format!("Failed to serialize sync payload: {}", e)))?;

    conn.execute(
        "INSERT INTO sync_operations (
            op_id, entity_type, entity_id, operation, base_revision, payload,
            client_time, device_id, status, retry_count, last_error, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', 0, NULL, ?9, ?9)",
        params![
            op_id,
            req.entity_type,
            req.entity_id,
            req.operation,
            req.base_revision,
            payload,
            client_time,
            req.device_id,
            created_at,
        ],
    )?;

    get_operation(conn, &op_id)?
        .ok_or_else(|| AppError::Generic("Failed to record sync operation".to_string()))
}

pub fn record_local_operation(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    operation: &str,
    payload: Value,
) -> Result<Option<SyncOperation>, AppError> {
    if !is_sync_enabled(conn)? {
        return Ok(None);
    }

    let device_id = get_meta(conn, "device_id")?.unwrap_or_else(|| "local-desktop".to_string());
    set_entity_sync_pending(conn, entity_type, entity_id, &device_id, operation)?;
    let op = record_operation(
        conn,
        CreateSyncOperationRequest {
            op_id: None,
            entity_type: entity_type.to_string(),
            entity_id: entity_id.to_string(),
            operation: operation.to_string(),
            base_revision: None,
            payload,
            client_time: None,
            device_id,
        },
    )?;
    Ok(Some(op))
}

pub fn get_operation(conn: &Connection, op_id: &str) -> Result<Option<SyncOperation>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT op_id, entity_type, entity_id, operation, base_revision, payload, client_time,
                device_id, status, retry_count, last_error, created_at, updated_at
         FROM sync_operations WHERE op_id = ?1",
    )?;
    Ok(stmt
        .query_row(params![op_id], row_to_operation)
        .optional()?)
}

pub fn list_operations(
    conn: &Connection,
    status: Option<&str>,
) -> Result<Vec<SyncOperation>, AppError> {
    if let Some(status) = status {
        validate_status(status)?;
        let mut stmt = conn.prepare(
            "SELECT op_id, entity_type, entity_id, operation, base_revision, payload, client_time,
                    device_id, status, retry_count, last_error, created_at, updated_at
             FROM sync_operations WHERE status = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![status], row_to_operation)?;
        return Ok(rows.collect::<Result<Vec<_>, _>>()?);
    }

    let mut stmt = conn.prepare(
        "SELECT op_id, entity_type, entity_id, operation, base_revision, payload, client_time,
                device_id, status, retry_count, last_error, created_at, updated_at
         FROM sync_operations ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], row_to_operation)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn mark_operation_status(
    conn: &Connection,
    op_id: &str,
    status: &str,
    last_error: Option<&str>,
) -> Result<SyncOperation, AppError> {
    validate_status(status)?;
    let now = now_local();
    let affected = conn.execute(
        "UPDATE sync_operations SET status = ?1, last_error = ?2, updated_at = ?3 WHERE op_id = ?4",
        params![status, last_error, now, op_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!(
            "Sync operation {} not found",
            op_id
        )));
    }
    get_operation(conn, op_id)?
        .ok_or_else(|| AppError::Generic("Failed to update sync operation".to_string()))
}

pub fn increment_retry(
    conn: &Connection,
    op_id: &str,
    last_error: &str,
) -> Result<SyncOperation, AppError> {
    let now = now_local();
    let affected = conn.execute(
        "UPDATE sync_operations
         SET retry_count = retry_count + 1, status = 'failed', last_error = ?1, updated_at = ?2
         WHERE op_id = ?3",
        params![last_error, now, op_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!(
            "Sync operation {} not found",
            op_id
        )));
    }
    get_operation(conn, op_id)?
        .ok_or_else(|| AppError::Generic("Failed to increment sync retry".to_string()))
}

pub fn save_conflict(
    conn: &Connection,
    req: CreateSyncConflictRequest,
) -> Result<SyncConflict, AppError> {
    validate_entity_type(&req.entity_type)?;
    let id = req.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let created_at = req.created_at.unwrap_or_else(now_local);
    let local_payload = serde_json::to_string(&req.local_payload).map_err(|e| {
        AppError::Generic(format!("Failed to serialize local conflict payload: {}", e))
    })?;
    let remote_payload = serde_json::to_string(&req.remote_payload).map_err(|e| {
        AppError::Generic(format!(
            "Failed to serialize remote conflict payload: {}",
            e
        ))
    })?;

    conn.execute(
        "INSERT INTO sync_conflicts (id, entity_type, entity_id, local_payload, remote_payload, created_at, resolved_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
        params![id, req.entity_type, req.entity_id, local_payload, remote_payload, created_at],
    )?;
    get_conflict(conn, &id)?
        .ok_or_else(|| AppError::Generic("Failed to save sync conflict".to_string()))
}

pub fn get_conflict(conn: &Connection, id: &str) -> Result<Option<SyncConflict>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, entity_type, entity_id, local_payload, remote_payload, created_at, resolved_at
         FROM sync_conflicts WHERE id = ?1",
    )?;
    Ok(stmt.query_row(params![id], row_to_conflict).optional()?)
}

pub fn list_conflicts(
    conn: &Connection,
    entity_type: Option<&str>,
    entity_id: Option<&str>,
) -> Result<Vec<SyncConflict>, AppError> {
    if let Some(entity_type) = entity_type {
        validate_entity_type(entity_type)?;
    }

    let mut sql = String::from(
        "SELECT id, entity_type, entity_id, local_payload, remote_payload, created_at, resolved_at
         FROM sync_conflicts WHERE resolved_at IS NULL",
    );
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(entity_type) = entity_type {
        sql.push_str(" AND entity_type = ?");
        params_vec.push(Box::new(entity_type.to_string()));
    }
    if let Some(entity_id) = entity_id {
        sql.push_str(" AND entity_id = ?");
        params_vec.push(Box::new(entity_id.to_string()));
    }
    sql.push_str(" ORDER BY created_at ASC");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(param_refs.as_slice(), row_to_conflict)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn resolve_conflict(conn: &Connection, id: &str) -> Result<SyncConflict, AppError> {
    let now = now_local();
    let affected = conn.execute(
        "UPDATE sync_conflicts SET resolved_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!(
            "Sync conflict {} not found",
            id
        )));
    }
    get_conflict(conn, id)?
        .ok_or_else(|| AppError::Generic("Failed to resolve sync conflict".to_string()))
}

pub fn derive_entity_status(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
) -> Result<String, AppError> {
    validate_entity_type(entity_type)?;

    let conflicts = list_conflicts(conn, Some(entity_type), Some(entity_id))?;
    if !conflicts.is_empty() {
        return Ok("conflicted".to_string());
    }

    if let Some((table, pk)) = entity_table(entity_type) {
        let sql = format!("SELECT deleted_at FROM {} WHERE {} = ?1", table, pk);
        let deleted_at: Option<String> = conn
            .query_row(&sql, params![entity_id], |row| row.get(0))
            .optional()?
            .flatten();
        if deleted_at.is_some() {
            return Ok("deleted".to_string());
        }
    }

    let operations = list_operations_for_entity(conn, entity_type, entity_id)?;
    if operations
        .iter()
        .any(|op| op.operation == "delete" && op.status != "acked")
    {
        return Ok("deleted".to_string());
    }
    if operations.iter().any(|op| op.status == "failed") {
        return Ok("failed".to_string());
    }
    if operations.iter().any(|op| op.status == "syncing") {
        return Ok("syncing".to_string());
    }
    if operations.iter().any(|op| op.status == "pending") {
        return Ok("pending".to_string());
    }
    Ok("clean".to_string())
}

fn list_operations_for_entity(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
) -> Result<Vec<SyncOperation>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT op_id, entity_type, entity_id, operation, base_revision, payload, client_time,
                device_id, status, retry_count, last_error, created_at, updated_at
         FROM sync_operations
         WHERE entity_type = ?1 AND entity_id = ?2 AND status != 'acked'
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![entity_type, entity_id], row_to_operation)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn record_setting_update(
    conn: &Connection,
    key: &str,
    value: &str,
) -> Result<Option<SyncOperation>, AppError> {
    if !is_syncable_setting_key(key) {
        return Ok(None);
    }

    record_local_operation(
        conn,
        "setting",
        key,
        "update",
        json!({
            "key": key,
            "value": value,
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrations, task_repo};
    use crate::models::task::CreateTaskRequest;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn records_retry_metadata_and_derives_sync_status() {
        let conn = setup();

        let operation = record_operation(
            &conn,
            CreateSyncOperationRequest {
                op_id: Some("op-1".to_string()),
                entity_type: "task".to_string(),
                entity_id: "task-1".to_string(),
                operation: "update".to_string(),
                base_revision: Some(7),
                payload: json!({ "title": "Updated" }),
                client_time: Some("2026-07-06 08:00:00".to_string()),
                device_id: "device-1".to_string(),
            },
        )
        .unwrap();

        assert_eq!(operation.status, "pending");
        assert_eq!(
            derive_entity_status(&conn, "task", "task-1").unwrap(),
            "pending"
        );

        let failed = increment_retry(&conn, "op-1", "network unavailable").unwrap();
        assert_eq!(failed.retry_count, 1);
        assert_eq!(failed.last_error.as_deref(), Some("network unavailable"));
        assert_eq!(
            derive_entity_status(&conn, "task", "task-1").unwrap(),
            "failed"
        );

        let conflict = save_conflict(
            &conn,
            CreateSyncConflictRequest {
                id: Some("conflict-1".to_string()),
                entity_type: "task".to_string(),
                entity_id: "task-1".to_string(),
                local_payload: json!({ "title": "Local" }),
                remote_payload: json!({ "title": "Remote" }),
                created_at: None,
            },
        )
        .unwrap();
        assert_eq!(conflict.resolved_at, None);
        assert_eq!(
            derive_entity_status(&conn, "task", "task-1").unwrap(),
            "conflicted"
        );

        resolve_conflict(&conn, "conflict-1").unwrap();
        assert_eq!(
            derive_entity_status(&conn, "task", "task-1").unwrap(),
            "failed"
        );
    }

    #[test]
    fn sync_enabled_task_delete_uses_tombstone_and_records_delete_operation() {
        let conn = setup();
        set_meta(&conn, "sync_enabled", "1").unwrap();
        set_meta(&conn, "device_id", "device-1").unwrap();

        let task = task_repo::create(
            &conn,
            CreateTaskRequest {
                title: "Delete through sync".to_string(),
                description: None,
                tag_ids: None,
                parent_task_id: None,
                due_date: None,
                priority: None,
                reminder: None,
                recurrence: None,
                my_day_date: None,
                source: None,
            },
        )
        .unwrap();

        task_repo::delete(&conn, &task.id).unwrap();

        let deleted_at: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![task.id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(deleted_at.is_some());

        let visible_tasks = task_repo::get_all(
            &conn,
            crate::models::task::TaskFilter {
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
        assert!(visible_tasks.is_empty());

        let operations = list_operations(&conn, Some("pending")).unwrap();
        assert!(operations.iter().any(|operation| {
            operation.entity_type == "task"
                && operation.entity_id == task.id
                && operation.operation == "delete"
        }));
        assert_eq!(
            derive_entity_status(&conn, "task", &task.id).unwrap(),
            "deleted"
        );
    }

    #[test]
    fn desktop_only_settings_do_not_record_sync_operations() {
        let conn = setup();
        set_meta(&conn, "sync_enabled", "1").unwrap();

        let ignored = record_setting_update(&conn, "widget_x", "10").unwrap();
        assert!(ignored.is_none());

        let recorded = record_setting_update(&conn, "theme", "dark").unwrap();
        assert!(recorded.is_some());
    }
}
