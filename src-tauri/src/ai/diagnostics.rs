use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use uuid::Uuid;

use crate::ai::adapter::ChatUsage;
use crate::ai::error::AiError;

/// 工程默认值:保留最近 30 天且至多 1000 条调用摘要。
pub const RETENTION_DAYS: i64 = 30;
pub const RETENTION_MAX_ROWS: i64 = 1000;

fn now_local() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[derive(Debug, Clone, Serialize)]
pub struct AiInvocationSummary {
    pub id: String,
    pub purpose: String,
    pub model_entry_id: Option<String>,
    /// 连接与模型的名称快照,连接删除后摘要仍可读。
    pub connection_snapshot: String,
    pub status: String,
    pub error_code: Option<String>,
    pub duration_ms: Option<i64>,
    pub usage: Option<ChatUsage>,
    pub created_at: String,
}

/// 写入调用摘要并执行滚动清理。
/// 只保存用途/标识/状态/耗时/错误分类/用量;不保存正文、请求头或原始响应体。
#[allow(clippy::too_many_arguments)]
pub fn record_invocation(
    conn: &Connection,
    purpose: &str,
    model_entry_id: Option<&str>,
    connection_snapshot: &str,
    status: &str,
    error_code: Option<&str>,
    duration_ms: Option<i64>,
    usage: Option<&ChatUsage>,
) -> Result<(), AiError> {
    let usage_json = usage.map(|u| serde_json::to_string(u).unwrap_or_default());
    conn.execute(
        "INSERT INTO ai_invocations (id, purpose, model_entry_id, connection_snapshot, status, error_code, duration_ms, usage, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            Uuid::new_v4().to_string(),
            purpose,
            model_entry_id,
            connection_snapshot,
            status,
            error_code,
            duration_ms,
            usage_json,
            now_local()
        ],
    )?;
    cleanup(conn)
}

/// 滚动清理:删除超过保留天数或超出条数上限的最旧记录。
pub fn cleanup(conn: &Connection) -> Result<(), AiError> {
    conn.execute(
        "DELETE FROM ai_invocations
         WHERE created_at < datetime('now', 'localtime', ?1)
            OR id IN (
                SELECT id FROM ai_invocations ORDER BY created_at DESC, rowid DESC
                LIMIT -1 OFFSET ?2
            )",
        params![format!("-{} days", RETENTION_DAYS), RETENTION_MAX_ROWS],
    )?;
    Ok(())
}

pub fn list_invocations(conn: &Connection, limit: i64) -> Result<Vec<AiInvocationSummary>, AiError> {
    let mut stmt = conn.prepare(
        "SELECT id, purpose, model_entry_id, connection_snapshot, status, error_code, duration_ms, usage, created_at
         FROM ai_invocations ORDER BY created_at DESC, rowid DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], |row| {
        let usage_raw: Option<String> = row.get("usage")?;
        Ok(AiInvocationSummary {
            id: row.get("id")?,
            purpose: row.get("purpose")?,
            model_entry_id: row.get("model_entry_id")?,
            connection_snapshot: row.get("connection_snapshot")?,
            status: row.get("status")?,
            error_code: row.get("error_code")?,
            duration_ms: row.get("duration_ms")?,
            usage: usage_raw
                .and_then(|s| serde_json::from_str(&s).ok()),
            created_at: row.get("created_at")?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn clear_invocations(conn: &Connection) -> Result<(), AiError> {
    conn.execute("DELETE FROM ai_invocations", [])?;
    Ok(())
}

pub fn get_invocation(conn: &Connection, id: &str) -> Result<Option<AiInvocationSummary>, AiError> {
    conn.query_row(
        "SELECT id, purpose, model_entry_id, connection_snapshot, status, error_code, duration_ms, usage, created_at
         FROM ai_invocations WHERE id = ?1",
        params![id],
        |row| {
            let usage_raw: Option<String> = row.get("usage")?;
            Ok(AiInvocationSummary {
                id: row.get("id")?,
                purpose: row.get("purpose")?,
                model_entry_id: row.get("model_entry_id")?,
                connection_snapshot: row.get("connection_snapshot")?,
                status: row.get("status")?,
                error_code: row.get("error_code")?,
                duration_ms: row.get("duration_ms")?,
                usage: usage_raw.and_then(|s| serde_json::from_str(&s).ok()),
                created_at: row.get("created_at")?,
            })
        },
    )
    .optional()
    .map_err(AiError::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn records_summary_without_body() {
        let conn = setup();
        record_invocation(
            &conn,
            "breakdown",
            Some("m1"),
            "测试连接 (model-x)",
            "success",
            None,
            Some(1234),
            Some(&ChatUsage {
                prompt_tokens: Some(10),
                completion_tokens: Some(5),
                total_tokens: Some(15),
            }),
        )
        .unwrap();
        let list = list_invocations(&conn, 10).unwrap();
        assert_eq!(list.len(), 1);
        let inv = &list[0];
        assert_eq!(inv.purpose, "breakdown");
        assert_eq!(inv.status, "success");
        assert_eq!(inv.usage.as_ref().unwrap().total_tokens, Some(15));
        // 摘要字段不含正文/Key/请求头:结构上就没有这些列
        assert_eq!(inv.connection_snapshot, "测试连接 (model-x)");
    }

    #[test]
    fn cleanup_keeps_recent_and_caps_rows() {
        let conn = setup();
        // 插入 3 条旧记录(31 天前)与 2 条新记录
        for i in 0..3 {
            conn.execute(
                "INSERT INTO ai_invocations (id, purpose, connection_snapshot, status, created_at)
                 VALUES (?1, 'test', 'c', 'success', datetime('now','localtime','-31 days'))",
                params![format!("old-{i}")],
            )
            .unwrap();
        }
        for i in 0..2 {
            conn.execute(
                "INSERT INTO ai_invocations (id, purpose, connection_snapshot, status, created_at)
                 VALUES (?1, 'test', 'c', 'success', datetime('now','localtime'))",
                params![format!("new-{i}")],
            )
            .unwrap();
        }
        record_invocation(&conn, "test", None, "c", "success", None, None, None).unwrap();
        let list = list_invocations(&conn, 100).unwrap();
        assert!(list.iter().all(|i| !i.id.starts_with("old-")));
        assert_eq!(list.len(), 3);
    }

    #[test]
    fn clear_removes_all_but_receipts_stay() {
        let conn = setup();
        conn.execute(
            "INSERT INTO ai_apply_receipts (operation_id, proposal_id, task_id, item_count, content_hash, result)
             VALUES ('op1', 'p1', 't1', 2, 'h', '[]')",
            [],
        )
        .unwrap();
        record_invocation(&conn, "t", None, "c", "success", None, None, None).unwrap();
        clear_invocations(&conn).unwrap();
        assert!(list_invocations(&conn, 10).unwrap().is_empty());
        let receipts: i64 = conn
            .query_row("SELECT COUNT(*) FROM ai_apply_receipts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(receipts, 1);
    }
}
