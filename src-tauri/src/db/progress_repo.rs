//! 自愿进展记录:单文本、主动保存、可编辑删除、支持补记过去日期。
//!
//! 记录完全独立于任务描述/状态/"我的一天";删除只清除正文并保留最小去重标记
//! (content_hash + is_deleted),不随 AI 摘要清理或跨日刷新删除。
//! 保存走 progress_save_receipts 幂等回执:同一 operation_id 重试不新增重复记录。

use chrono::{Local, NaiveDate};
use rusqlite::params_from_iter;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::db::history_repo;
use crate::db::task_repo;
use crate::error::AppError;
use crate::models::progress::{
    CreateProgressRequest, ProgressOverview, ProgressPage, ProgressRecord, UpdateProgressRequest,
};

pub const MAX_CONTENT_CHARS: usize = 2000;

fn now_local() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[cfg(test)]
fn today_local() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn validate_content(content: &str) -> Result<String, AppError> {
    let trimmed = content.trim();
    let count = trimmed.chars().count();
    if count == 0 {
        return Err(AppError::Validation("进展内容不能为空".to_string()));
    }
    if count > MAX_CONTENT_CHARS {
        return Err(AppError::Validation(format!(
            "进展内容至多 {} 字,当前 {} 字",
            MAX_CONTENT_CHARS, count
        )));
    }
    Ok(trimmed.to_string())
}

fn validate_record_date(date: &str) -> Result<String, AppError> {
    let parsed = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("记录日期格式应为 YYYY-MM-DD".to_string()))?;
    if parsed > Local::now().date_naive() {
        return Err(AppError::Validation(
            "记录日期不能是未来日期".to_string(),
        ));
    }
    Ok(date.to_string())
}

// ---------- 保存回执(记录与回顾共用) ----------

fn find_receipt(
    conn: &Connection,
    operation_id: &str,
) -> Result<Option<(String, String)>, AppError> {
    let result = conn.query_row(
        "SELECT content_hash, result FROM progress_save_receipts WHERE operation_id = ?1",
        [operation_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );
    match result {
        Ok(pair) => Ok(Some(pair)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

pub fn check_receipt_hash(input: &str) -> String {
    sha256_hex(input)
}

pub fn check_receipt(
    conn: &Connection,
    operation_id: &str,
    content_hash: &str,
) -> Result<Option<String>, AppError> {
    match find_receipt(conn, operation_id)? {
        Some((hash, result)) if hash == content_hash => Ok(Some(result)),
        Some(_) => Err(AppError::Validation(
            "同一操作的保存内容发生变化,请勿复用操作标识".to_string(),
        )),
        None => Ok(None),
    }
}

pub fn write_receipt(
    conn: &Connection,
    operation_id: &str,
    entity_kind: &str,
    entity_id: &str,
    content_hash: &str,
    result: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO progress_save_receipts (operation_id, entity_kind, entity_id, content_hash, result)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        [operation_id, entity_kind, entity_id, content_hash, result],
    )?;
    Ok(())
}

// ---------- 记录 CRUD ----------

fn resolve_root(conn: &Connection, task: &crate::models::task::Task) -> (String, Vec<String>) {
    let root_task_id = task
        .parent_task_id
        .clone()
        .unwrap_or_else(|| task.id.clone());
    let root_tag_ids = history_repo::get_task_tag_ids(conn, &root_task_id).unwrap_or_default();
    (root_task_id, root_tag_ids)
}

pub fn create_progress_record(
    conn: &Connection,
    req: CreateProgressRequest,
) -> Result<(ProgressRecord, bool), AppError> {
    let content = validate_content(&req.content)?;
    let record_date = validate_record_date(&req.record_date)?;

    let create_hash = sha256_hex(&format!("create|{}|{}", content, record_date));
    let tx = conn.unchecked_transaction()?;

    if let Some(op) = req.operation_id.as_deref() {
        if !op.is_empty() {
            if let Some(result_json) = check_receipt(&tx, op, &create_hash)? {
                if let Ok(record) = serde_json::from_str::<ProgressRecord>(&result_json) {
                    tx.commit()?;
                    return Ok((record, true));
                }
            }
        }
    }

    let task = task_repo::get_by_id(&tx, &req.task_id)?
        .ok_or_else(|| AppError::NotFound(format!("任务 {} 不存在", req.task_id)))?;
    let (root_task_id, root_tag_ids) = resolve_root(&tx, &task);

    let id = Uuid::new_v4().to_string();
    let now = now_local();
    tx.execute(
        "INSERT INTO task_progress_records
            (id, task_id, root_task_id, root_tag_ids, record_date, content, content_hash,
             version, is_deleted, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 0, ?8, ?8)",
        rusqlite::params![
            id,
            req.task_id,
            root_task_id,
            serde_json::to_string(&root_tag_ids).unwrap_or_else(|_| "[]".into()),
            record_date,
            content,
            create_hash,
            now,
        ],
    )?;

    let record = ProgressRecord {
        id: id.clone(),
        task_id: req.task_id.clone(),
        root_task_id,
        root_tag_ids,
        record_date,
        content,
        version: 1,
        created_at: now.clone(),
        updated_at: now,
        task_title: Some(task.title),
        task_deleted: false,
        is_subtask: task.parent_task_id.is_some(),
    };

    if let Some(op) = req.operation_id.as_deref() {
        if !op.is_empty() {
            let result = serde_json::to_string(&record).unwrap_or_default();
            write_receipt(&tx, op, "progress_record", &id, &create_hash, &result)?;
        }
    }

    tx.commit()?;
    Ok((record, false))
}

pub fn update_progress_record(
    conn: &Connection,
    req: UpdateProgressRequest,
) -> Result<(ProgressRecord, bool), AppError> {
    let content = validate_content(&req.content)?;
    let record_date = validate_record_date(&req.record_date)?;

    let update_hash = sha256_hex(&format!(
        "update|{}|{}|{}|{}",
        req.record_id, req.expected_version, content, record_date
    ));
    let tx = conn.unchecked_transaction()?;

    if let Some(op) = req.operation_id.as_deref() {
        if !op.is_empty() {
            if let Some(result_json) = check_receipt(&tx, op, &update_hash)? {
                if let Ok(record) = serde_json::from_str::<ProgressRecord>(&result_json) {
                    tx.commit()?;
                    return Ok((record, true));
                }
            }
        }
    }

    let affected = tx.execute(
        "UPDATE task_progress_records
         SET content = ?1, record_date = ?2, version = version + 1, updated_at = ?3
         WHERE id = ?4 AND version = ?5 AND is_deleted = 0",
        rusqlite::params![content, record_date, now_local(), req.record_id, req.expected_version],
    )?;
    if affected == 0 {
        let row = tx.query_row(
            "SELECT version, is_deleted FROM task_progress_records WHERE id = ?1",
            [&req.record_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i32>(1)?)),
        );
        match row {
            Ok((version, 0)) => {
                return Err(AppError::Validation(format!(
                    "记录已被其他编辑修改(当前版本 {}),请刷新后重试",
                    version
                )))
            }
            Ok((_, _)) => {
                return Err(AppError::NotFound(format!("记录 {} 已被删除", req.record_id)));
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                return Err(AppError::NotFound(format!("记录 {} 不存在", req.record_id)));
            }
            Err(e) => return Err(AppError::Database(e)),
        }
    }

    let record = get_record_inner(&tx, &req.record_id)?
        .ok_or_else(|| AppError::Generic("更新后读取记录失败".to_string()))?;

    if let Some(op) = req.operation_id.as_deref() {
        if !op.is_empty() {
            let result = serde_json::to_string(&record).unwrap_or_default();
            write_receipt(&tx, op, "progress_record", &req.record_id, &update_hash, &result)?;
        }
    }

    tx.commit()?;
    Ok((record, false))
}

/// 删除记录:清除正文、保留最小去重标记;重复删除幂等,晚到保存响应不能恢复正文
pub fn delete_progress_record(
    conn: &Connection,
    record_id: &str,
    expected_version: i64,
) -> Result<(), AppError> {
    let now = now_local();
    let affected = conn.execute(
        "UPDATE task_progress_records
         SET content = '', is_deleted = 1, deleted_at = ?1, version = version + 1, updated_at = ?1
         WHERE id = ?2 AND version = ?3 AND is_deleted = 0",
        rusqlite::params![now, record_id, expected_version],
    )?;
    if affected == 0 {
        let row = conn.query_row(
            "SELECT is_deleted FROM task_progress_records WHERE id = ?1",
            [record_id],
            |row| row.get::<_, i32>(0),
        );
        match row {
            Ok(1) => Ok(()), // 已删除:幂等
            Ok(_) => Err(AppError::Validation(
                "记录已被其他编辑修改,请刷新后重试".to_string(),
            )),
            Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound(format!(
                "记录 {} 不存在",
                record_id
            ))),
            Err(e) => Err(AppError::Database(e)),
        }
    } else {
        Ok(())
    }
}

fn get_record_inner(conn: &Connection, id: &str) -> Result<Option<ProgressRecord>, AppError> {
    let result = conn.query_row(
        "SELECT r.id, r.task_id, r.root_task_id, r.root_tag_ids, r.record_date, r.content,
                r.version, r.created_at, r.updated_at,
                t.title, t.parent_task_id,
                (t.id IS NULL OR t.deleted_at IS NOT NULL) AS task_deleted
         FROM task_progress_records r
         LEFT JOIN tasks t ON t.id = r.task_id
         WHERE r.id = ?1 AND r.is_deleted = 0",
        [id],
        |row| {
            let root_tag_raw: String = row.get(3)?;
            let task_deleted: bool = row.get::<_, i32>(11)? != 0;
            Ok(ProgressRecord {
                id: row.get(0)?,
                task_id: row.get(1)?,
                root_task_id: row.get(2)?,
                root_tag_ids: serde_json::from_str(&root_tag_raw).unwrap_or_default(),
                record_date: row.get(4)?,
                content: row.get(5)?,
                version: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                task_title: if task_deleted { None } else { row.get(9)? },
                task_deleted,
                is_subtask: row.get::<_, Option<String>>(10)?.is_some(),
            })
        },
    );
    match result {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

fn child_task_ids(conn: &Connection, task_id: &str) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare("SELECT id FROM tasks WHERE parent_task_id = ?1")?;
    let ids = stmt
        .query_map([task_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

/// 分页时间线:默认只看本任务;include_children 聚合直接子任务并标识来源
pub fn list_records(
    conn: &Connection,
    task_id: &str,
    include_children: bool,
    page: i64,
    page_size: i64,
) -> Result<ProgressPage, AppError> {
    let page = page.max(1);
    let page_size = page_size.clamp(1, 100);

    let mut task_ids = vec![task_id.to_string()];
    if include_children {
        task_ids.extend(child_task_ids(conn, task_id)?);
    }

    let placeholders = vec!["?"; task_ids.len()].join(",");
    let where_clause = format!("r.is_deleted = 0 AND r.task_id IN ({})", placeholders);

    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM task_progress_records r WHERE {}", where_clause),
        params_from_iter(task_ids.iter()),
        |row| row.get(0),
    )?;

    let sql = format!(
        "SELECT r.id, r.task_id, r.root_task_id, r.root_tag_ids, r.record_date, r.content,
                r.version, r.created_at, r.updated_at,
                t.title, t.parent_task_id,
                (t.id IS NULL OR t.deleted_at IS NOT NULL) AS task_deleted
         FROM task_progress_records r
         LEFT JOIN tasks t ON t.id = r.task_id
         WHERE {}
         ORDER BY r.record_date DESC, r.created_at DESC, r.id DESC
         LIMIT {} OFFSET {}",
        where_clause,
        page_size,
        (page - 1) * page_size
    );
    let mut stmt = conn.prepare(&sql)?;
    let items = stmt
        .query_map(params_from_iter(task_ids.iter()), |row| {
            let root_tag_raw: String = row.get(3)?;
            let task_deleted: bool = row.get::<_, i32>(11)? != 0;
            Ok(ProgressRecord {
                id: row.get(0)?,
                task_id: row.get(1)?,
                root_task_id: row.get(2)?,
                root_tag_ids: serde_json::from_str(&root_tag_raw).unwrap_or_default(),
                record_date: row.get(4)?,
                content: row.get(5)?,
                version: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                task_title: if task_deleted { None } else { row.get(9)? },
                task_deleted,
                is_subtask: row.get::<_, Option<String>>(10)?.is_some(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(ProgressPage {
        items,
        total,
        page,
        page_size,
    })
}

/// 状态事件时间线(与手写记录分开查看)
pub fn list_events(
    conn: &Connection,
    task_id: &str,
    include_children: bool,
    page: i64,
    page_size: i64,
) -> Result<crate::models::progress::StateEventPage, AppError> {
    let page = page.max(1);
    let page_size = page_size.clamp(1, 100);

    let mut task_ids = vec![task_id.to_string()];
    if include_children {
        task_ids.extend(child_task_ids(conn, task_id)?);
    }
    let placeholders = vec!["?"; task_ids.len()].join(",");
    let where_clause = format!("e.task_id IN ({})", placeholders);

    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM task_state_events e WHERE {}", where_clause),
        params_from_iter(task_ids.iter()),
        |row| row.get(0),
    )?;

    let sql = format!(
        "SELECT e.id, e.task_id, e.root_task_id, e.transition, e.occurred_at, e.occurred_utc,
                e.local_date, e.tz_offset, e.source, e.title_snapshot, e.root_tag_ids,
                (t.id IS NULL OR t.deleted_at IS NOT NULL) AS task_deleted
         FROM task_state_events e
         LEFT JOIN tasks t ON t.id = e.task_id
         WHERE {}
         ORDER BY e.id DESC
         LIMIT {} OFFSET {}",
        where_clause,
        page_size,
        (page - 1) * page_size
    );
    let mut stmt = conn.prepare(&sql)?;
    let items = stmt
        .query_map(params_from_iter(task_ids.iter()), |row| {
            let root_tag_raw: String = row.get(10)?;
            Ok(crate::models::progress::TaskStateEvent {
                id: row.get(0)?,
                task_id: row.get(1)?,
                root_task_id: row.get(2)?,
                transition: row.get(3)?,
                occurred_at: row.get(4)?,
                occurred_utc: row.get(5)?,
                local_date: row.get(6)?,
                tz_offset: row.get(7)?,
                source: row.get(8)?,
                title_snapshot: row.get(9)?,
                root_tag_ids: serde_json::from_str(&root_tag_raw).unwrap_or_default(),
                task_deleted: row.get::<_, i32>(11)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(crate::models::progress::StateEventPage {
        items,
        total,
        page,
        page_size,
    })
}

/// 轻量入口摘要:页签徽标计数 + 最近记录时间
pub fn overview(conn: &Connection, task_id: &str) -> Result<ProgressOverview, AppError> {
    let self_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM task_progress_records WHERE task_id = ?1 AND is_deleted = 0",
        [task_id],
        |row| row.get(0),
    )?;
    let children = child_task_ids(conn, task_id)?;
    let with_children_count = if children.is_empty() {
        self_count
    } else {
        let placeholders = vec!["?"; children.len() + 1].join(",");
        let mut ids = vec![task_id.to_string()];
        ids.extend(children);
        conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM task_progress_records WHERE is_deleted = 0 AND task_id IN ({})",
                placeholders
            ),
            params_from_iter(ids.iter()),
            |row| row.get(0),
        )?
    };
    let last_record_at: Option<String> = conn.query_row(
        "SELECT MAX(created_at) FROM task_progress_records WHERE task_id = ?1 AND is_deleted = 0",
        [task_id],
        |row| row.get(0),
    )?;
    Ok(ProgressOverview {
        self_count,
        with_children_count,
        last_record_at,
    })
}

/// 任务删除时清除关联手写正文(含子任务),保留最小标记
pub fn clear_record_bodies_for_tasks(conn: &Connection, task_ids: &[String]) -> Result<(), AppError> {
    if task_ids.is_empty() {
        return Ok(());
    }
    let placeholders = vec!["?"; task_ids.len()].join(",");
    conn.execute(
        &format!(
            "UPDATE task_progress_records
             SET content = '', is_deleted = 1,
                 deleted_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
             WHERE task_id IN ({}) AND is_deleted = 0",
            placeholders
        ),
        params_from_iter(task_ids.iter()),
    )?;
    Ok(())
}

// ---------- 备份恢复(显式选择时) ----------

#[derive(Debug, Default, Clone, Copy)]
pub struct RestoreCounts {
    pub inserted: i64,
    pub skipped: i64,
}

/// 按主键逐行恢复:相同 ID 相同内容跳过,不同内容拒绝(整批由调用方事务保证原子)。
/// cols[0] 必须是主键列。
pub fn restore_table(
    conn: &Connection,
    src: &Connection,
    table: &str,
    cols: &[&str],
) -> Result<RestoreCounts, AppError> {
    use rusqlite::types::Value as SqlValue;
    use std::collections::HashMap;

    fn canonical(v: &SqlValue) -> String {
        match v {
            SqlValue::Null => "\u{1}null".to_string(),
            SqlValue::Integer(i) => format!("\u{2}{}", i),
            SqlValue::Real(f) => format!("\u{3}{}", f),
            SqlValue::Text(s) => format!("\u{4}{}", s),
            SqlValue::Blob(b) => format!("\u{5}{}", b.len()),
        }
    }

    let col_list = cols.join(", ");
    let mut local_rows: HashMap<String, Vec<String>> = HashMap::new();
    {
        let mut stmt = conn.prepare(&format!("SELECT {} FROM {}", col_list, table))?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let values: Vec<SqlValue> = (0..cols.len()).map(|i| row.get(i).unwrap()).collect();
            let key = canonical(&values[0]);
            local_rows.insert(key, values.iter().map(canonical).collect());
        }
    }

    let mut counts = RestoreCounts::default();
    let mut stmt = src.prepare(&format!("SELECT {} FROM {}", col_list, table))?;
    let placeholders = vec!["?"; cols.len()].join(",");
    let insert_sql = format!("INSERT INTO {} ({}) VALUES ({})", table, col_list, placeholders);
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let values: Vec<SqlValue> = (0..cols.len()).map(|i| row.get(i).unwrap()).collect();
        let key = canonical(&values[0]);
        match local_rows.get(&key) {
            Some(existing) if *existing == values.iter().map(canonical).collect::<Vec<_>>() => {
                counts.skipped += 1;
            }
            Some(_) => {
                return Err(AppError::Validation(format!(
                    "备份与本机存在相同主键但内容不同的 {} 记录,已拒绝恢复",
                    table
                )));
            }
            None => {
                conn.execute(&insert_sql, params_from_iter(values.iter()))?;
                counts.inserted += 1;
            }
        }
    }
    Ok(counts)
}

/// 覆盖表恢复:内容相同的区间去重,不同区间并入(元数据表,不按主键冲突)
pub fn restore_coverage(conn: &Connection, src: &Connection) -> Result<i64, AppError> {
    let mut stmt =
        src.prepare("SELECT kind, start_date, end_date, note FROM task_history_coverage")?;
    let mut rows = stmt.query([])?;
    let mut inserted = 0i64;
    while let Some(row) = rows.next()? {
        let kind: String = row.get(0)?;
        let start_date: String = row.get(1)?;
        let end_date: Option<String> = row.get(2)?;
        let note: String = row.get(3)?;
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM task_history_coverage
             WHERE kind = ?1 AND start_date = ?2 AND end_date IS ?3 AND note = ?4",
            rusqlite::params![kind, start_date, end_date, note],
            |r| r.get(0),
        )?;
        if exists == 0 {
            conn.execute(
                "INSERT INTO task_history_coverage (kind, start_date, end_date, note) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![kind, start_date, end_date, note],
            )?;
            inserted += 1;
        }
    }
    Ok(inserted)
}

/// 恢复进展与回顾数据(调用方包一个事务;来源表缺失视为空,兼容旧备份)。
/// 事件保留原 ID 与原时间;不生成本机今日活动。
pub fn restore_progress_data(
    conn: &Connection,
    src: &Connection,
) -> Result<RestoreCounts, AppError> {
    // 同范围不同文稿(scope_key 撞车但主键不同)视为冲突,先查后插
    {
        let mut stmt = src.prepare("SELECT scope_key, id FROM period_reviews")?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let scope_key: String = row.get(0)?;
            let src_id: String = row.get(1)?;
            let local_id: Option<String> = conn
                .query_row(
                    "SELECT id FROM period_reviews WHERE scope_key = ?1",
                    [&scope_key],
                    |r| r.get(0),
                )
                .ok();
            if let Some(local_id) = local_id {
                if local_id != src_id {
                    return Err(AppError::Validation(format!(
                        "备份与本机存在同一回顾范围的不同文稿({}),已拒绝恢复",
                        scope_key
                    )));
                }
            }
        }
    }

    let records = restore_table(
        conn,
        src,
        "task_progress_records",
        &[
            "id",
            "task_id",
            "root_task_id",
            "root_tag_ids",
            "record_date",
            "content",
            "content_hash",
            "version",
            "is_deleted",
            "deleted_at",
            "created_at",
            "updated_at",
        ],
    )?;
    let events = restore_table(
        conn,
        src,
        "task_state_events",
        &[
            "id",
            "task_id",
            "root_task_id",
            "transition",
            "occurred_at",
            "occurred_utc",
            "local_date",
            "tz_offset",
            "source",
            "title_snapshot",
            "root_tag_ids",
        ],
    )?;
    let reviews = restore_table(
        conn,
        src,
        "period_reviews",
        &[
            "id",
            "scope_key",
            "period_kind",
            "period_start",
            "period_end",
            "tag_ids",
            "manual_text",
            "ai_sections",
            "ai_model_snapshot",
            "event_cutoff_at",
            "prepared_at",
            "prepared_at_local_date",
            "timezone_offset",
            "coverage_note",
            "source_refs",
            "revision",
            "is_deleted",
            "created_at",
            "updated_at",
        ],
    )?;
    let receipts = restore_table(
        conn,
        src,
        "progress_save_receipts",
        &[
            "operation_id",
            "entity_kind",
            "entity_id",
            "content_hash",
            "result",
            "created_at",
        ],
    )?;
    restore_coverage(conn, src)?;

    Ok(RestoreCounts {
        inserted: records.inserted + events.inserted + reviews.inserted + receipts.inserted,
        skipped: records.skipped + events.skipped + reviews.skipped + receipts.skipped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use crate::db::task_repo;
    use crate::models::task::CreateTaskRequest;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    fn create_task(conn: &Connection, title: &str, parent: Option<String>) -> String {
        let task = task_repo::create(
            conn,
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
            },
        )
        .unwrap();
        task.id
    }

    fn today() -> String {
        today_local()
    }

    fn create_req(task_id: &str, content: &str, date: &str) -> CreateProgressRequest {
        CreateProgressRequest {
            task_id: task_id.to_string(),
            content: content.to_string(),
            record_date: date.to_string(),
            operation_id: None,
        }
    }

    #[test]
    fn create_edit_delete_roundtrip() {
        let conn = setup();
        let task_id = create_task(&conn, "任务A", None);

        let (record, already) =
            create_progress_record(&conn, create_req(&task_id, "初稿完成", &today())).unwrap();
        assert!(!already);
        assert_eq!(record.content, "初稿完成");
        assert_eq!(record.version, 1);
        assert_eq!(record.root_task_id, task_id);

        // 编辑:版本递增,创建时间不变
        let (updated, _) = update_progress_record(
            &conn,
            UpdateProgressRequest {
                record_id: record.id.clone(),
                content: "初稿完成,等待数据".to_string(),
                record_date: today(),
                expected_version: 1,
                operation_id: None,
            },
        )
        .unwrap();
        assert_eq!(updated.version, 2);
        assert_eq!(updated.created_at, record.created_at);

        // 删除:正文清除,标记保留
        delete_progress_record(&conn, &record.id, 2).unwrap();
        let body: Option<String> = conn
            .query_row(
                "SELECT content FROM task_progress_records WHERE id = ?1",
                [&record.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(body.as_deref(), Some(""));
        let deleted: bool = conn
            .query_row(
                "SELECT is_deleted FROM task_progress_records WHERE id = ?1",
                [&record.id],
                |r| r.get::<_, i32>(0),
            )
            .unwrap()
            != 0;
        assert!(deleted);

        // 已删除后重复删除幂等
        delete_progress_record(&conn, &record.id, 3).unwrap();

        // 晚到的旧版本保存:冲突,不恢复正文
        let err = update_progress_record(
            &conn,
            UpdateProgressRequest {
                record_id: record.id.clone(),
                content: "晚到响应".to_string(),
                record_date: today(),
                expected_version: 1,
                operation_id: None,
            },
        );
        assert!(err.is_err());
    }

    #[test]
    fn content_and_date_validation() {
        let conn = setup();
        let task_id = create_task(&conn, "任务A", None);

        // 空白
        assert!(create_progress_record(&conn, create_req(&task_id, "   ", &today())).is_err());
        // 超长
        let long = "字".repeat(MAX_CONTENT_CHARS + 1);
        assert!(create_progress_record(&conn, create_req(&task_id, &long, &today())).is_err());
        // 未来日期
        let future = (Local::now().date_naive() + chrono::Days::new(1))
            .format("%Y-%m-%d")
            .to_string();
        let err =
            create_progress_record(&conn, create_req(&task_id, "内容", &future)).unwrap_err();
        assert!(err.to_string().contains("未来"));
        // 错误格式
        assert!(create_progress_record(&conn, create_req(&task_id, "内容", "2026/01/01")).is_err());
    }

    #[test]
    fn operation_id_dedup() {
        let conn = setup();
        let task_id = create_task(&conn, "任务A", None);
        let mut req = create_req(&task_id, "第一条", &today());
        req.operation_id = Some("op-1".to_string());

        let (first, already) = create_progress_record(&conn, req.clone()).unwrap();
        assert!(!already);

        // 保存响应丢失后重试同一操作:不新增重复记录
        let (replay, already) = create_progress_record(&conn, req).unwrap();
        assert!(already);
        assert_eq!(replay.id, first.id);

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM task_progress_records WHERE task_id = ?1",
                [&task_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // 同 operation_id 但内容不同:拒绝
        let mut conflict = create_req(&task_id, "别的", &today());
        conflict.operation_id = Some("op-1".to_string());
        assert!(create_progress_record(&conn, conflict).is_err());
    }

    #[test]
    fn concurrent_edit_version_conflict() {
        let conn = setup();
        let task_id = create_task(&conn, "任务A", None);
        let (record, _) =
            create_progress_record(&conn, create_req(&task_id, "原文", &today())).unwrap();

        // 两处基于版本 1 编辑:第一处成功,第二处冲突且保留其输入
        let (first, _) = update_progress_record(
            &conn,
            UpdateProgressRequest {
                record_id: record.id.clone(),
                content: "编辑一".to_string(),
                record_date: today(),
                expected_version: 1,
                operation_id: None,
            },
        )
        .unwrap();
        assert_eq!(first.version, 2);

        let second = update_progress_record(
            &conn,
            UpdateProgressRequest {
                record_id: record.id.clone(),
                content: "编辑二".to_string(),
                record_date: today(),
                expected_version: 1,
                operation_id: None,
            },
        );
        assert!(second.is_err());
        assert!(second.unwrap_err().to_string().contains("已被其他编辑修改"));
    }

    #[test]
    fn include_children_aggregation_once() {
        let conn = setup();
        let root = create_task(&conn, "根任务", None);
        let child = create_task(&conn, "子任务", Some(root.clone()));
        let other_root = create_task(&conn, "别的根", None);

        create_progress_record(&conn, create_req(&root, "根的记录", &today())).unwrap();
        create_progress_record(&conn, create_req(&child, "子的记录", &today())).unwrap();
        create_progress_record(&conn, create_req(&other_root, "别的记录", &today())).unwrap();

        // 根任务默认只看自己
        let own = list_records(&conn, &root, false, 1, 20).unwrap();
        assert_eq!(own.total, 1);
        assert_eq!(own.items[0].content, "根的记录");

        // 含子任务:子任务记录出现一次且标识来源
        let agg = list_records(&conn, &root, true, 1, 20).unwrap();
        assert_eq!(agg.total, 2);
        let child_record = agg.items.iter().find(|r| r.task_id == child).unwrap();
        assert!(child_record.is_subtask);
        assert_eq!(child_record.task_title.as_deref(), Some("子任务"));
        assert_eq!(child_record.root_task_id, root);

        // 子任务记录的根快照指向根
        assert_eq!(child_record.root_task_id, root);

        // 分页
        let paged = list_records(&conn, &root, true, 1, 1).unwrap();
        assert_eq!(paged.items.len(), 1);
        assert_eq!(paged.total, 2);
        let page2 = list_records(&conn, &root, true, 2, 1).unwrap();
        assert_eq!(page2.items.len(), 1);
    }

    #[test]
    fn record_moves_with_task_and_history_keeps_original_root() {
        let conn = setup();
        let root_a = create_task(&conn, "根A", None);
        let root_b = create_task(&conn, "根B", None);
        let child = create_task(&conn, "子任务", Some(root_a.clone()));

        let (record, _) = create_progress_record(&conn, create_req(&child, "子的记录", &today()))
            .unwrap();
        // 保存时根快照 = 根A
        assert_eq!(record.root_task_id, root_a);

        // 子任务移动到根B:详情按当前父子关系聚合
        task_repo::update(
            &conn,
            &child,
            crate::models::task::UpdateTaskRequest {
                parent_task_id: Some(Some(root_b.clone())),
                ..Default::default()
            },
        )
        .unwrap();
        let agg = list_records(&conn, &root_b, true, 1, 20).unwrap();
        assert_eq!(agg.total, 1);
        // 历史快照不被改写
        assert_eq!(agg.items[0].root_task_id, root_a);
    }

    #[test]
    fn clear_bodies_on_task_delete() {
        let conn = setup();
        let root = create_task(&conn, "根", None);
        let child = create_task(&conn, "子", Some(root.clone()));
        let (r1, _) = create_progress_record(&conn, create_req(&root, "根记录", &today())).unwrap();
        let (r2, _) =
            create_progress_record(&conn, create_req(&child, "子记录", &today())).unwrap();

        clear_record_bodies_for_tasks(&conn, &[root.clone(), child]).unwrap();
        for id in [r1.id, r2.id] {
            let body: String = conn
                .query_row(
                    "SELECT content FROM task_progress_records WHERE id = ?1",
                    [&id],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(body, "");
        }
        // 任务不再存在时列表来源标记删除
        task_repo::delete(&conn, &root).unwrap();
        let page = list_records(&conn, &root, true, 1, 20).unwrap();
        assert_eq!(page.total, 0);
    }

    #[test]
    fn overview_counts() {
        let conn = setup();
        let root = create_task(&conn, "根", None);
        let child = create_task(&conn, "子", Some(root.clone()));
        create_progress_record(&conn, create_req(&root, "根记录", &today())).unwrap();
        create_progress_record(&conn, create_req(&child, "子记录", &today())).unwrap();

        let ov = overview(&conn, &root).unwrap();
        assert_eq!(ov.self_count, 1);
        assert_eq!(ov.with_children_count, 2);
        assert!(ov.last_record_at.is_some());
    }

    #[test]
    fn restore_dedupes_and_rejects_conflicts() {
        let src = setup();
        let task_id = create_task(&src, "任务", None);
        let (record, _) =
            create_progress_record(&src, create_req(&task_id, "备份里的记录", &today())).unwrap();

        // 空库恢复:全部插入
        let fresh = setup();
        let tx = fresh.unchecked_transaction().unwrap();
        let counts = restore_progress_data(&tx, &src).unwrap();
        tx.commit().unwrap();
        assert!(counts.inserted >= 1); // 至少记录本身

        // 重复恢复:相同内容全部跳过,不重复计数
        let tx = fresh.unchecked_transaction().unwrap();
        let again = restore_progress_data(&tx, &src).unwrap();
        tx.commit().unwrap();
        assert_eq!(again.inserted, 0);
        assert_eq!(again.skipped, counts.inserted);

        // 本机内容与备份同 ID 不同:拒绝,整批回滚
        conn_like_edit(&fresh, &record.id);
        let tx = fresh.unchecked_transaction().unwrap();
        let conflict = restore_progress_data(&tx, &src);
        assert!(conflict.is_err());
        drop(tx); // 回滚(不提交)
        let body: String = fresh
            .query_row(
                "SELECT content FROM task_progress_records WHERE id = ?1",
                [&record.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(body, "本机修改后的内容");
    }

    fn conn_like_edit(conn: &Connection, record_id: &str) {
        conn.execute(
            "UPDATE task_progress_records SET content = '本机修改后的内容' WHERE id = ?1",
            [record_id],
        )
        .unwrap();
    }

    #[test]
    fn restore_preserves_event_times() {
        let src = setup();
        let task_id = create_task(&src, "任务", None);
        task_repo::update(
            &src,
            &task_id,
            crate::models::task::UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let (occurred, local_date): (String, String) = src
            .query_row(
                "SELECT occurred_at, local_date FROM task_state_events LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();

        let fresh = setup();
        let tx = fresh.unchecked_transaction().unwrap();
        restore_progress_data(&tx, &src).unwrap();
        tx.commit().unwrap();

        // 恢复的事件保留原时间,不生成本机今日活动
        let (r_occurred, r_local): (String, String) = fresh
            .query_row(
                "SELECT occurred_at, local_date FROM task_state_events LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(r_occurred, occurred);
        assert_eq!(r_local, local_date);
    }
}
