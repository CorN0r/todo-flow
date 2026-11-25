//! 从备份找回:把备份里有选择的内容并入当前库。
//!
//! 与旧的整库导入不同,这里只带回用户勾选的任务、它们的子任务,以及这些任务
//! 依赖的标签、提醒、桌面便签、附件记录和进展记录;一次找回在一个事务里完成。
//! 本机上仍有效的进展记录和状态事件不会被改写;随任务删除而被清空正文的记录
//! 按备份恢复,所以找回一个误删的任务时,它的历史也一起回来。

use std::collections::{HashMap, HashSet};

use rusqlite::types::Value as SqlValue;
use rusqlite::{params_from_iter, Connection};
use serde::Serialize;
use serde_json::json;

use crate::db::{history_repo, sync_repo, tag_repo};
use crate::error::AppError;

/// 任务的全部内容字段。同步元数据不在其中:新任务取默认值,已有任务保留本机的。
const TASK_COLS: [&str; 19] = [
    "id",
    "title",
    "description",
    "is_completed",
    "is_archived",
    "is_suspended",
    "is_abandoned",
    "is_pinned",
    "priority",
    "due_date",
    "reminder",
    "recurrence",
    "tag_id",
    "parent_task_id",
    "sort_order",
    "my_day_date",
    "source",
    "created_at",
    "updated_at",
];
/// `parent_task_id` 在 TASK_COLS 中的位置
const TASK_PARENT_AT: usize = 13;
const TAG_COLS: [&str; 8] = [
    "id",
    "name",
    "color",
    "icon",
    "sort_order",
    "parent_tag_id",
    "created_at",
    "updated_at",
];
const REMINDER_COLS: [&str; 6] = ["id", "task_id", "offset", "reminder_time", "reminded", "created_at"];
const NOTE_COLS: [&str; 10] = [
    "task_id",
    "x",
    "y",
    "width",
    "height",
    "always_on_top",
    "style",
    "collapsed",
    "created_at",
    "updated_at",
];
const ATTACHMENT_COLS: [&str; 8] = [
    "id",
    "task_id",
    "original_name",
    "storage_name",
    "mime_type",
    "file_size",
    "thumbnail_name",
    "created_at",
];
const RECORD_COLS: [&str; 12] = [
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
];
const EVENT_COLS: [&str; 11] = [
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
];
const REVIEW_COLS: [&str; 19] = [
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
];
/// `is_deleted` 在 REVIEW_COLS 中的位置
const REVIEW_DELETED_AT: usize = 16;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PreviewTask {
    pub id: String,
    pub title: String,
    pub parent_task_id: Option<String>,
    /// 当前库中已有这个任务(未被删除)
    pub exists_locally: bool,
    pub is_completed: bool,
    pub due_date: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct BackupPreview {
    /// 父任务在前、子任务在后的全部任务
    pub tasks: Vec<PreviewTask>,
    /// 备份里是否有未删除的日／周回顾文稿
    pub has_reviews: bool,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
pub struct RecoverCounts {
    /// 当前库中没有、被新加入的任务数(含为保持父子关系一并带回的上级)
    pub recovered: usize,
    /// 当前库中已有、被备份版本替换的任务数
    pub replaced: usize,
    /// 被恢复的日／周回顾文稿数(新加入的与本机已删除的)
    pub reviews_restored: usize,
}

type Row = Vec<SqlValue>;

fn cols(list: &[&str]) -> String {
    list.join(", ")
}

fn placeholders(count: usize) -> String {
    vec!["?"; count].join(",")
}

fn read_rows(
    conn: &Connection,
    sql: &str,
    params: &[&dyn rusqlite::types::ToSql],
) -> Result<Vec<Row>, AppError> {
    let mut stmt = conn.prepare(sql)?;
    let width = stmt.column_count();
    let mut rows = stmt.query(params)?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        out.push(
            (0..width)
                .map(|i| row.get(i))
                .collect::<rusqlite::Result<Row>>()?,
        );
    }
    Ok(out)
}

fn insert(conn: &Connection, table: &str, list: &[&str], row: &Row) -> Result<(), AppError> {
    conn.execute(
        &format!(
            "INSERT INTO {} ({}) VALUES ({})",
            table,
            cols(list),
            placeholders(list.len())
        ),
        params_from_iter(row.iter()),
    )?;
    Ok(())
}

/// 按 `ON CONFLICT(主键)` 整行覆盖
fn upsert(conn: &Connection, table: &str, list: &[&str], row: &Row) -> Result<(), AppError> {
    let assignments: Vec<String> = list
        .iter()
        .skip(1)
        .map(|name| format!("{} = excluded.{}", name, name))
        .collect();
    conn.execute(
        &format!(
            "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
            table,
            cols(list),
            placeholders(list.len()),
            list[0],
            assignments.join(", ")
        ),
        params_from_iter(row.iter()),
    )?;
    Ok(())
}

fn text(value: &SqlValue) -> String {
    match value {
        SqlValue::Text(text) => text.clone(),
        _ => String::new(),
    }
}

fn is_flag_set(value: &SqlValue) -> bool {
    matches!(value, SqlValue::Integer(flag) if *flag != 0)
}

fn live_task_ids(conn: &Connection) -> Result<HashSet<String>, AppError> {
    Ok(read_rows(conn, "SELECT id FROM tasks WHERE deleted_at IS NULL", &[])?
        .iter()
        .map(|row| text(&row[0]))
        .collect())
}

/// `column IN (?,?,...)`。列表为空时恒假,调用方不必再判空。
fn in_list(column: &str, ids: &[String]) -> (String, Vec<String>) {
    if ids.is_empty() {
        ("1 = 0".to_string(), Vec::new())
    } else {
        (
            format!("{} IN ({})", column, placeholders(ids.len())),
            ids.to_vec(),
        )
    }
}

fn as_params(ids: &[String]) -> Vec<&dyn rusqlite::types::ToSql> {
    ids.iter()
        .map(|id| id as &dyn rusqlite::types::ToSql)
        .collect()
}

/// 读出备份里与这些任务相关的行,按 `row[1]`(task_id)分组。第二列必须是 task_id。
fn group_by_task(
    backup: &Connection,
    sql: &str,
    ids: &[String],
) -> Result<HashMap<String, Vec<Row>>, AppError> {
    let mut grouped: HashMap<String, Vec<Row>> = HashMap::new();
    for row in read_rows(backup, sql, &as_params(ids))? {
        grouped.entry(text(&row[1])).or_default().push(row);
    }
    Ok(grouped)
}

/// 预览备份里的任务,并标出哪些是当前库中没有的。不写入任何数据。
pub fn preview(current: &Connection, backup: &Connection) -> Result<BackupPreview, AppError> {
    let local = live_task_ids(current)?;
    let rows = read_rows(
        backup,
        "SELECT id, title, parent_task_id, is_completed, due_date, source
         FROM tasks WHERE deleted_at IS NULL
         ORDER BY CASE WHEN parent_task_id IS NULL THEN 0 ELSE 1 END, sort_order ASC, created_at ASC",
        &[],
    )?;
    let optional = |value: &SqlValue| match value {
        SqlValue::Null => None,
        value => Some(text(value)),
    };
    let tasks = rows
        .iter()
        .map(|row| PreviewTask {
            id: text(&row[0]),
            title: text(&row[1]),
            parent_task_id: optional(&row[2]),
            exists_locally: local.contains(&text(&row[0])),
            is_completed: is_flag_set(&row[3]),
            due_date: optional(&row[4]),
            source: optional(&row[5]),
        })
        .collect();
    let live_reviews: i64 = backup
        .query_row(
            "SELECT COUNT(*) FROM period_reviews WHERE is_deleted = 0",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(BackupPreview {
        tasks,
        has_reviews: live_reviews > 0,
    })
}

// ─── 标签 ───

/// 确保一个备份里的标签在本库可用,返回它在本库里的 ID——本库已有同名标签时
/// 是那个同名标签的 ID,而不是备份里的。备份里找不到这个标签时返回 None。
fn ensure_tag(
    tx: &Connection,
    backup_tags: &HashMap<String, Row>,
    tag_map: &mut HashMap<String, Option<String>>,
    tag_id: &str,
    depth: usize,
) -> Result<Option<String>, AppError> {
    if let Some(mapped) = tag_map.get(tag_id) {
        return Ok(mapped.clone());
    }
    // 先占位:父子标签互相引用时不会无限递归
    tag_map.insert(tag_id.to_string(), None);
    if depth > 16 {
        return Ok(None);
    }
    let resolved = resolve_tag(tx, backup_tags, tag_map, tag_id, depth)?;
    tag_map.insert(tag_id.to_string(), resolved.clone());
    Ok(resolved)
}

fn resolve_tag(
    tx: &Connection,
    backup_tags: &HashMap<String, Row>,
    tag_map: &mut HashMap<String, Option<String>>,
    tag_id: &str,
    depth: usize,
) -> Result<Option<String>, AppError> {
    let live: Option<String> = tx
        .query_row(
            "SELECT id FROM tags WHERE id = ?1 AND deleted_at IS NULL",
            [tag_id],
            |row| row.get(0),
        )
        .ok();
    if live.is_some() {
        return Ok(Some(tag_id.to_string()));
    }
    let Some(source) = backup_tags.get(tag_id) else {
        return Ok(None);
    };
    // 本库已有同名标签(例如删除后重建过):并入它,不制造重名
    let same_name: Option<String> = tx
        .query_row(
            "SELECT id FROM tags WHERE name = ?1 AND deleted_at IS NULL LIMIT 1",
            [&text(&source[1])],
            |row| row.get(0),
        )
        .ok();
    if let Some(local_id) = same_name {
        return Ok(Some(local_id));
    }

    let mut row = source.clone();
    let parent = match &row[5] {
        SqlValue::Null => None,
        parent => ensure_tag(tx, backup_tags, tag_map, &text(parent), depth + 1)?,
    };
    row[5] = parent.map(SqlValue::Text).unwrap_or(SqlValue::Null);
    insert(tx, "tags", &TAG_COLS, &row)?;
    if let Ok(Some(tag)) = tag_repo::get_by_id(tx, tag_id) {
        sync_repo::record_local_operation(tx, "tag", tag_id, "create", json!({ "tag": tag }))?;
    }
    Ok(Some(tag_id.to_string()))
}

// ─── 任务范围 ───

struct BackupTask {
    parent_task_id: Option<String>,
    row: Row,
}

/// 算出要带回的任务:勾选的任务、它们在备份里的全部下级,以及本库缺失的上级。
/// 返回顺序保证上级在前。
fn collect_tasks(
    local_any: &HashSet<String>,
    backup_tasks: &HashMap<String, BackupTask>,
    selected: &[String],
) -> Vec<String> {
    fn push(
        id: &str,
        local_any: &HashSet<String>,
        backup_tasks: &HashMap<String, BackupTask>,
        in_set: &mut HashSet<String>,
        order: &mut Vec<String>,
    ) {
        if in_set.contains(id) || !backup_tasks.contains_key(id) {
            return;
        }
        // 上级在本库不存在时一并带回,否则子任务无处挂靠
        if let Some(parent) = backup_tasks[id].parent_task_id.as_deref() {
            if !local_any.contains(parent) {
                push(parent, local_any, backup_tasks, in_set, order);
            }
        }
        in_set.insert(id.to_string());
        order.push(id.to_string());
    }

    let mut in_set: HashSet<String> = HashSet::new();
    let mut order: Vec<String> = Vec::new();
    for id in selected {
        push(id, local_any, backup_tasks, &mut in_set, &mut order);
    }
    // 再把已入选任务的全部下级带上(任务最多两层,循环即可)
    loop {
        let children: Vec<String> = backup_tasks
            .values()
            .filter(|task| {
                task.parent_task_id
                    .as_ref()
                    .is_some_and(|parent| in_set.contains(parent) && !in_set.contains(&text(&task.row[0])))
            })
            .map(|task| text(&task.row[0]))
            .collect();
        if children.is_empty() {
            break;
        }
        for child in &children {
            in_set.insert(child.clone());
            order.push(child.clone());
        }
    }
    order
}

// ─── 日／周回顾 ───

/// 恢复日／周回顾文稿。同范围不同文稿、同 ID 但本机仍有效且内容不同,都视为
/// 冲突并拒绝整次找回;本机已删除的文稿和新文稿用备份版本恢复。
fn restore_reviews(tx: &Connection, backup: &Connection) -> Result<usize, AppError> {
    let rows = read_rows(
        backup,
        &format!(
            "SELECT {} FROM period_reviews WHERE is_deleted = 0",
            cols(&REVIEW_COLS)
        ),
        &[],
    )?;
    let select_local = format!(
        "SELECT {} FROM period_reviews WHERE id = ?1",
        cols(&REVIEW_COLS)
    );
    let mut restored = 0;
    for row in rows {
        let id = text(&row[0]);
        let scope_key = text(&row[1]);
        let by_scope: Option<String> = tx
            .query_row(
                "SELECT id FROM period_reviews WHERE scope_key = ?1",
                [&scope_key],
                |r| r.get(0),
            )
            .ok();
        if by_scope.as_ref().is_some_and(|local_id| *local_id != id) {
            return Err(AppError::Validation(format!(
                "备份与本机存在同一回顾范围的不同文稿({}),已拒绝找回",
                scope_key
            )));
        }
        let local: Option<Row> = tx
            .query_row(&select_local, [&id], |r| {
                (0..REVIEW_COLS.len()).map(|i| r.get(i)).collect()
            })
            .ok();
        match local {
            None => {
                insert(tx, "period_reviews", &REVIEW_COLS, &row)?;
                restored += 1;
            }
            Some(existing) if is_flag_set(&existing[REVIEW_DELETED_AT]) => {
                upsert(tx, "period_reviews", &REVIEW_COLS, &row)?;
                restored += 1;
            }
            Some(existing) => {
                if existing != row {
                    return Err(AppError::Validation(format!(
                        "备份与本机存在相同 ID 但内容不同的回顾文稿({}),已拒绝找回",
                        scope_key
                    )));
                }
            }
        }
    }
    Ok(restored)
}

fn recover_in_tx(
    tx: &Connection,
    backup: &Connection,
    selected: &[String],
    include_reviews: bool,
) -> Result<RecoverCounts, AppError> {
    let local_live = live_task_ids(tx)?;
    let local_any: HashSet<String> = read_rows(tx, "SELECT id FROM tasks", &[])?
        .iter()
        .map(|row| text(&row[0]))
        .collect();
    let backup_tasks: HashMap<String, BackupTask> = read_rows(
        backup,
        &format!(
            "SELECT {} FROM tasks WHERE deleted_at IS NULL",
            cols(&TASK_COLS)
        ),
        &[],
    )?
    .into_iter()
    .map(|row| {
        let parent_task_id = match &row[TASK_PARENT_AT] {
            SqlValue::Null => None,
            parent => Some(text(parent)),
        };
        let id = text(&row[0]);
        (id, BackupTask { parent_task_id, row })
    })
    .collect();

    let order = collect_tasks(&local_any, &backup_tasks, selected);
    let (task_filter, ids) = in_list("task_id", &order);
    // 本库是否已有某个主键 → 0 表示仍有效,1 表示已删除
    let deleted_flag = |table: &str, id: &SqlValue| -> Result<Option<i64>, AppError> {
        let sql = format!("SELECT is_deleted FROM {} WHERE id = ?1", table);
        Ok(tx.query_row(&sql, [id], |r| r.get(0)).ok())
    };

    // 只带所选任务用到的标签;本库没有的按备份重建,同名的并入本库的
    let links: Vec<(String, String)> = read_rows(
        backup,
        &format!(
            "SELECT task_id, tag_id FROM task_tags WHERE {}",
            task_filter
        ),
        &as_params(&ids),
    )?
    .into_iter()
    .map(|row| (text(&row[0]), text(&row[1])))
    .collect();
    let backup_tags: HashMap<String, Row> = read_rows(
        backup,
        &format!(
            "SELECT {} FROM tags WHERE deleted_at IS NULL",
            cols(&TAG_COLS)
        ),
        &[],
    )?
    .into_iter()
    .map(|row| (text(&row[0]), row))
    .collect();
    let mut tag_map: HashMap<String, Option<String>> = HashMap::new();

    let reminders = group_by_task(
        backup,
        &format!(
            "SELECT {} FROM task_reminders WHERE {}",
            cols(&REMINDER_COLS),
            task_filter
        ),
        &ids,
    )?;
    let notes: HashMap<String, Row> = read_rows(
        backup,
        &format!(
            "SELECT {} FROM task_notes WHERE {}",
            cols(&NOTE_COLS),
            task_filter
        ),
        &as_params(&ids),
    )?
    .into_iter()
    .map(|row| (text(&row[0]), row))
    .collect();
    let attachments = group_by_task(
        backup,
        &format!(
            "SELECT {} FROM attachments WHERE {}",
            cols(&ATTACHMENT_COLS),
            task_filter
        ),
        &ids,
    )?;
    let records = group_by_task(
        backup,
        &format!(
            "SELECT {} FROM task_progress_records WHERE {} AND is_deleted = 0",
            cols(&RECORD_COLS),
            task_filter
        ),
        &ids,
    )?;
    let events = group_by_task(
        backup,
        &format!(
            "SELECT {} FROM task_state_events WHERE {}",
            cols(&EVENT_COLS),
            task_filter
        ),
        &ids,
    )?;

    let mut counts = RecoverCounts::default();
    for id in &order {
        let task = &backup_tasks[id];
        let existed = local_live.contains(id);
        // 任务整体以备份为准(含软删除的行:找回即恢复为可见)
        upsert_plus_revive(tx, &task.row)?;

        // 标签关联以备份为准
        tx.execute("DELETE FROM task_tags WHERE task_id = ?1", [id])?;
        for (task_id, tag_id) in &links {
            if task_id == id {
                if let Some(mapped) = ensure_tag(tx, &backup_tags, &mut tag_map, tag_id, 0)? {
                    tx.execute(
                        "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                        [id, mapped.as_str()],
                    )?;
                }
            }
        }

        // 提醒以备份为准
        tx.execute("DELETE FROM task_reminders WHERE task_id = ?1", [id])?;
        for row in reminders.get(id).into_iter().flatten() {
            insert(tx, "task_reminders", &REMINDER_COLS, row)?;
        }

        // 桌面便签的位置与皮肤以备份为准
        if let Some(row) = notes.get(id) {
            tx.execute(
                &format!(
                    "INSERT OR REPLACE INTO task_notes ({}) VALUES ({})",
                    cols(&NOTE_COLS),
                    placeholders(NOTE_COLS.len())
                ),
                params_from_iter(row.iter()),
            )?;
        }

        // 附件记录:只补本机没有的
        for row in attachments.get(id).into_iter().flatten() {
            let known: Option<String> = tx
                .query_row("SELECT id FROM attachments WHERE id = ?1", [text(&row[0])], |r| {
                    r.get(0)
                })
                .ok();
            if known.is_none() {
                insert(tx, "attachments", &ATTACHMENT_COLS, row)?;
            }
        }

        // 进展记录:本机仍有效的不动;已删除的(例如随任务删除被清空正文)按备份恢复
        for row in records.get(id).into_iter().flatten() {
            match deleted_flag("task_progress_records", &row[0])? {
                None => {
                    insert(tx, "task_progress_records", &RECORD_COLS, row)?;
                }
                Some(1) => {
                    upsert(tx, "task_progress_records", &RECORD_COLS, row)?;
                }
                Some(_) => {}
            }
        }

        // 状态事件只增不改:主键是自增号,不同库之间会撞号,撞上就保留本机的
        for row in events.get(id).into_iter().flatten() {
            let known: Option<i64> = tx
                .query_row("SELECT id FROM task_state_events WHERE id = ?1", [&row[0]], |r| {
                    r.get(0)
                })
                .ok();
            if known.is_none() {
                insert(tx, "task_state_events", &EVENT_COLS, row)?;
            }
        }

        // 与界面写入走同一条同步记录
        if let Ok(Some(current)) = crate::db::task_repo::get_by_id(tx, id) {
            sync_repo::record_local_operation(
                tx,
                "task",
                id,
                if existed { "update" } else { "create" },
                json!({ "task": current }),
            )?;
        }

        if existed {
            counts.replaced += 1;
        } else {
            counts.recovered += 1;
        }
    }

    if include_reviews {
        counts.reviews_restored = restore_reviews(tx, backup)?;
    }
    if counts.recovered + counts.replaced > 0 {
        record_import_coverage_once(tx, counts.recovered + counts.replaced)?;
    }
    Ok(counts)
}

/// 回顾页据此把当天标为"含导入的当前任务状态"。同一天多次找回只记一条,
/// 重复找回不会改动任何数据。
fn record_import_coverage_once(tx: &Connection, tasks: usize) -> Result<(), AppError> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let recorded: i64 = tx.query_row(
        "SELECT COUNT(*) FROM task_history_coverage WHERE kind = 'import' AND start_date = ?1",
        [&today],
        |row| row.get(0),
    )?;
    if recorded > 0 {
        return Ok(());
    }
    history_repo::record_import_coverage(
        tx,
        &format!(
            "从备份找回 {} 个任务;导入的当前任务状态不代表本机当日活动",
            tasks
        ),
    )
}

/// 任务整行以备份为准,并把本机上软删除的行恢复为可见。同步元数据保留本机的。
fn upsert_plus_revive(tx: &Connection, row: &Row) -> Result<(), AppError> {
    let assignments: Vec<String> = TASK_COLS
        .iter()
        .skip(1)
        .map(|name| format!("{} = excluded.{}", name, name))
        .collect();
    tx.execute(
        &format!(
            "INSERT INTO tasks ({}, deleted_at) VALUES ({}, NULL)
             ON CONFLICT(id) DO UPDATE SET {}, deleted_at = NULL",
            cols(&TASK_COLS),
            placeholders(TASK_COLS.len()),
            assignments.join(", ")
        ),
        params_from_iter(row.iter()),
    )?;
    Ok(())
}

/// 把备份里勾选的任务找回当前库。整次执行在一个事务里:任何一步失败都不留下
/// 部分改动。`backup` 应当是一份已升级到当前结构的副本。
pub fn recover(
    current: &Connection,
    backup: &Connection,
    selected_ids: &[String],
    include_reviews: bool,
) -> Result<RecoverCounts, AppError> {
    let selected: Vec<String> = selected_ids
        .iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect();
    let tx = current.unchecked_transaction()?;
    let counts = recover_in_tx(&tx, backup, &selected, include_reviews)?;
    tx.commit()?;
    Ok(counts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrations, progress_repo, task_repo};
    use crate::models::progress::{CreateProgressRequest, UpdateProgressRequest};
    use crate::models::tag::CreateTagRequest;
    use crate::models::task::{CreateTaskRequest, TaskFilter, UpdateTaskRequest};
    use crate::models::task_reminder::CreateReminderRequest;

    fn fresh_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    /// 从 `origin` 分叉出一份"当初的备份":内容与此刻的 origin 完全一致
    fn fork(origin: &Connection) -> Connection {
        let dir = tempfile::tempdir().unwrap().keep();
        let path = dir.join("backup.db");
        origin
            .execute("VACUUM INTO ?1", [path.to_string_lossy().to_string()])
            .unwrap();
        let forked = Connection::open(&path).unwrap();
        forked.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        forked
    }

    fn add_task(conn: &Connection, title: &str, parent: Option<&str>, by_agent: bool) -> String {
        task_repo::create(
            conn,
            CreateTaskRequest {
                title: title.to_string(),
                description: Some(format!("{} 的描述", title)),
                tag_ids: None,
                parent_task_id: parent.map(str::to_string),
                due_date: Some("2026-12-01".to_string()),
                priority: Some(2),
                reminder: None,
                recurrence: None,
                my_day_date: None,
                source: by_agent.then(|| "agent".to_string()),
            },
        )
        .unwrap()
        .id
    }

    fn add_tag(conn: &Connection, name: &str, color: &str) -> String {
        tag_repo::create(
            conn,
            CreateTagRequest {
                name: name.to_string(),
                color: Some(color.to_string()),
                icon: None,
                parent_tag_id: None,
            },
        )
        .unwrap()
        .id
    }

    fn link(conn: &Connection, task_id: &str, tag_id: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            [task_id, tag_id],
        )
        .unwrap();
    }

    fn add_record(conn: &Connection, task_id: &str, content: &str, date: &str) -> String {
        progress_repo::create_progress_record(
            conn,
            CreateProgressRequest {
                task_id: task_id.to_string(),
                content: content.to_string(),
                record_date: date.to_string(),
                operation_id: None,
            },
        )
        .unwrap()
        .0
        .id
    }

    fn add_review(conn: &Connection, id: &str, scope_key: &str, text: &str) {
        conn.execute(
            "INSERT INTO period_reviews
                 (id, scope_key, period_kind, period_start, period_end, manual_text, created_at, updated_at)
             VALUES (?1, ?2, 'week', '2026-11-16', '2026-11-22', ?3, '2026-11-23 09:00:00', '2026-11-23 09:00:00')",
            [id, scope_key, text],
        )
        .unwrap();
    }

    fn task(conn: &Connection, id: &str) -> crate::models::task::Task {
        task_repo::get_by_id(conn, id).unwrap().unwrap()
    }

    fn task_count(conn: &Connection) -> usize {
        task_repo::get_all(
            conn,
            TaskFilter {
                include_children: Some(true),
                ..Default::default()
            },
        )
        .unwrap()
        .len()
    }

    fn live_records(conn: &Connection, task_id: &str) -> Vec<String> {
        read_rows(
            conn,
            "SELECT content FROM task_progress_records
             WHERE task_id = ?1 AND is_deleted = 0 ORDER BY record_date",
            &[&task_id],
        )
        .unwrap()
        .into_iter()
        .map(|row| text(&row[0]))
        .collect()
    }

    fn event_count(conn: &Connection) -> usize {
        read_rows(conn, "SELECT id FROM task_state_events", &[])
            .unwrap()
            .len()
    }

    /// 全库内容的指纹(任务、进展、回顾的保存回执等与找回无关的表不参与)
    fn fingerprint(conn: &Connection) -> String {
        let mut parts: Vec<String> = Vec::new();
        for table in [
            "tasks",
            "tags",
            "task_tags",
            "task_reminders",
            "task_notes",
            "attachments",
            "habits",
            "habit_logs",
            "settings",
            "ai_connections",
            "task_progress_records",
            "task_state_events",
            "period_reviews",
            "task_history_coverage",
        ] {
            for row in read_rows(conn, &format!("SELECT * FROM {}", table), &[]).unwrap() {
                parts.push(format!(
                    "{}:{}",
                    table,
                    row.iter()
                        .map(|v| format!("{:?}", v))
                        .collect::<Vec<_>>()
                        .join("|")
                ));
            }
        }
        parts.sort();
        parts.join("\n")
    }

    /// "先备份、后误删":返回 (本机, 备份, 被误删的任务 ID)
    fn deleted_after_backup() -> (Connection, Connection, String) {
        let origin = fresh_db();
        let kept = add_task(&origin, "已有的", None, false);
        let _child = add_task(&origin, "子任务", Some(&kept), false);
        let lost = add_task(&origin, "被误删的", None, true);
        add_record(&origin, &lost, "第一条进展", "2026-11-20");
        add_record(&origin, &lost, "第二条进展", "2026-11-21");
        let backup = fork(&origin);
        // 备份之后:误删一个任务,并改了另一个
        task_repo::delete(&origin, &lost).unwrap();
        task_repo::update(
            &origin,
            &kept,
            UpdateTaskRequest {
                title: Some("备份之后改的标题".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        (origin, backup, lost)
    }

    #[test]
    fn preview_marks_what_is_missing_locally() {
        let (current, backup, _) = deleted_after_backup();

        let shown = preview(&current, &backup).unwrap();
        assert!(!shown.has_reviews);
        let by_title: HashMap<&str, &PreviewTask> =
            shown.tasks.iter().map(|t| (t.title.as_str(), t)).collect();
        assert!(by_title["已有的"].exists_locally);
        assert!(by_title["子任务"].exists_locally);
        assert!(!by_title["被误删的"].exists_locally);
        // 父任务排在子任务前面
        let child = by_title["子任务"];
        assert!(child.parent_task_id.is_some());
        let parent_pos = shown.tasks.iter().position(|t| t.title == "已有的").unwrap();
        let child_pos = shown.tasks.iter().position(|t| t.title == "子任务").unwrap();
        assert!(parent_pos < child_pos);
        let lost = by_title["被误删的"];
        assert_eq!(lost.source.as_deref(), Some("agent"));
        assert_eq!(lost.due_date.as_deref(), Some("2026-12-01"));
        assert!(!lost.is_completed);
        // 预览不写数据
        assert!(task_repo::get_by_id(&current, &lost.id).unwrap().is_none());

        let (other, other_backup) = (fresh_db(), fresh_db());
        assert!(!preview(&other, &other_backup).unwrap().has_reviews);
        add_review(&other_backup, "rev-1", "week:2026-11-16", "本周回顾");
        assert!(preview(&other, &other_backup).unwrap().has_reviews);
    }

    #[test]
    fn recovers_a_deleted_task_with_its_history_and_leaves_the_rest_alone() {
        let (current, backup, lost) = deleted_after_backup();
        let backup_lost = task(&backup, &lost);
        let kept_before = task(&current, &preview_id(&backup, "已有的"));

        let counts = recover(&current, &backup, &[lost.clone()], false).unwrap();

        assert_eq!(counts.recovered, 1);
        assert_eq!(counts.replaced, 0);
        let restored = task(&current, &lost);
        assert_eq!(restored.title, "被误删的");
        assert_eq!(restored.created_at, backup_lost.created_at);
        assert_eq!(restored.updated_at, backup_lost.updated_at);
        assert_eq!(restored.priority, 2);
        // "由 Agent 创建"的来源标记保留
        assert_eq!(restored.source.as_deref(), Some("agent"));
        // 任务的历史跟着回来
        assert_eq!(
            live_records(&current, &lost),
            vec!["第一条进展".to_string(), "第二条进展".to_string()]
        );
        // 没勾选的任务完全不动
        assert_eq!(
            serde_json::to_value(task(&current, &kept_before.id)).unwrap(),
            serde_json::to_value(&kept_before).unwrap()
        );
        assert_eq!(task_count(&current), 3);
    }

    fn preview_id(backup: &Connection, title: &str) -> String {
        preview(&fresh_db(), backup)
            .unwrap()
            .tasks
            .into_iter()
            .find(|t| t.title == title)
            .unwrap()
            .id
    }

    #[test]
    fn replaces_a_selected_existing_task_with_the_backup_version() {
        let origin = fresh_db();
        let messy = add_task(&origin, "原标题", None, false);
        let other = add_task(&origin, "别的任务", None, false);
        let backup = fork(&origin);
        task_repo::update(
            &origin,
            &messy,
            UpdateTaskRequest {
                title: Some("改乱了".to_string()),
                priority: Some(4),
                ..Default::default()
            },
        )
        .unwrap();

        let counts = recover(&origin, &backup, &[messy.clone()], false).unwrap();

        assert_eq!(
            counts,
            RecoverCounts {
                recovered: 0,
                replaced: 1,
                reviews_restored: 0
            }
        );
        let fixed = task(&origin, &messy);
        assert_eq!(fixed.title, "原标题");
        assert_eq!(fixed.priority, 2);
        assert_eq!(task(&origin, &other).title, "别的任务");
    }

    #[test]
    fn brings_children_and_missing_parents_along() {
        let (current, backup) = (fresh_db(), fresh_db());
        let parent = add_task(&backup, "父任务", None, false);
        let child = add_task(&backup, "子任务", Some(&parent), false);
        add_task(&backup, "不相关的", None, false);

        // 只勾父任务:下级全部带回
        let counts = recover(&current, &backup, &[parent.clone()], false).unwrap();
        assert_eq!(counts.recovered, 2);
        assert_eq!(
            task(&current, &child).parent_task_id.as_deref(),
            Some(parent.as_str())
        );
        assert_eq!(task_count(&current), 2);

        // 只勾一个上级在本库不存在的子任务:上级一并带回,不相关的不带
        let current = fresh_db();
        let counts = recover(&current, &backup, &[child], false).unwrap();
        assert_eq!(counts.recovered, 2);
        assert!(task_repo::get_by_id(&current, &parent).unwrap().is_some());
        assert_eq!(task_count(&current), 2);
    }

    #[test]
    fn rebuilds_needed_tags_and_merges_same_name_tags() {
        let (current, backup) = (fresh_db(), fresh_db());
        let quarter = add_tag(&backup, "季度汇报", "#EF4444");
        let shared = add_tag(&backup, "工作", "#3B82F6");
        add_tag(&backup, "没人用的标签", "#10B981");
        let lost = add_task(&backup, "被误删的", None, false);
        link(&backup, &lost, &quarter);
        link(&backup, &lost, &shared);
        // 本库的"工作"是删除后重建的,ID 与备份里的不同
        let local_shared = add_tag(&current, "工作", "#999999");

        recover(&current, &backup, &[lost.clone()], false).unwrap();

        let rebuilt: (String, String) = current
            .query_row(
                "SELECT id, color FROM tags WHERE name = '季度汇报'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(rebuilt, (quarter.clone(), "#EF4444".to_string()));
        let mut links: Vec<String> = read_rows(
            &current,
            "SELECT tag_id FROM task_tags WHERE task_id = ?1",
            &[&lost],
        )
        .unwrap()
        .into_iter()
        .map(|row| text(&row[0]))
        .collect();
        let mut expected = vec![quarter, local_shared];
        links.sort();
        expected.sort();
        assert_eq!(links, expected);
        // 没有制造重名标签,也没带回没人用的标签
        let names: Vec<String> = read_rows(&current, "SELECT name FROM tags ORDER BY name", &[])
            .unwrap()
            .into_iter()
            .map(|row| text(&row[0]))
            .collect();
        assert_eq!(names, vec!["季度汇报".to_string(), "工作".to_string()]);
    }

    #[test]
    fn nested_backup_tags_keep_their_parent() {
        let (current, backup) = (fresh_db(), fresh_db());
        let parent = add_tag(&backup, "项目", "#3B82F6");
        let child = tag_repo::create(
            &backup,
            CreateTagRequest {
                name: "甲项目".to_string(),
                color: None,
                icon: None,
                parent_tag_id: Some(parent.clone()),
            },
        )
        .unwrap()
        .id;
        let lost = add_task(&backup, "被误删的", None, false);
        link(&backup, &lost, &child);

        recover(&current, &backup, &[lost], false).unwrap();

        let restored_parent: String = current
            .query_row("SELECT parent_tag_id FROM tags WHERE id = ?1", [&child], |r| r.get(0))
            .unwrap();
        assert_eq!(restored_parent, parent);
    }

    #[test]
    fn brings_reminders_notes_and_attachment_records() {
        let (current, backup) = (fresh_db(), fresh_db());
        let lost = add_task(&backup, "被误删的", None, false);
        crate::db::reminder_repo::create_reminder(
            &backup,
            CreateReminderRequest {
                task_id: lost.clone(),
                offset: "30m".to_string(),
                due_date: Some("2026-12-01".to_string()),
            },
        )
        .unwrap();
        backup
            .execute(
                "INSERT INTO task_notes (task_id, x, y, style) VALUES (?1, 10, 20, 'glass')",
                [&lost],
            )
            .unwrap();
        backup
            .execute(
                "INSERT INTO attachments (id, task_id, original_name, storage_name, mime_type, file_size)
                 VALUES ('att-1', ?1, 'a.png', 'a.png', 'image/png', 12)",
                [&lost],
            )
            .unwrap();

        recover(&current, &backup, &[lost.clone()], false).unwrap();

        let count = |sql: &str| -> i64 {
            current
                .query_row(sql, [&lost], |r| r.get(0))
                .unwrap()
        };
        assert_eq!(
            (
                count("SELECT COUNT(*) FROM task_reminders WHERE task_id = ?1"),
                count("SELECT COUNT(*) FROM task_notes WHERE task_id = ?1"),
                count("SELECT COUNT(*) FROM attachments WHERE task_id = ?1"),
            ),
            (1, 1, 1)
        );
    }

    #[test]
    fn live_local_records_and_events_are_never_rewritten() {
        let origin = fresh_db();
        let task_id = add_task(&origin, "任务", None, false);
        let record = add_record(&origin, &task_id, "原始内容", "2026-11-20");
        task_repo::update(
            &origin,
            &task_id,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let backup = fork(&origin);
        // 备份之后:改了那条进展,又完成了一次状态转换
        progress_repo::update_progress_record(
            &origin,
            UpdateProgressRequest {
                record_id: record.clone(),
                content: "备份之后改的内容".to_string(),
                record_date: "2026-11-20".to_string(),
                expected_version: 1,
                operation_id: None,
            },
        )
        .unwrap();
        let events_before = event_count(&origin);

        let counts = recover(&origin, &backup, std::slice::from_ref(&task_id), false).unwrap();

        assert_eq!(counts.replaced, 1);
        assert_eq!(
            live_records(&origin, &task_id),
            vec!["备份之后改的内容".to_string()]
        );
        // 本机的事件原样保留,也不重复
        assert_eq!(event_count(&origin), events_before);

        // 再找回一次:什么都不变
        let before = fingerprint(&origin);
        recover(&origin, &backup, &[task_id], false).unwrap();
        assert_eq!(fingerprint(&origin), before);
    }

    #[test]
    fn events_with_a_taken_id_are_skipped_not_overwritten() {
        let (current, backup) = (fresh_db(), fresh_db());
        // 两个库各自产生过 1 号事件(自增主键,不同库之间会撞号)
        let local_task = add_task(&current, "本机任务", None, false);
        task_repo::update(
            &current,
            &local_task,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let backup_task = add_task(&backup, "备份任务", None, false);
        task_repo::update(
            &backup,
            &backup_task,
            UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(event_count(&current), 1);

        recover(&current, &backup, &[backup_task], false).unwrap();

        let events = read_rows(
            &current,
            "SELECT id, task_id FROM task_state_events ORDER BY id",
            &[],
        )
        .unwrap();
        // 本机的 1 号事件原样保留;备份里撞号的事件不覆盖它
        assert_eq!(events.len(), 1);
        assert_eq!(text(&events[0][1]), local_task);
    }

    #[test]
    fn habits_settings_and_model_config_are_left_alone() {
        let (current, backup) = (fresh_db(), fresh_db());
        let lost = add_task(&backup, "被误删的", None, false);
        backup
            .execute("INSERT INTO habits (id, name) VALUES ('habit-1', '晨跑')", [])
            .unwrap();
        backup
            .execute_batch(
                "INSERT INTO settings (key, value) VALUES ('language', 'en-US'), ('ai_default_model', 'model-9');
                 INSERT INTO ai_connections (id, name, base_url) VALUES ('conn-1', '别处的模型', 'https://example.test/v1');",
            )
            .unwrap();
        current
            .execute_batch(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('language', 'zh-CN'), ('keyboard_shortcuts', '{}');",
            )
            .unwrap();

        recover(&current, &backup, std::slice::from_ref(&lost), false).unwrap();

        let scalar = |sql: &str| -> String {
            current.query_row(sql, [], |r| r.get(0)).unwrap()
        };
        assert_eq!(scalar("SELECT CAST(COUNT(*) AS TEXT) FROM habits"), "0");
        assert_eq!(scalar("SELECT CAST(COUNT(*) AS TEXT) FROM ai_connections"), "0");
        assert_eq!(
            scalar("SELECT value FROM settings WHERE key = 'language'"),
            "zh-CN"
        );
        assert_eq!(
            scalar("SELECT CAST(COUNT(*) AS TEXT) FROM settings WHERE key = 'ai_default_model'"),
            "0"
        );
    }

    #[test]
    fn review_conflict_aborts_the_whole_recovery() {
        let (current, backup, lost) = deleted_after_backup();
        add_review(&backup, "rev-backup", "week:2026-11-16", "备份里的文稿");
        // 同一周期本机另存了一份不同的文稿
        add_review(&current, "rev-local", "week:2026-11-16", "本机的文稿");
        let before = fingerprint(&current);

        let err = recover(&current, &backup, &[lost], true)
            .err()
            .expect("conflicting reviews must abort");
        assert!(err.to_string().contains("同一回顾范围的不同文稿"), "{err}");
        // 任务也没有被带回:整次找回是原子的
        assert_eq!(fingerprint(&current), before);

        // 同 ID、本机仍有效但内容不同,同样拒绝
        let (current, backup) = (fresh_db(), fresh_db());
        add_review(&backup, "rev-1", "week:2026-11-16", "备份里的文稿");
        add_review(&current, "rev-1", "week:2026-11-16", "改过的文稿");
        let before = fingerprint(&current);
        assert!(recover(&current, &backup, &[], true).is_err());
        assert_eq!(fingerprint(&current), before);
    }

    #[test]
    fn reviews_are_restored_only_when_asked() {
        let (current, backup) = (fresh_db(), fresh_db());
        add_review(&backup, "rev-missing", "week:2026-11-16", "上周回顾");
        add_review(&backup, "rev-deleted", "week:2026-11-09", "上上周回顾");
        add_review(&backup, "rev-same", "week:2026-11-02", "一样");
        add_review(&current, "rev-deleted", "week:2026-11-09", "上上周回顾");
        add_review(&current, "rev-same", "week:2026-11-02", "一样");
        current
            .execute(
                "UPDATE period_reviews SET is_deleted = 1 WHERE id = 'rev-deleted'",
                [],
            )
            .unwrap();
        let live = |conn: &Connection| -> i64 {
            conn.query_row(
                "SELECT COUNT(*) FROM period_reviews WHERE is_deleted = 0",
                [],
                |r| r.get(0),
            )
            .unwrap()
        };

        // 不勾选:回顾完全不动
        assert_eq!(recover(&current, &backup, &[], false).unwrap().reviews_restored, 0);
        assert_eq!(live(&current), 1);

        // 勾选:缺的和新机上已删除的被恢复,内容一致的跳过
        assert_eq!(recover(&current, &backup, &[], true).unwrap().reviews_restored, 2);
        assert_eq!(live(&current), 3);
        // 重复执行不重复
        assert_eq!(recover(&current, &backup, &[], true).unwrap().reviews_restored, 0);
    }

    #[test]
    fn nothing_selected_changes_nothing() {
        let (current, backup, _) = deleted_after_backup();
        let before = fingerprint(&current);
        let counts = recover(&current, &backup, &[], false).unwrap();
        assert_eq!(counts, RecoverCounts::default());
        assert_eq!(fingerprint(&current), before);
    }
}
