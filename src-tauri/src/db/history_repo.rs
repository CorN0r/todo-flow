//! 本机任务状态事件与历史覆盖。
//!
//! 事件只记录真实发生的状态转换(complete/reopen/suspend/resume/abandon/restore),
//! 与对应任务变化在同一事务内写入(调用方负责事务边界);普通字段编辑、查看、
//! 相同状态重复写入不产生事件。事件不复制任务描述或手写记录正文。

use chrono::{Local, SecondsFormat};
use rusqlite::params;
use rusqlite::Connection;
use sha2::{Digest, Sha256};

use crate::error::AppError;
use crate::models::progress::{CoverageGap, CoverageInfo};
use crate::models::task::Task;

pub const RETENTION_SETTING_KEY: &str = "task_history_retention";

pub const TRANSITION_COMPLETE: &str = "complete";
pub const TRANSITION_REOPEN: &str = "reopen";
pub const TRANSITION_SUSPEND: &str = "suspend";
pub const TRANSITION_RESUME: &str = "resume";
pub const TRANSITION_ABANDON: &str = "abandon";
pub const TRANSITION_RESTORE: &str = "restore";

fn today_local() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// 计算一次更新中真实发生的状态转换(同状态重写返回空)
pub fn compute_transitions(
    old_completed: bool,
    new_completed: bool,
    old_suspended: bool,
    new_suspended: bool,
    old_abandoned: bool,
    new_abandoned: bool,
) -> Vec<&'static str> {
    let mut transitions = Vec::new();
    if !old_completed && new_completed {
        transitions.push(TRANSITION_COMPLETE);
    } else if old_completed && !new_completed {
        transitions.push(TRANSITION_REOPEN);
    }
    if !old_suspended && new_suspended {
        transitions.push(TRANSITION_SUSPEND);
    } else if old_suspended && !new_suspended {
        transitions.push(TRANSITION_RESUME);
    }
    if !old_abandoned && new_abandoned {
        transitions.push(TRANSITION_ABANDON);
    } else if old_abandoned && !new_abandoned {
        transitions.push(TRANSITION_RESTORE);
    }
    transitions
}

/// 状态历史留存是否开启(默认开启;关闭不删除已有历史,仅停止记录新事件)
pub fn is_retention_enabled(conn: &Connection) -> Result<bool, AppError> {
    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![RETENTION_SETTING_KEY],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(value) => Ok(value != "0"),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(true),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// 切换留存开关;关闭时开启覆盖缺口区间,重新开启时收口,不回补关闭期间事件
pub fn set_retention(conn: &Connection, enabled: bool) -> Result<(), AppError> {
    let today = today_local();
    if enabled {
        conn.execute(
            "UPDATE task_history_coverage SET end_date = ?1
             WHERE kind = 'retention_off' AND end_date IS NULL",
            params![today],
        )?;
    } else {
        conn.execute(
            "INSERT INTO task_history_coverage (kind, start_date, end_date, note)
             VALUES ('retention_off', ?1, NULL, '状态历史留存关闭期间无事件记录')",
            params![today],
        )?;
    }
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![RETENTION_SETTING_KEY, if enabled { "1" } else { "0" }],
    )?;
    Ok(())
}

pub fn get_task_tag_ids(conn: &Connection, task_id: &str) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare("SELECT tag_id FROM task_tags WHERE task_id = ?1 ORDER BY tag_id")?;
    let ids = stmt
        .query_map(params![task_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

/// 在任务变化同一事务内追加真实转换事件。事件写入失败会使调用方整体回滚。
pub fn record_transitions(
    conn: &Connection,
    task_after: &Task,
    transitions: &[&str],
    source: &str,
) -> Result<(), AppError> {
    if transitions.is_empty() {
        return Ok(());
    }
    let root_task_id = task_after
        .parent_task_id
        .clone()
        .unwrap_or_else(|| task_after.id.clone());
    let root_tag_ids = get_task_tag_ids(conn, &root_task_id)?;
    let root_tag_json = serde_json::to_string(&root_tag_ids).unwrap_or_else(|_| "[]".into());

    let now = Local::now();
    let occurred_at = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let occurred_utc = now.to_rfc3339_opts(SecondsFormat::Secs, true);
    let local_date = now.format("%Y-%m-%d").to_string();
    let tz_offset = now.format("%:z").to_string();

    for transition in transitions {
        conn.execute(
            "INSERT INTO task_state_events
                (task_id, root_task_id, transition, occurred_at, occurred_utc,
                 local_date, tz_offset, source, title_snapshot, root_tag_ids)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                task_after.id,
                root_task_id,
                transition,
                occurred_at,
                occurred_utc,
                local_date,
                tz_offset,
                source,
                task_after.title,
                root_tag_json,
            ],
        )?;
    }
    Ok(())
}

/// 任务删除后保留的最小事实:事件不动,来源仅标记不可打开(由读取方判断任务存在)
pub fn latest_completion(conn: &Connection, task_id: &str) -> Result<Option<(String, String)>, AppError> {
    let result = conn.query_row(
        "SELECT transition, occurred_at FROM task_state_events
         WHERE task_id = ?1 AND transition IN ('complete', 'reopen')
         ORDER BY id DESC LIMIT 1",
        params![task_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );
    match result {
        Ok(pair) => Ok(Some(pair)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// 主动清理某日期区间的状态事件,并记录覆盖缺口(不把清理后的空白当作没有活动)
pub fn clear_state_events_range(
    conn: &Connection,
    start_date: &str,
    end_date: &str,
) -> Result<i64, AppError> {
    let tx = conn.unchecked_transaction()?;
    let affected = tx.execute(
        "DELETE FROM task_state_events WHERE local_date BETWEEN ?1 AND ?2",
        params![start_date, end_date],
    )?;
    tx.execute(
        "INSERT INTO task_history_coverage (kind, start_date, end_date, note)
         VALUES ('cleanup', ?1, ?2, '用户主动清理了该区间的事实历史')",
        params![start_date, end_date],
    )?;
    tx.commit()?;
    Ok(affected as i64)
}

/// 导入外部任务状态(无真实事件)时记录覆盖说明
pub fn record_import_coverage(conn: &Connection, note: &str) -> Result<(), AppError> {
    let today = today_local();
    conn.execute(
        "INSERT INTO task_history_coverage (kind, start_date, end_date, note)
         VALUES ('import', ?1, ?1, ?2)",
        params![today, note],
    )?;
    Ok(())
}

pub fn coverage_info(conn: &Connection) -> Result<CoverageInfo, AppError> {
    let baseline = conn
        .query_row(
            "SELECT start_date FROM task_history_coverage WHERE kind = 'baseline' ORDER BY id LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok();

    let mut stmt =
        conn.prepare("SELECT kind, start_date, end_date, note FROM task_history_coverage WHERE kind != 'baseline' ORDER BY id")?;
    let gaps = stmt
        .query_map([], |row| {
            Ok(CoverageGap {
                kind: row.get(0)?,
                start_date: row.get(1)?,
                end_date: row.get(2)?,
                note: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(CoverageInfo {
        baseline_start: baseline,
        gaps,
    })
}

/// 周期覆盖状态:complete=本机覆盖完整;partial=存在缺口;missing=早于基线
pub fn coverage_status_for(period_start: &str, period_end: &str, info: &CoverageInfo) -> String {
    let Some(baseline) = info.baseline_start.as_deref() else {
        return "missing".to_string();
    };
    if period_end < baseline {
        return "missing".to_string();
    }
    let today = today_local();
    for gap in &info.gaps {
        let gap_end = gap.end_date.as_deref().unwrap_or(today.as_str());
        if gap.start_date.as_str() <= period_end && period_start <= gap_end {
            return "partial".to_string();
        }
    }
    "complete".to_string()
}

/// 事件流指纹:用于检测"资料已有更新"(范围内事件/记录集合变化)
pub fn events_fingerprint(conn: &Connection, start_date: &str, end_date: &str) -> Result<String, AppError> {
    let mut hasher = Sha256::new();
    hasher.update(start_date.as_bytes());
    hasher.update(b"|");
    hasher.update(end_date.as_bytes());
    let mut stmt = conn.prepare(
        "SELECT id, task_id, transition, local_date FROM task_state_events
         WHERE local_date BETWEEN ?1 AND ?2 ORDER BY id",
    )?;
    let mut rows = stmt.query(params![start_date, end_date])?;
    while let Some(row) = rows.next()? {
        let id: i64 = row.get(0)?;
        let task_id: String = row.get(1)?;
        let transition: String = row.get(2)?;
        let local_date: String = row.get(3)?;
        hasher.update(format!("{}:{}:{}:{};", id, task_id, transition, local_date).as_bytes());
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// 详情"完成于":最近一次完成/重开事件;无事件返回 None(显示"完成时间未记录")
pub fn confirmed_completed_at(conn: &Connection, task_id: &str) -> Result<Option<String>, AppError> {
    Ok(match latest_completion(conn, task_id)? {
        Some((transition, occurred_at)) if transition == TRANSITION_COMPLETE => Some(occurred_at),
        _ => None,
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

    fn create_task(conn: &Connection, title: &str) -> String {
        let task = task_repo::create(
            conn,
            CreateTaskRequest {
                title: title.to_string(),
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
        task.id
    }

    #[test]
    fn compute_transitions_only_real_changes() {
        assert_eq!(compute_transitions(false, true, false, false, false, false), vec!["complete"]);
        assert_eq!(compute_transitions(true, true, false, false, false, false), Vec::<&str>::new());
        assert_eq!(compute_transitions(true, false, false, false, false, false), vec!["reopen"]);
        assert_eq!(compute_transitions(false, false, true, false, false, false), vec!["resume"]);
        assert_eq!(
            compute_transitions(false, true, false, false, false, true),
            vec!["complete", "abandon"]
        );
    }

    #[test]
    fn retention_toggle_creates_and_closes_gap() {
        let conn = setup();
        assert!(is_retention_enabled(&conn).unwrap());

        set_retention(&conn, false).unwrap();
        assert!(!is_retention_enabled(&conn).unwrap());
        let info = coverage_info(&conn).unwrap();
        assert_eq!(info.gaps.len(), 1);
        assert_eq!(info.gaps[0].kind, "retention_off");
        assert!(info.gaps[0].end_date.is_none());

        set_retention(&conn, true).unwrap();
        assert!(is_retention_enabled(&conn).unwrap());
        let info = coverage_info(&conn).unwrap();
        assert_eq!(info.gaps.len(), 1);
        assert!(info.gaps[0].end_date.is_some());
    }

    #[test]
    fn coverage_status_reflects_baseline_and_gaps() {
        let conn = setup();
        let today = today_local();
        let info = coverage_info(&conn).unwrap();
        // 早于基线:缺失
        assert_eq!(coverage_status_for("2020-01-01", "2020-01-02", &info), "missing");
        // 覆盖基线之后:完整
        assert_eq!(coverage_status_for(&today, &today, &info), "complete");

        // 注入缺口后:partial
        conn.execute(
            "INSERT INTO task_history_coverage (kind, start_date, end_date, note)
             VALUES ('cleanup', ?1, ?1, 'test')",
            params![today],
        )
        .unwrap();
        let info = coverage_info(&conn).unwrap();
        assert_eq!(coverage_status_for(&today, &today, &info), "partial");
    }

    #[test]
    fn clear_range_records_gap() {
        let conn = setup();
        let id = create_task(&conn, "t");
        task_repo::update(
            &conn,
            &id,
            crate::models::task::UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let today = today_local();
        let affected = clear_state_events_range(&conn, &today, &today).unwrap();
        assert_eq!(affected, 1);
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM task_state_events", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        let info = coverage_info(&conn).unwrap();
        assert!(info.gaps.iter().any(|g| g.kind == "cleanup"));
    }

    #[test]
    fn confirmed_completed_at_requires_latest_complete() {
        let conn = setup();
        let id = create_task(&conn, "t");
        assert!(confirmed_completed_at(&conn, &id).unwrap().is_none());

        task_repo::update(
            &conn,
            &id,
            crate::models::task::UpdateTaskRequest {
                is_completed: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(confirmed_completed_at(&conn, &id).unwrap().is_some());

        // 重开后不再显示完成时间
        task_repo::update(
            &conn,
            &id,
            crate::models::task::UpdateTaskRequest {
                is_completed: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(confirmed_completed_at(&conn, &id).unwrap().is_none());
    }
}
