//! 日/周回顾:程序事实计算、材料浏览与每范围一份的保存稿。
//!
//! 事实只来自本机真实状态事件,不用任务更新时间/当前状态推断;完成/重开按
//! 截止时点最近一次事件去重;根任务与子任务分列。标签按事件/记录保存时的
//! 根任务标签快照筛选,当前标签变化不改写历史范围。

use chrono::{Datelike, Duration, Local, NaiveDate, Weekday};
use rusqlite::params;
use rusqlite::Connection;
use uuid::Uuid;

use crate::db::history_repo;
use crate::db::progress_repo;
use crate::error::AppError;
use crate::models::progress::{ProgressPage, TaskStateEvent};
use crate::models::review::{
    ReviewFacts, ReviewScope, ReviewSourceStatus, SaveReviewRequest, SavedReview, TaskFact,
};

pub const MAX_MANUAL_TEXT_CHARS: usize = 20000;

fn now_local() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn parse_date(date: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| AppError::Validation(format!("日期格式应为 YYYY-MM-DD: {}", date)))
}

/// 自然周周一
pub fn week_start_of(date: NaiveDate) -> NaiveDate {
    match date.weekday() {
        Weekday::Mon => date,
        other => date - Duration::days(other.num_days_from_monday() as i64),
    }
}

pub fn compute_scope(
    kind: &str,
    start_date: &str,
    tag_ids: &[String],
) -> Result<ReviewScope, AppError> {
    let kind = kind.to_ascii_lowercase();
    if kind != "day" && kind != "week" {
        return Err(AppError::Validation("周期类型应为 day 或 week".to_string()));
    }
    let date = parse_date(start_date)?;
    let (start, end) = if kind == "day" {
        (date, date)
    } else {
        let start = week_start_of(date);
        (start, start + Duration::days(6))
    };
    let mut tags: Vec<String> = tag_ids
        .iter()
        .filter(|t| !t.is_empty())
        .cloned()
        .collect();
    tags.sort();
    tags.dedup();
    let tag_suffix = if tags.is_empty() {
        String::new()
    } else {
        format!("|{}", tags.join(","))
    };
    Ok(ReviewScope {
        scope_key: format!("{}:{}{}", kind, start.format("%Y-%m-%d"), tag_suffix),
        kind,
        start_date: start.format("%Y-%m-%d").to_string(),
        end_date: end.format("%Y-%m-%d").to_string(),
        tag_ids: tags,
    })
}

fn tags_match(snapshot: &[String], filter: &[String]) -> bool {
    filter.is_empty() || snapshot.iter().any(|t| filter.contains(t))
}

#[allow(dead_code)]
struct EventRow {
    task_id: String,
    root_task_id: String,
    transition: String,
    occurred_at: String,
    local_date: String,
    title: String,
    root_tag_ids: Vec<String>,
    task_deleted: bool,
}

fn load_events_in_range(conn: &Connection, scope: &ReviewScope) -> Result<Vec<EventRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT e.task_id, e.root_task_id, e.transition, e.occurred_at, e.local_date,
                e.title_snapshot, e.root_tag_ids,
                (t.id IS NULL OR t.deleted_at IS NOT NULL) AS task_deleted
         FROM task_state_events e
         LEFT JOIN tasks t ON t.id = e.task_id
         WHERE e.local_date BETWEEN ?1 AND ?2
         ORDER BY e.id",
    )?;
    let rows = stmt
        .query_map(params![scope.start_date, scope.end_date], |row| {
            let tag_raw: String = row.get(6)?;
            Ok(EventRow {
                task_id: row.get(0)?,
                root_task_id: row.get(1)?,
                transition: row.get(2)?,
                occurred_at: row.get(3)?,
                local_date: row.get(4)?,
                title: row.get(5)?,
                root_tag_ids: serde_json::from_str(&tag_raw).unwrap_or_default(),
                task_deleted: row.get::<_, i32>(7)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows
        .into_iter()
        .filter(|row| tags_match(&row.root_tag_ids, &scope.tag_ids))
        .collect())
}

/// 范围内全部材料(供 AI 准备使用,不带分页)
pub fn load_records_in_range(
    conn: &Connection,
    scope: &ReviewScope,
) -> Result<Vec<crate::models::progress::ProgressRecord>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT r.id, r.task_id, r.root_task_id, r.root_tag_ids, r.record_date, r.content,
                r.version, r.created_at, r.updated_at,
                t.title, t.parent_task_id,
                (t.id IS NULL OR t.deleted_at IS NOT NULL) AS task_deleted
         FROM task_progress_records r
         LEFT JOIN tasks t ON t.id = r.task_id
         WHERE r.is_deleted = 0 AND r.record_date BETWEEN ?1 AND ?2
         ORDER BY r.record_date DESC, r.created_at DESC, r.id DESC",
    )?;
    let rows = stmt
        .query_map(params![scope.start_date, scope.end_date], |row| {
            let tag_raw: String = row.get(3)?;
            let task_deleted: bool = row.get::<_, i32>(11)? != 0;
            Ok((
                crate::models::progress::ProgressRecord {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    root_task_id: row.get(2)?,
                    root_tag_ids: serde_json::from_str(&tag_raw).unwrap_or_default(),
                    record_date: row.get(4)?,
                    content: row.get(5)?,
                    version: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    task_title: if task_deleted { None } else { row.get(9)? },
                    task_deleted,
                    is_subtask: row.get::<_, Option<String>>(10)?.is_some(),
                },
                task_deleted,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows
        .into_iter()
        .filter(|(record, _)| tags_match(&record.root_tag_ids, &scope.tag_ids))
        .map(|(record, _)| record)
        .collect())
}

pub fn load_events_for_review(
    conn: &Connection,
    scope: &ReviewScope,
) -> Result<Vec<TaskStateEvent>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.task_id, e.root_task_id, e.transition, e.occurred_at, e.occurred_utc,
                e.local_date, e.tz_offset, e.source, e.title_snapshot, e.root_tag_ids,
                (t.id IS NULL OR t.deleted_at IS NOT NULL) AS task_deleted
         FROM task_state_events e
         LEFT JOIN tasks t ON t.id = e.task_id
         WHERE e.local_date BETWEEN ?1 AND ?2
         ORDER BY e.id DESC",
    )?;
    let rows = stmt
        .query_map(params![scope.start_date, scope.end_date], |row| {
            let tag_raw: String = row.get(10)?;
            Ok(TaskStateEvent {
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
                root_tag_ids: serde_json::from_str(&tag_raw).unwrap_or_default(),
                task_deleted: row.get::<_, i32>(11)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows
        .into_iter()
        .filter(|event| tags_match(&event.root_tag_ids, &scope.tag_ids))
        .collect())
}

/// 程序计算事实:完成/重开按事件流去重,根/子分列,覆盖状态可见
pub fn get_review_facts(conn: &Connection, scope: &ReviewScope) -> Result<ReviewFacts, AppError> {
    let events = load_events_in_range(conn, scope)?;

    // 每任务最近一次 complete/reopen 决定本期口径
    use std::collections::HashMap;
    let mut latest: HashMap<String, (&EventRow, u8)> = HashMap::new(); // value: (row, seq)
    let mut suspended_count = 0i64;
    let mut resumed_count = 0i64;
    let mut abandoned_count = 0i64;
    let mut restored_count = 0i64;

    for (seq, row) in events.iter().enumerate() {
        match row.transition.as_str() {
            "complete" | "reopen" => {
                latest.insert(row.task_id.clone(), (row, seq as u8));
            }
            "suspend" => suspended_count += 1,
            "resume" => resumed_count += 1,
            "abandon" => abandoned_count += 1,
            "restore" => restored_count += 1,
            _ => {}
        }
    }

    let mut completed_root = Vec::new();
    let mut completed_subtask = Vec::new();
    let mut completed_then_reopened = Vec::new();
    for (task_id, (row, _)) in &latest {
        let fact = TaskFact {
            task_id: task_id.clone(),
            title: row.title.clone(),
            is_root: row.root_task_id == *task_id,
            occurred_at: row.occurred_at.clone(),
            task_deleted: row.task_deleted,
        };
        match row.transition.as_str() {
            "complete" => {
                if fact.is_root {
                    completed_root.push(fact);
                } else {
                    completed_subtask.push(fact);
                }
            }
            "reopen" => completed_then_reopened.push(fact),
            _ => {}
        }
    }
    completed_root.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at));
    completed_subtask.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at));
    completed_then_reopened.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at));

    let record_count = load_records_in_range(conn, scope)?.len() as i64;

    let coverage = history_repo::coverage_info(conn)?;
    let coverage_status =
        history_repo::coverage_status_for(&scope.start_date, &scope.end_date, &coverage);

    let today = Local::now().format("%Y-%m-%d").to_string();
    let event_cutoff_at = if scope.end_date >= today {
        now_local()
    } else {
        format!("{} 23:59:59", scope.end_date)
    };

    Ok(ReviewFacts {
        period_kind: scope.kind.clone(),
        period_start: scope.start_date.clone(),
        period_end: scope.end_date.clone(),
        tag_ids: scope.tag_ids.clone(),
        event_cutoff_at,
        prepared_at: now_local(),
        timezone_offset: Local::now().format("%:z").to_string(),
        completed_root,
        completed_subtask,
        completed_then_reopened,
        suspended_count,
        resumed_count,
        abandoned_count,
        restored_count,
        record_count,
        coverage,
        coverage_status,
    })
}

/// 范围内材料分页浏览(kind: records / events)
pub fn list_material(
    conn: &Connection,
    scope: &ReviewScope,
    material_kind: &str,
    page: i64,
    page_size: i64,
) -> Result<crate::models::progress::ReviewMaterialPage, AppError> {
    let page = page.max(1);
    let page_size = page_size.clamp(1, 100);
    if material_kind == "events" {
        let events = load_events_for_review(conn, scope)?;
        let total = events.len() as i64;
        let items = events
            .into_iter()
            .skip(((page - 1) * page_size) as usize)
            .take(page_size as usize)
            .collect();
        Ok(crate::models::progress::ReviewMaterialPage::Events(
            crate::models::progress::StateEventPage {
                items,
                total,
                page,
                page_size,
            },
        ))
    } else {
        let records = load_records_in_range(conn, scope)?;
        let total = records.len() as i64;
        let items = records
            .into_iter()
            .skip(((page - 1) * page_size) as usize)
            .take(page_size as usize)
            .collect();
        Ok(crate::models::progress::ReviewMaterialPage::Records(
            ProgressPage {
                items,
                total,
                page,
                page_size,
            },
        ))
    }
}

const SOURCE_FIELDS: &str = "id, scope_key, period_kind, period_start, period_end, tag_ids,
    manual_text, ai_sections, ai_model_snapshot, event_cutoff_at, prepared_at,
    prepared_at_local_date, timezone_offset, coverage_note, source_refs, revision,
    created_at, updated_at";

fn row_to_saved_review(row: &rusqlite::Row) -> rusqlite::Result<SavedReview> {
    Ok(SavedReview {
        id: row.get("id")?,
        scope_key: row.get("scope_key")?,
        period_kind: row.get("period_kind")?,
        period_start: row.get("period_start")?,
        period_end: row.get("period_end")?,
        tag_ids: serde_json::from_str(&row.get::<_, String>("tag_ids")?).unwrap_or_default(),
        manual_text: row.get("manual_text")?,
        ai_sections: row
            .get::<_, Option<String>>("ai_sections")?
            .and_then(|s| serde_json::from_str(&s).ok()),
        ai_model_snapshot: row.get("ai_model_snapshot")?,
        event_cutoff_at: row.get("event_cutoff_at")?,
        prepared_at: row.get("prepared_at")?,
        prepared_at_local_date: row.get("prepared_at_local_date")?,
        timezone_offset: row.get("timezone_offset")?,
        coverage_note: row.get("coverage_note")?,
        revision: row.get("revision")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        source_status: Vec::new(),
    })
}

/// 读取保存稿并实时计算来源可用性(来源删除后文稿保留、来源标记不可用)
pub fn get_review(conn: &Connection, scope: &ReviewScope) -> Result<Option<SavedReview>, AppError> {
    let result = conn.query_row(
        &format!(
            "SELECT {} FROM period_reviews WHERE scope_key = ?1 AND is_deleted = 0",
            SOURCE_FIELDS
        ),
        params![scope.scope_key],
        |row| row_to_saved_review(row),
    );
    let mut review = match result {
        Ok(review) => review,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(AppError::Database(e)),
    };
    review.source_status = compute_source_status(conn, &review.id)?;
    Ok(Some(review))
}

fn compute_source_status(conn: &Connection, review_id: &str) -> Result<Vec<ReviewSourceStatus>, AppError> {
    let refs_raw: Option<String> = conn.query_row(
        "SELECT source_refs FROM period_reviews WHERE id = ?1",
        params![review_id],
        |row| row.get(0),
    )?;
    let Some(refs_raw) = refs_raw else {
        return Ok(Vec::new());
    };
    let refs = serde_json::from_str::<serde_json::Value>(&refs_raw).unwrap_or(serde_json::Value::Null);
    let Some(list) = refs.as_array() else {
        return Ok(Vec::new());
    };
    let mut status = Vec::new();
    for item in list {
        let kind = item.get("kind").and_then(|v| v.as_str()).unwrap_or("");
        let entity_id = item.get("entity_id").and_then(|v| v.as_str()).unwrap_or("");
        let ref_id = item.get("ref_id").and_then(|v| v.as_str()).unwrap_or("");
        let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("");
        if entity_id.is_empty() {
            continue;
        }
        let available = match kind {
            "record" => conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM task_progress_records WHERE id = ?1 AND is_deleted = 0)",
                    params![entity_id],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap_or(0)
                == 1,
            "task" => conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?1 AND deleted_at IS NULL)",
                    params![entity_id],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap_or(0)
                == 1,
            _ => false,
        };
        status.push(ReviewSourceStatus {
            kind: kind.to_string(),
            ref_id: ref_id.to_string(),
            entity_id: entity_id.to_string(),
            title: title.to_string(),
            available,
        });
    }
    Ok(status)
}

/// 每范围一份当前稿:upsert by scope_key;期望版本不符即冲突,重复操作走回执幂等
pub fn save_review(conn: &Connection, req: &SaveReviewRequest) -> Result<(SavedReview, bool), AppError> {
    let scope = compute_scope(&req.period_kind, &req.start_date, &req.tag_ids)?;

    let manual_text = req.manual_text.clone().unwrap_or_default();
    if manual_text.chars().count() > MAX_MANUAL_TEXT_CHARS {
        return Err(AppError::Validation(format!(
            "手写回顾至多 {} 字",
            MAX_MANUAL_TEXT_CHARS
        )));
    }

    let ai_json = req
        .ai
        .as_ref()
        .map(|ai| serde_json::to_string(&ai.sections).unwrap_or_default());
    let hash_input = format!(
        "{}|{}|{}|{:?}|{:?}",
        scope.scope_key, req.expected_revision, manual_text, ai_json, req.operation_id
    );
    let content_hash = progress_repo::check_receipt_hash(&hash_input);

    let tx = conn.unchecked_transaction()?;

    if let Some(op) = req.operation_id.as_deref() {
        if !op.is_empty() {
            if let Some(result_json) = progress_repo::check_receipt(&tx, op, &content_hash)? {
                if let Ok(review) = serde_json::from_str::<SavedReview>(&result_json) {
                    tx.commit()?;
                    return Ok((review, true));
                }
            }
        }
    }

    let existing = {
        let result = tx.query_row(
            "SELECT revision, is_deleted FROM period_reviews WHERE scope_key = ?1",
            params![scope.scope_key],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i32>(1)?)),
        );
        match result {
            Ok(pair) => Some(pair),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(AppError::Database(e)),
        }
    };

    let (review_id, new_revision) = match existing {
        None => {
            if req.expected_revision != 0 {
                return Err(AppError::Validation(
                    "回顾文稿版本不符,请刷新后重试".to_string(),
                ));
            }
            (Uuid::new_v4().to_string(), 1i64)
        }
        Some((revision, _is_deleted)) => {
            if req.expected_revision != revision {
                return Err(AppError::Validation(format!(
                    "回顾文稿已被修改(当前版本 {}),请刷新后重试",
                    revision
                )));
            }
            let id: String = tx.query_row(
                "SELECT id FROM period_reviews WHERE scope_key = ?1",
                params![scope.scope_key],
                |row| row.get(0),
            )?;
            (id, revision + 1)
        }
    };

    let now = now_local();
    let upsert_sql = "
        INSERT INTO period_reviews
            (id, scope_key, period_kind, period_start, period_end, tag_ids, manual_text,
             ai_sections, ai_model_snapshot, event_cutoff_at, prepared_at,
             prepared_at_local_date, timezone_offset, coverage_note, source_refs,
             revision, is_deleted, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 0, ?17, ?17)
        ON CONFLICT(scope_key) DO UPDATE SET
            manual_text = excluded.manual_text,
            ai_sections = excluded.ai_sections,
            ai_model_snapshot = excluded.ai_model_snapshot,
            event_cutoff_at = excluded.event_cutoff_at,
            prepared_at = excluded.prepared_at,
            prepared_at_local_date = excluded.prepared_at_local_date,
            timezone_offset = excluded.timezone_offset,
            coverage_note = excluded.coverage_note,
            source_refs = excluded.source_refs,
            revision = excluded.revision,
            is_deleted = 0,
            updated_at = excluded.updated_at";

    let ai = req.ai.as_ref();
    tx.execute(
        upsert_sql,
        rusqlite::params![
            review_id,
            scope.scope_key,
            scope.kind,
            scope.start_date,
            scope.end_date,
            serde_json::to_string(&scope.tag_ids).unwrap_or_else(|_| "[]".into()),
            manual_text,
            ai_json,
            ai.map(|a| a.model_snapshot.clone()),
            ai.map(|a| a.event_cutoff_at.clone()),
            ai.map(|a| a.prepared_at.clone()),
            ai.map(|a| a.prepared_at_local_date.clone()),
            ai.map(|a| a.timezone_offset.clone()),
            ai.map(|a| a.coverage_note.clone()),
            ai.map(|a| a.source_refs.to_string()),
            new_revision,
            now,
        ],
    )?;

    let saved = tx
        .query_row(
            &format!(
                "SELECT {} FROM period_reviews WHERE scope_key = ?1 AND is_deleted = 0",
                SOURCE_FIELDS
            ),
            params![scope.scope_key],
            |row| row_to_saved_review(row),
        )
        .map_err(AppError::Database)?;

    if let Some(op) = req.operation_id.as_deref() {
        if !op.is_empty() {
            let result = serde_json::to_string(&saved).unwrap_or_default();
            progress_repo::write_receipt(
                &tx,
                op,
                "period_review",
                &saved.id,
                &content_hash,
                &result,
            )?;
        }
    }

    tx.commit()?;
    Ok((saved, false))
}

/// 删除保存稿:软删除并递增版本,晚到的旧保存响应不能恢复
pub fn delete_review(conn: &Connection, scope: &ReviewScope) -> Result<(), AppError> {
    let affected = conn.execute(
        "UPDATE period_reviews
         SET is_deleted = 1, revision = revision + 1, updated_at = ?2
         WHERE scope_key = ?1 AND is_deleted = 0",
        params![scope.scope_key, now_local()],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!(
            "该范围没有已保存的回顾: {}",
            scope.scope_key
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use crate::db::task_repo;
    use crate::models::progress::CreateProgressRequest;
    use crate::models::task::CreateTaskRequest;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    fn today() -> String {
        Local::now().format("%Y-%m-%d").to_string()
    }

    fn create_task(conn: &Connection, title: &str, parent: Option<String>) -> String {
        task_repo::create(
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
        .unwrap()
        .id
    }

    fn complete(conn: &Connection, id: &str) {
        task_repo::update(
            conn,
            id,
            crate::models::task::UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
    }

    fn reopen(conn: &Connection, id: &str) {
        task_repo::update(
            conn,
            id,
            crate::models::task::UpdateTaskRequest {
                is_completed: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
    }

    #[test]
    fn week_scope_normalizes_to_monday() {
        // 2026-10-31 是周六;自然周应为 2026-10-26(周一)~2026-11-01(周日)
        let scope = compute_scope("week", "2026-10-31", &[]).unwrap();
        assert_eq!(scope.start_date, "2026-10-26");
        assert_eq!(scope.end_date, "2026-11-01");
        assert_eq!(scope.scope_key, "week:2026-10-26");

        // 周一传入保持不变
        let scope = compute_scope("week", "2026-10-26", &[]).unwrap();
        assert_eq!(scope.start_date, "2026-10-26");

        let day = compute_scope("day", "2026-10-31", &["b", "a", "b"].map(|t| t.to_string())).unwrap();
        assert_eq!(day.start_date, "2026-10-31");
        assert_eq!(day.tag_ids, vec!["a", "b"]);
        assert_eq!(day.scope_key, "day:2026-10-31|a,b");
    }

    #[test]
    fn facts_dedup_complete_and_reopen() {
        let conn = setup();
        let root = create_task(&conn, "根任务", None);
        let child = create_task(&conn, "子任务", Some(root.clone()));
        let other = create_task(&conn, "另一个", None);

        complete(&conn, &root);
        complete(&conn, &child);
        complete(&conn, &other);
        // 完成后重新打开:不算本期完成,进重开列表
        reopen(&conn, &other);
        // 再次完成:同一任务只计一次
        complete(&conn, &other);

        let scope = compute_scope("day", &today(), &[]).unwrap();
        let facts = get_review_facts(&conn, &scope).unwrap();
        assert_eq!(facts.completed_root.len(), 2); // root + other
        assert_eq!(facts.completed_subtask.len(), 1); // child
        assert!(facts.completed_then_reopened.is_empty());
    }

    #[test]
    fn facts_reopened_not_completed() {
        let conn = setup();
        let root = create_task(&conn, "任务", None);
        complete(&conn, &root);
        reopen(&conn, &root);

        let scope = compute_scope("day", &today(), &[]).unwrap();
        let facts = get_review_facts(&conn, &scope).unwrap();
        assert!(facts.completed_root.is_empty());
        assert_eq!(facts.completed_then_reopened.len(), 1);
    }

    #[test]
    fn tag_filter_uses_snapshot() {
        let conn = setup();
        let tag_id: String = conn
            .query_row(
                "INSERT INTO tags (id, name, color, icon, sort_order, created_at, updated_at)
                 VALUES ('tag-1', '工作', '#7C72F6', 'tag', 0, datetime('now'), datetime('now'))
                 RETURNING id",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let task = create_task(&conn, "带标签", None);
        conn.execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task, tag_id],
        )
        .unwrap();
        complete(&conn, &task);

        // 按标签筛选:命中
        let scope = compute_scope("day", &today(), &[tag_id.clone()]).unwrap();
        let facts = get_review_facts(&conn, &scope).unwrap();
        assert_eq!(facts.completed_root.len(), 1);

        // 不含该标签的筛选:不命中
        let scope = compute_scope("day", &today(), &["other-tag".to_string()]).unwrap();
        let facts = get_review_facts(&conn, &scope).unwrap();
        assert_eq!(facts.completed_root.len(), 0);
    }

    #[test]
    fn saved_review_upsert_and_revision_conflict() {
        let conn = setup();
        let save = |manual: &str, expected: i64, op: Option<&str>| SaveReviewRequest {
            period_kind: "day".to_string(),
            start_date: today(),
            tag_ids: vec![],
            manual_text: Some(manual.to_string()),
            ai: None,
            expected_revision: expected,
            operation_id: op.map(|o| o.to_string()),
        };

        let (first, already) = save_review(&conn, &save("第一版", 0, Some("op-1"))).unwrap();
        assert!(!already);
        assert_eq!(first.revision, 1);
        assert_eq!(first.manual_text, "第一版");

        // 同操作重试:幂等返回
        let (replay, already) = save_review(&conn, &save("第一版", 0, Some("op-1"))).unwrap();
        assert!(already);
        assert_eq!(replay.id, first.id);

        // 更新:期望版本 1 → 版本 2
        let (second, _) = save_review(&conn, &save("第二版", 1, None)).unwrap();
        assert_eq!(second.revision, 2);

        // 旧版本写入:冲突
        let err = save_review(&conn, &save("旧响应", 1, None)).unwrap_err();
        assert!(err.to_string().contains("已被修改"));

        // 删除后旧保存响应不能恢复
        let scope = compute_scope("day", &today(), &[]).unwrap();
        delete_review(&conn, &scope).unwrap();
        assert!(get_review(&conn, &scope).unwrap().is_none());
        let err = save_review(&conn, &save("晚到", 2, None)).unwrap_err();
        assert!(err.to_string().contains("已被修改"));
    }

    #[test]
    fn records_in_range_and_material_pages() {
        let conn = setup();
        let task = create_task(&conn, "任务", None);
        let yesterday = (Local::now().date_naive() - Duration::days(1))
            .format("%Y-%m-%d")
            .to_string();

        // 今天一条 + 补记昨天一条
        progress_repo::create_progress_record(
            &conn,
            CreateProgressRequest {
                task_id: task.clone(),
                content: "今天的进展".to_string(),
                record_date: today(),
                operation_id: None,
            },
        )
        .unwrap();
        progress_repo::create_progress_record(
            &conn,
            CreateProgressRequest {
                task_id: task,
                content: "昨天的进展(今天补记)".to_string(),
                record_date: yesterday.clone(),
                operation_id: None,
            },
        )
        .unwrap();

        // 昨天的回顾:补记按记录日期归属昨天
        let scope = compute_scope("day", &yesterday, &[]).unwrap();
        let records = load_records_in_range(&conn, &scope).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].content, "昨天的进展(今天补记)");
        // 创建时间仍是今天,可辨识补记
        assert!(records[0].created_at.starts_with(&today()));

        let page = list_material(&conn, &scope, "records", 1, 10).unwrap();
        let total = match page {
            crate::models::progress::ReviewMaterialPage::Records(p) => p.total,
            crate::models::progress::ReviewMaterialPage::Events(p) => p.total,
        };
        assert_eq!(total, 1);
    }
}
