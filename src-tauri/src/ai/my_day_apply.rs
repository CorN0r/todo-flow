use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::ai::error::{AiError, AiErrorCode};
use crate::ai::my_day::{
    is_executable, task_fingerprint, MyDayActionInput, StoredMyDayContext, StoredMyDayProposal,
    MAX_REASON_CHARS, MAX_STEP_CHARS,
};
use crate::db::{sync_repo, task_repo};

/// 本机结果保留的本地日期数;按日期成组清理,不修改普通任务。
pub const PLAN_RETENTION_DAYS: i64 = 30;

#[derive(Debug, Clone, Serialize)]
pub struct ApplyMyDayResult {
    /// 本次真正写入今日归属的根任务(已在今日的不重复写入)。
    pub added_task_ids: Vec<String>,
    pub plan_id: String,
    pub revision: i64,
    pub already_applied: bool,
}

fn now_local() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// 用户提交内容的规范化指纹(幂等比对:同 operation 同内容 → 原结果;不同内容 → 冲突)。
pub fn content_hash(date: &str, actions: &[MyDayActionInput]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(date.as_bytes());
    for a in actions {
        hasher.update(a.root_task_id.trim().as_bytes());
        hasher.update(b"\x01");
        hasher.update(a.target_subtask_id.as_deref().unwrap_or("").as_bytes());
        hasher.update(b"\x01");
        hasher.update(a.reason.trim().as_bytes());
        hasher.update(b"\x01");
        hasher.update(a.next_step.trim().as_bytes());
        hasher.update(b"\x01");
        hasher.update(a.stop_at.trim().as_bytes());
        hasher.update(b"\x02");
    }
    format!("{:x}", hasher.finalize())
}

fn current_plan_row(conn: &Connection, date: &str) -> Result<Option<(String, i64)>, AiError> {
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT plan_id, revision FROM ai_my_day_plans WHERE local_date = ?1",
            params![date],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    Ok(row)
}

fn is_deleted(conn: &Connection, task_id: &str) -> Result<bool, AiError> {
    let deleted: Option<Option<String>> = conn
        .query_row(
            "SELECT deleted_at FROM tasks WHERE id = ?1",
            params![task_id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(deleted.flatten().is_some())
}

/// 批量采纳事务:回执幂等 → 批次唯一 → 日期/版本 → 选中内容指纹复核 →
/// 仅对未加入今天的根任务写 my_day_date(专用 SQL,不触碰其他字段)→
/// 记录同步操作 → 原子替换本机计划 → 写回执。任一步失败整体回滚。
#[allow(clippy::too_many_arguments)]
pub fn apply_my_day_actions(
    conn: &Connection,
    today: &str,
    context: &StoredMyDayContext,
    proposal: &StoredMyDayProposal,
    operation_id: &str,
    actions: &[MyDayActionInput],
    expected_revision: i64,
) -> Result<ApplyMyDayResult, AiError> {
    if actions.is_empty() {
        return Err(AiError::new(AiErrorCode::Validation, "没有选中任何行动卡"));
    }
    let mut seen_roots = std::collections::HashSet::new();
    for a in actions {
        if !seen_roots.insert(a.root_task_id.clone()) {
            return Err(AiError::new(AiErrorCode::Validation, "同一根任务重复出现在提交内容中"));
        }
        if a.reason.trim().is_empty()
            || a.reason.chars().count() > MAX_REASON_CHARS
            || a.next_step.trim().is_empty()
            || a.next_step.chars().count() > MAX_STEP_CHARS
            || a.stop_at.trim().is_empty()
            || a.stop_at.chars().count() > MAX_STEP_CHARS
        {
            return Err(AiError::new(AiErrorCode::Validation, "行动卡文本为空或超限"));
        }
    }
    let submitted_hash = content_hash(today, actions);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AiError::new(AiErrorCode::Internal, format!("开启事务失败: {}", e)))?;

    // ① 幂等:回执先于内存候选检查(支持成功后响应丢失的重试)
    let existing: Option<(i64, String)> = tx
        .query_row(
            "SELECT item_count, result FROM ai_my_day_apply_receipts WHERE operation_id = ?1",
            params![operation_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if let Some((_count, result)) = existing {
        let stored_hash: Option<String> = tx
            .query_row(
                "SELECT content_hash FROM ai_my_day_apply_receipts WHERE operation_id = ?1",
                params![operation_id],
                |r| r.get(0),
            )
            .optional()?;
        if stored_hash.as_deref() == Some(submitted_hash.as_str()) {
            #[derive(serde::Deserialize)]
            struct ReceiptPayload {
                added_task_ids: Vec<String>,
                plan_id: String,
                revision: i64,
            }
            let payload: ReceiptPayload = serde_json::from_str(&result)
                .map_err(|e| AiError::new(AiErrorCode::Internal, format!("回执结果损坏: {}", e)))?;
            return Ok(ApplyMyDayResult {
                added_task_ids: payload.added_task_ids,
                plan_id: payload.plan_id,
                revision: payload.revision,
                already_applied: true,
            });
        }
        return Err(AiError::new(
            AiErrorCode::ApplyConflict,
            "该操作已用其他内容提交过,不能重复使用同一操作标识",
        ));
    }

    // ② 一份建议批次只允许成功采纳一次
    let adopted: Option<String> = tx
        .query_row(
            "SELECT operation_id FROM ai_my_day_apply_receipts WHERE proposal_id = ?1",
            params![proposal.proposal_id],
            |r| r.get(0),
        )
        .optional()?;
    if adopted.is_some() {
        return Err(AiError::new(
            AiErrorCode::ApplyConflict,
            "该建议批次已采纳过,如需调整请重新生成",
        ));
    }

    // ③ 日期与计划版本(跨午夜/已被替换或清除 → 拒绝,不补写不顺延)
    if context.local_date != today || proposal.local_date != today {
        return Err(AiError::new(
            AiErrorCode::ContextChanged,
            "已跨到新的日期,请重新准备今天的候选",
        ));
    }
    let plan_row = current_plan_row(&tx, today)?;
    match &plan_row {
        None if expected_revision != 0 => {
            return Err(AiError::new(
                AiErrorCode::ContextChanged,
                "当前计划状态已变化,请重新检查后再采纳",
            ));
        }
        Some((_pid, revision)) if *revision != expected_revision => {
            return Err(AiError::new(
                AiErrorCode::ContextChanged,
                "当前计划已被其他操作更新,请重新检查后再采纳",
            ));
        }
        _ => {}
    }

    // ④ 选中任务复核:范围成员、可执行状态、父子关系、完整内容指纹
    let mut to_add: Vec<&MyDayActionInput> = Vec::with_capacity(actions.len());
    for a in actions {
        let candidate = context
            .candidates
            .iter()
            .find(|c| c.task_id == a.root_task_id)
            .ok_or_else(|| {
                AiError::new(AiErrorCode::ContextChanged, "提交的任务不在本次候选范围内")
            })?;
        let task = match task_repo::get_by_id(&tx, &a.root_task_id)? {
            Some(t) if !is_deleted(&tx, &a.root_task_id)? => t,
            _ => return Err(AiError::new(AiErrorCode::ContextChanged, "选中任务已不存在")),
        };
        if task.parent_task_id.is_some() || !is_executable(&task) {
            return Err(AiError::new(
                AiErrorCode::ContextChanged,
                format!("任务「{}」状态已变化(完成/挂起/放弃等),请重新生成", task.title),
            ));
        }
        let children = task_repo::get_children(&tx, &a.root_task_id)?;
        let current_fp = task_fingerprint(
            &task,
            &children
                .iter()
                .map(|c| (c.title.clone(), c.is_completed))
                .collect::<Vec<_>>(),
        );
        if current_fp != candidate.fingerprint {
            return Err(AiError::new(
                AiErrorCode::ContextChanged,
                format!("任务「{}」在生成后内容发生了变化,请重新生成", task.title),
            ));
        }
        if let Some(sub_id) = &a.target_subtask_id {
            let sub = match task_repo::get_by_id(&tx, sub_id)? {
                Some(s) if !is_deleted(&tx, sub_id)? => s,
                _ => return Err(AiError::new(AiErrorCode::ContextChanged, "目标子任务已不存在")),
            };
            if sub.parent_task_id.as_deref() != Some(task.id.as_str()) || sub.is_completed || !is_executable(&sub) {
                return Err(AiError::new(AiErrorCode::ContextChanged, "目标子任务状态或归属已变化,请重新生成"));
            }
            if !candidate.subtasks.iter().any(|s| &s.subtask_id == sub_id) {
                return Err(AiError::new(AiErrorCode::ContextChanged, "目标子任务不在本次候选范围内"));
            }
        }
        if task.my_day_date.as_deref() != Some(today) {
            to_add.push(a);
        }
    }

    // ⑤ 只写 my_day_date(无截止日期保持无日期;不改排序/优先级/正文等任何其他字段),
    //    并记录与 task_repo::update 相同语义的同步操作
    let now = now_local();
    for a in &to_add {
        tx.execute(
            "UPDATE tasks SET my_day_date = ?1, updated_at = ?2 WHERE id = ?3",
            params![today, now, a.root_task_id],
        )?;
        let updated = task_repo::get_by_id(&tx, &a.root_task_id)?
            .ok_or_else(|| AiError::new(AiErrorCode::Internal, "任务更新后读取失败"))?;
        let _ = sync_repo::record_local_operation(
            &tx,
            "task",
            &a.root_task_id,
            "update",
            serde_json::json!({ "task": updated }),
        )?;
    }

    // ⑥ 原子替换本机计划:新 plan_id + revision+1,行动卡指纹按写入后的状态计算
    let plan_id = uuid::Uuid::new_v4().to_string();
    let new_revision = expected_revision + 1;
    match &plan_row {
        Some((old_plan_id, _)) => {
            tx.execute("DELETE FROM ai_my_day_actions WHERE plan_id = ?1", params![old_plan_id])?;
            tx.execute(
                "UPDATE ai_my_day_plans SET plan_id = ?1, revision = ?2, focus_text = ?3,
                 model_snapshot = ?4, generated_at = ?5, adopted_at = ?6, cleared_at = NULL
                 WHERE local_date = ?7",
                params![
                    plan_id,
                    new_revision,
                    proposal.focus_text,
                    proposal.model_snapshot,
                    proposal.created_at,
                    now,
                    today
                ],
            )?;
        }
        None => {
            tx.execute(
                "INSERT INTO ai_my_day_plans (local_date, plan_id, revision, focus_text, model_snapshot, generated_at, adopted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![today, plan_id, new_revision, proposal.focus_text, proposal.model_snapshot, proposal.created_at, now],
            )?;
        }
    }
    for (idx, a) in actions.iter().enumerate() {
        let task = task_repo::get_by_id(&tx, &a.root_task_id)?
            .ok_or_else(|| AiError::new(AiErrorCode::Internal, "计划写入时任务读取失败"))?;
        let children = task_repo::get_children(&tx, &a.root_task_id)?;
        let fingerprint = task_fingerprint(
            &task,
            &children
                .iter()
                .map(|c| (c.title.clone(), c.is_completed))
                .collect::<Vec<_>>(),
        );
        tx.execute(
            "INSERT INTO ai_my_day_actions (plan_id, display_order, root_task_id, target_subtask_id, reason, next_step, stop_at, task_fingerprint)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                plan_id,
                (idx + 1) as i64,
                a.root_task_id,
                a.target_subtask_id,
                a.reason.trim(),
                a.next_step.trim(),
                a.stop_at.trim(),
                fingerprint
            ],
        )?;
    }

    // ⑦ 回执
    let added_ids: Vec<String> = to_add.iter().map(|a| a.root_task_id.clone()).collect();
    let result_json = serde_json::json!({
        "added_task_ids": added_ids,
        "plan_id": plan_id,
        "revision": new_revision,
    })
    .to_string();
    tx.execute(
        "INSERT INTO ai_my_day_apply_receipts (operation_id, proposal_id, target_date, item_count, content_hash, result)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![operation_id, proposal.proposal_id, today, actions.len() as i64, submitted_hash, result_json],
    )?;

    tx.commit()
        .map_err(|e| AiError::new(AiErrorCode::Internal, format!("采纳事务提交失败: {}", e)))?;

    Ok(ApplyMyDayResult {
        added_task_ids: added_ids,
        plan_id,
        revision: new_revision,
        already_applied: false,
    })
}

// ---------- 读取与实时状态 ----------

#[derive(Debug, Clone, Serialize)]
pub struct PlanActionView {
    pub display_order: i64,
    pub root_task_id: String,
    pub target_subtask_id: Option<String>,
    pub root_title: Option<String>,
    pub subtask_title: Option<String>,
    pub reason: String,
    pub next_step: String,
    pub stop_at: String,
    /// ok | changed | completed | suspended | abandoned | archived | deleted |
    /// removed_from_day | subtask_invalid | subtask_completed
    pub status: String,
    pub can_start: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct MyDayPlanView {
    pub plan_id: String,
    pub local_date: String,
    pub revision: i64,
    pub focus_text: String,
    pub model_snapshot: String,
    pub adopted_at: String,
    pub actions: Vec<PlanActionView>,
}

struct ActionRow {
    display_order: i64,
    root_task_id: String,
    target_subtask_id: Option<String>,
    reason: String,
    next_step: String,
    stop_at: String,
    task_fingerprint: String,
}

/// 读取当日计划并联查实时任务状态;已清除(cleared_at 非空)视为无计划。
pub fn get_my_day_plan(conn: &Connection, date: &str) -> Result<Option<MyDayPlanView>, AiError> {
    let plan: Option<(String, i64, String, String, String)> = conn
        .query_row(
            "SELECT plan_id, revision, focus_text, model_snapshot, adopted_at
             FROM ai_my_day_plans WHERE local_date = ?1 AND cleared_at IS NULL",
            params![date],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .optional()?;
    let Some((plan_id, revision, focus_text, model_snapshot, adopted_at)) = plan else {
        return Ok(None);
    };

    let mut stmt = conn.prepare(
        "SELECT display_order, root_task_id, target_subtask_id, reason, next_step, stop_at, task_fingerprint
         FROM ai_my_day_actions WHERE plan_id = ?1 ORDER BY display_order ASC",
    )?;
    let rows: Vec<ActionRow> = stmt
        .query_map(params![plan_id], |r| {
            Ok(ActionRow {
                display_order: r.get(0)?,
                root_task_id: r.get(1)?,
                target_subtask_id: r.get(2)?,
                reason: r.get(3)?,
                next_step: r.get(4)?,
                stop_at: r.get(5)?,
                task_fingerprint: r.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut actions = Vec::with_capacity(rows.len());
    for row in rows {
        let task = match task_repo::get_by_id(conn, &row.root_task_id)? {
            Some(t) if !is_deleted(conn, &row.root_task_id)? => Some(t),
            _ => None,
        };
        let mut root_title = None;
        let mut subtask_title = None;
        let mut status = "ok".to_string();

        match &task {
            None => status = "deleted".into(),
            Some(t) => {
                root_title = Some(t.title.clone());
                if t.is_completed {
                    status = "completed".into();
                } else if t.is_suspended {
                    status = "suspended".into();
                } else if t.is_abandoned {
                    status = "abandoned".into();
                } else if t.is_archived {
                    status = "archived".into();
                } else if t.my_day_date.as_deref() != Some(date) {
                    status = "removed_from_day".into();
                }
                if status == "ok" {
                    if let Some(sub_id) = &row.target_subtask_id {
                        let sub = match task_repo::get_by_id(conn, sub_id)? {
                            Some(s) if !is_deleted(conn, sub_id)? => Some(s),
                            _ => None,
                        };
                        match sub {
                            None => status = "subtask_invalid".into(),
                            Some(s) => {
                                subtask_title = Some(s.title.clone());
                                if s.parent_task_id.as_deref() != Some(t.id.as_str()) {
                                    status = "subtask_invalid".into();
                                } else if s.is_completed {
                                    status = "subtask_completed".into();
                                }
                            }
                        }
                    }
                }
                if status == "ok" {
                    // 内容变化不禁止开始,只提示需检查
                    let children = task_repo::get_children(conn, &row.root_task_id)?;
                    let fp = task_fingerprint(
                        t,
                        &children
                            .iter()
                            .map(|c| (c.title.clone(), c.is_completed))
                            .collect::<Vec<_>>(),
                    );
                    if fp != row.task_fingerprint {
                        status = "changed".into();
                    }
                }
            }
        }
        let can_start = status == "ok" || status == "changed";
        actions.push(PlanActionView {
            display_order: row.display_order,
            root_task_id: row.root_task_id,
            target_subtask_id: row.target_subtask_id,
            root_title,
            subtask_title,
            reason: row.reason,
            next_step: row.next_step,
            stop_at: row.stop_at,
            status,
            can_start,
        });
    }

    Ok(Some(MyDayPlanView {
        plan_id,
        local_date: date.to_string(),
        revision,
        focus_text,
        model_snapshot,
        adopted_at,
        actions,
    }))
}

/// 当前计划版本(无计划为 0);准备候选时返回给前端作为采纳时的期望版本。
pub fn current_revision(conn: &Connection, date: &str) -> Result<i64, AiError> {
    Ok(current_plan_row(conn, date)?.map(|(_, r)| r).unwrap_or(0))
}

/// 清除重点:只标记计划行并递增版本,不撤回普通今日任务归属。
/// 返回清除后的版本号;无计划或已清除时幂等返回当前版本。
pub fn clear_my_day_plan(conn: &Connection, date: &str, expected_revision: i64) -> Result<i64, AiError> {
    let row = current_plan_row(conn, date)?;
    let Some((plan_id, revision)) = row else {
        return Ok(0);
    };
    let cleared: Option<Option<String>> = conn
        .query_row(
            "SELECT cleared_at FROM ai_my_day_plans WHERE plan_id = ?1",
            params![plan_id],
            |r| r.get(0),
        )
        .optional()?;
    if cleared.flatten().is_some() {
        return Ok(revision);
    }
    if revision != expected_revision {
        return Err(AiError::new(
            AiErrorCode::ContextChanged,
            "计划已被其他操作更新,请刷新后重试",
        ));
    }
    let new_revision = revision + 1;
    conn.execute(
        "UPDATE ai_my_day_plans SET cleared_at = ?1, revision = ?2 WHERE plan_id = ?3",
        params![now_local(), new_revision, plan_id],
    )?;
    Ok(new_revision)
}

/// 按日期成组清理过期本机结果(计划、行动卡与专用回执);不修改普通任务。
pub fn cleanup_old_plans(conn: &Connection, today: &str) -> Result<(), AiError> {
    let Ok(today_date) = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d") else {
        return Ok(());
    };
    let cutoff = (today_date - chrono::Duration::days(PLAN_RETENTION_DAYS))
        .format("%Y-%m-%d")
        .to_string();
    conn.execute(
        "DELETE FROM ai_my_day_actions WHERE plan_id IN (SELECT plan_id FROM ai_my_day_plans WHERE local_date < ?1)",
        params![cutoff],
    )?;
    conn.execute(
        "DELETE FROM ai_my_day_plans WHERE local_date < ?1",
        params![cutoff],
    )?;
    conn.execute(
        "DELETE FROM ai_my_day_apply_receipts WHERE target_date < ?1",
        params![cutoff],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::my_day::{
        build_snapshot, select_candidate_roots, MyDayCandidate, MyDayPlanOutput,
        StoredMyDayContext,
    };
    use crate::models::task::CreateTaskRequest;

    const TODAY: &str = "2026-10-30";

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::run(&conn).unwrap();
        conn
    }

    fn create_task(conn: &Connection, title: &str, due: Option<&str>, my_day: Option<&str>) -> String {
        let task = task_repo::create(
            conn,
            CreateTaskRequest {
                title: title.into(),
                description: Some("<p>描述</p>".into()),
                tag_ids: None,
                parent_task_id: None,
                due_date: due.map(String::from),
                priority: None,
                reminder: None,
                recurrence: None,
                my_day_date: my_day.map(String::from),
                source: None,
            },
        )
        .unwrap();
        task.id
    }

    fn update_req() -> crate::models::task::UpdateTaskRequest {
        crate::models::task::UpdateTaskRequest {
            title: None,
            description: None,
            is_completed: None,
            priority: None,
            due_date: None,
            tag_ids: None,
            parent_task_id: None,
            reminder: None,
            recurrence: None,
            my_day_date: None,
            is_suspended: None,
            is_abandoned: None,
            is_pinned: None,
            status_event_source: None,
        }
    }

    fn context_for(conn: &Connection, ids: &[String]) -> (StoredMyDayContext, Vec<MyDayCandidate>) {
        let tasks: Vec<_> = ids.iter().map(|id| task_repo::get_by_id(conn, id).unwrap().unwrap()).collect();
        let sel = select_candidate_roots(&tasks, TODAY, &Default::default());
        let mut children_map = std::collections::HashMap::new();
        for (_, t) in &sel.selected {
            children_map.insert(t.id.clone(), task_repo::get_children(conn, &t.id).unwrap());
        }
        let candidates = build_snapshot(&sel.selected, &children_map, TODAY, &Default::default());
        let ctx = StoredMyDayContext {
            context_id: "ctx-1".into(),
            local_date: TODAY.into(),
            tag_ids: vec![],
            candidates: candidates.clone(),
            eligible_total: candidates.len(),
            created_at: String::new(),
        };
        (ctx, candidates)
    }

    fn proposal_for(ctx: &StoredMyDayContext, focus: &str) -> StoredMyDayProposal {
        StoredMyDayProposal {
            proposal_id: "prop-1".into(),
            context_id: ctx.context_id.clone(),
            local_date: TODAY.into(),
            model_snapshot: "测试连接 (m)".into(),
            created_at: "2026-10-30 09:00:00".into(),
            focus_text: focus.into(),
            output: MyDayPlanOutput {
                assumptions: vec![],
                actions: vec![],
                not_selected: vec![],
            },
        }
    }

    /// 换 proposal_id 的变体:一份建议批次只允许成功采纳一次,替换重点来自新的生成。
    fn proposal_with_id(ctx: &StoredMyDayContext, id: &str) -> StoredMyDayProposal {
        StoredMyDayProposal {
            proposal_id: id.into(),
            ..proposal_for(ctx, "")
        }
    }

    fn actions_for(candidates: &[MyDayCandidate], picks: &[usize]) -> Vec<MyDayActionInput> {
        picks
            .iter()
            .map(|i| MyDayActionInput {
                root_task_id: candidates[*i].task_id.clone(),
                target_subtask_id: candidates[*i].subtasks.first().map(|s| s.subtask_id.clone()),
                reason: "值得推进".into(),
                next_step: "先做第一步".into(),
                stop_at: "有可审核结果即停".into(),
            })
            .collect()
    }

    #[test]
    fn applies_my_day_only_for_new_tasks_in_one_transaction() {
        let conn = setup();
        let a = create_task(&conn, "新任务", None, None);
        let b = create_task(&conn, "已在今日", None, Some(TODAY));
        let before_b = task_repo::get_by_id(&conn, &b).unwrap().unwrap();

        let (ctx, cands) = context_for(&conn, &[a.clone(), b.clone()]);
        let result = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, "推进"), "op-1", &actions_for(&cands, &[0, 1]), 0).unwrap();

        assert_eq!(result.added_task_ids, vec![a.clone()]);
        assert_eq!(result.revision, 1);
        let after_a = task_repo::get_by_id(&conn, &a).unwrap().unwrap();
        assert_eq!(after_a.my_day_date.as_deref(), Some(TODAY));
        // 无日期任务不被补截止日期;其他字段保持
        assert_eq!(after_a.due_date, None);
        assert_eq!(after_a.title, "新任务");
        // 已在今日的任务无写入
        let after_b = task_repo::get_by_id(&conn, &b).unwrap().unwrap();
        assert_eq!(after_b.updated_at, before_b.updated_at);

        let view = get_my_day_plan(&conn, TODAY).unwrap().unwrap();
        assert_eq!(view.actions.len(), 2);
        assert_eq!(view.focus_text, "推进");
        assert!(view.actions.iter().all(|x| x.status == "ok" && x.can_start));
        // 同秒创建的候选组内顺序不保证,按集合断言
        let ids: Vec<&str> = view.actions.iter().map(|x| x.root_task_id.as_str()).collect();
        assert!(ids.contains(&a.as_str()) && ids.contains(&b.as_str()));
    }

    #[test]
    fn does_not_touch_due_date_priority_or_sort_of_dated_tasks() {
        let conn = setup();
        let task = task_repo::create(
            &conn,
            CreateTaskRequest {
                title: "有日期任务".into(),
                description: None,
                tag_ids: None,
                parent_task_id: None,
                due_date: Some("2026-12-24".into()),
                priority: Some(2),
                reminder: None,
                recurrence: None,
                my_day_date: None,
                source: None,
            },
        )
        .unwrap();
        let (ctx, cands) = context_for(&conn, std::slice::from_ref(&task.id));
        apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-1", &actions_for(&cands, &[0]), 0).unwrap();

        let after = task_repo::get_by_id(&conn, &task.id).unwrap().unwrap();
        assert_eq!(after.due_date.as_deref(), Some("2026-12-24"));
        assert_eq!(after.priority, 2);
        assert_eq!(after.sort_order, task.sort_order);
    }

    #[test]
    fn duplicate_operation_returns_original_and_conflicts_on_different_content() {
        let conn = setup();
        let a = create_task(&conn, "任务", None, None);
        let (ctx, cands) = context_for(&conn, std::slice::from_ref(&a));
        let actions = actions_for(&cands, &[0]);
        let first = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-1", &actions, 0).unwrap();
        let second = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-1", &actions, first.revision).unwrap();
        assert!(second.already_applied);
        assert_eq!(first.plan_id, second.plan_id);

        let mut changed = actions.clone();
        changed[0].next_step = "改过的下一步".into();
        let err = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-1", &changed, second.revision).unwrap_err();
        assert_eq!(err.code, AiErrorCode::ApplyConflict);

        // 同一 proposal 换 operation 再采纳 → 冲突
        let err = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-2", &actions, second.revision).unwrap_err();
        assert_eq!(err.code, AiErrorCode::ApplyConflict);
    }

    #[test]
    fn stale_date_and_revision_are_rejected() {
        let conn = setup();
        let a = create_task(&conn, "任务", None, None);
        let (ctx, cands) = context_for(&conn, std::slice::from_ref(&a));
        let actions = actions_for(&cands, &[0]);

        // 跨午夜:上下文日期 ≠ 今天
        let err = apply_my_day_actions(&conn, "2026-10-31", &ctx, &proposal_for(&ctx, ""), "op-x", &actions, 0).unwrap_err();
        assert_eq!(err.code, AiErrorCode::ContextChanged);
        assert!(get_my_day_plan(&conn, TODAY).unwrap().is_none());

        // 版本不匹配
        let err = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-y", &actions, 3).unwrap_err();
        assert_eq!(err.code, AiErrorCode::ContextChanged);
        // 任务未被写入
        let task = task_repo::get_by_id(&conn, &a).unwrap().unwrap();
        assert_eq!(task.my_day_date, None);
    }

    #[test]
    fn content_change_after_generation_blocks_apply() {
        let conn = setup();
        let a = create_task(&conn, "任务", None, None);
        let (ctx, cands) = context_for(&conn, std::slice::from_ref(&a));

        // 生成后用户改了描述(即使改动在发送片段之外 → 指纹基于全文)
        let mut req = update_req();
        req.description = Some("<p>全新的完整描述,比截断上限长很多也要被识别</p>".into());
        task_repo::update(&conn, &a, req).unwrap();

        let err = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-1", &actions_for(&cands, &[0]), 0).unwrap_err();
        assert_eq!(err.code, AiErrorCode::ContextChanged);
        let task = task_repo::get_by_id(&conn, &a).unwrap().unwrap();
        assert_eq!(task.my_day_date, None);
        assert!(get_my_day_plan(&conn, TODAY).unwrap().is_none());
    }

    #[test]
    fn replaced_plan_shows_diff_and_clear_does_not_remove_tasks() {
        let conn = setup();
        let a = create_task(&conn, "A", None, None);
        let b = create_task(&conn, "B", None, None);
        let (ctx, cands) = context_for(&conn, &[a.clone(), b.clone()]);

        // 第二次采纳只保留 B(按 task_id 定位候选,不依赖组内顺序)
        let idx_a = cands.iter().position(|c| c.task_id == a).unwrap();
        let idx_b = cands.iter().position(|c| c.task_id == b).unwrap();
        let first = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-1", &actions_for(&cands, &[idx_a]), 0).unwrap();
        let second = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_with_id(&ctx, "prop-2"), "op-2", &actions_for(&cands, &[idx_b]), first.revision).unwrap();

        let view = get_my_day_plan(&conn, TODAY).unwrap().unwrap();
        assert_eq!(view.revision, second.revision);
        assert_eq!(view.actions.len(), 1);
        assert_eq!(view.actions[0].root_task_id, b);
        // 被移出重点的 a 仍在今日清单
        assert_eq!(task_repo::get_by_id(&conn, &a).unwrap().unwrap().my_day_date.as_deref(), Some(TODAY));

        // 清除:任务归属保留,版本递增,旧回执重放不复活
        let cleared = clear_my_day_plan(&conn, TODAY, second.revision).unwrap();
        assert_eq!(cleared, second.revision + 1);
        assert!(get_my_day_plan(&conn, TODAY).unwrap().is_none());
        assert_eq!(task_repo::get_by_id(&conn, &a).unwrap().unwrap().my_day_date.as_deref(), Some(TODAY));
        assert_eq!(task_repo::get_by_id(&conn, &b).unwrap().unwrap().my_day_date.as_deref(), Some(TODAY));

        // 幂等:重复清除返回当前版本(已清除的计划再清除是无操作,不受期望版本影响)
        assert_eq!(clear_my_day_plan(&conn, TODAY, cleared).unwrap(), cleared);

        // 重新采纳形成活跃计划后,过期版本清除被拒
        let third = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_with_id(&ctx, "prop-3"), "op-3", &actions_for(&cands, &[idx_a]), cleared).unwrap();
        assert!(clear_my_day_plan(&conn, TODAY, 0).is_err());
        assert_eq!(clear_my_day_plan(&conn, TODAY, third.revision).unwrap(), third.revision + 1);
    }

    #[test]
    fn live_status_reflects_completion_removal_and_subtask_changes() {
        let conn = setup();
        let a = create_task(&conn, "A", None, None);
        let sub = task_repo::create(
            &conn,
            CreateTaskRequest {
                title: "子任务一".into(),
                description: None,
                tag_ids: None,
                parent_task_id: Some(a.clone()),
                due_date: None,
                priority: None,
                reminder: None,
                recurrence: None,
                my_day_date: None,
                source: None,
            },
        )
        .unwrap();
        let (ctx, cands) = context_for(&conn, std::slice::from_ref(&a));
        apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-1", &actions_for(&cands, &[0]), 0).unwrap();

        // 目标子任务完成:本步完成,不推断父任务完成,仍可从根任务开始?规范:标记本步完成。
        let mut complete_sub = update_req();
        complete_sub.is_completed = Some(true);
        task_repo::update(&conn, &sub.id, complete_sub).unwrap();
        let view = get_my_day_plan(&conn, TODAY).unwrap().unwrap();
        assert_eq!(view.actions[0].status, "subtask_completed");
        assert!(!view.actions[0].can_start);

        // 根任务移出今日:显示已移出,不自动加回
        let mut reopen_sub = update_req();
        reopen_sub.is_completed = Some(false);
        task_repo::update(&conn, &sub.id, reopen_sub).unwrap();
        let mut remove_day = update_req();
        remove_day.my_day_date = Some(None);
        task_repo::update(&conn, &a, remove_day).unwrap();
        let view = get_my_day_plan(&conn, TODAY).unwrap().unwrap();
        assert_eq!(view.actions[0].status, "removed_from_day");
        assert_eq!(task_repo::get_by_id(&conn, &a).unwrap().unwrap().my_day_date, None);

        // 根任务完成:整卡失效
        let mut complete_root = update_req();
        complete_root.is_completed = Some(true);
        task_repo::update(&conn, &a, complete_root).unwrap();
        let view = get_my_day_plan(&conn, TODAY).unwrap().unwrap();
        assert_eq!(view.actions[0].status, "completed");
    }

    #[test]
    fn out_of_scope_task_and_bad_subtask_rejected() {
        let conn = setup();
        let a = create_task(&conn, "A", None, None);
        let outside = create_task(&conn, "范围外", None, None);
        let (ctx, cands) = context_for(&conn, std::slice::from_ref(&a));

        let mut actions = actions_for(&cands, &[0]);
        actions[0].root_task_id = outside.clone();
        let err = apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-1", &actions, 0).unwrap_err();
        assert_eq!(err.code, AiErrorCode::ContextChanged);
        assert_eq!(task_repo::get_by_id(&conn, &outside).unwrap().unwrap().my_day_date, None);
    }

    #[test]
    fn sync_payload_records_only_task_updates_without_ai_entities() {
        let conn = setup();
        let a = create_task(&conn, "新增任务", None, None);
        let b = create_task(&conn, "已在今日", None, Some(TODAY));
        // 建任务后再开同步,排除 create 操作对计数的干扰
        crate::db::sync_repo::set_meta(&conn, "sync_enabled", "1").unwrap();
        let (ctx, cands) = context_for(&conn, &[a.clone(), b.clone()]);
        apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-1", &actions_for(&cands, &[0, 1]), 0).unwrap();

        let ops = crate::db::sync_repo::list_operations(&conn, None).unwrap();
        // 只有未加入今天的 a 产生同步操作;已在今日的 b 不重复写入
        assert_eq!(ops.len(), 1);
        let op = &ops[0];
        assert_eq!(op.entity_type, "task");
        assert_eq!(op.entity_id, a);
        assert_eq!(op.operation, "update");
        assert_eq!(op.payload["task"]["my_day_date"].as_str(), Some(TODAY));
        // 无截止日期任务不被补日期:同步载荷如实反映
        assert!(op.payload["task"]["due_date"].is_null());
        // 载荷是普通任务实体,不携带 AI 计划/行动卡/回执字段
        let payload_text = op.payload.to_string();
        for leak in ["ai_my_day", "plan_id", "stop_at", "next_step", "revision"] {
            assert!(!payload_text.contains(leak), "同步载荷不应包含 {}", leak);
        }

        // 计划/回执表自身不产生任何同步实体;清除重点也不产生
        clear_my_day_plan(&conn, TODAY, 1).unwrap();
        let ops_after = crate::db::sync_repo::list_operations(&conn, None).unwrap();
        assert_eq!(ops_after.len(), 1);
    }

    #[test]
    fn cleanup_removes_groups_older_than_30_days() {
        let conn = setup();
        let a = create_task(&conn, "A", None, None);
        let (ctx, cands) = context_for(&conn, std::slice::from_ref(&a));
        apply_my_day_actions(&conn, TODAY, &ctx, &proposal_for(&ctx, ""), "op-1", &actions_for(&cands, &[0]), 0).unwrap();

        // 手工插入一条 31 天前的旧计划与回执
        conn.execute(
            "INSERT INTO ai_my_day_plans (local_date, plan_id, revision, focus_text, model_snapshot, generated_at, adopted_at)
             VALUES ('2026-09-29', 'old-plan', 1, '', '', '2026-09-29 08:00:00', '2026-09-29 08:05:00')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO ai_my_day_actions (plan_id, display_order, root_task_id, reason, next_step, stop_at, task_fingerprint)
             VALUES ('old-plan', 1, 'task-a-1', 'r', 'n', 's', 'fp')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO ai_my_day_apply_receipts (operation_id, proposal_id, target_date, item_count, content_hash, result)
             VALUES ('op-old', 'prop-old', '2026-09-29', 1, 'h', '{}')",
            [],
        )
        .unwrap();

        cleanup_old_plans(&conn, TODAY).unwrap();
        let plans: i64 = conn.query_row("SELECT COUNT(*) FROM ai_my_day_plans", [], |r| r.get(0)).unwrap();
        let actions: i64 = conn.query_row("SELECT COUNT(*) FROM ai_my_day_actions", [], |r| r.get(0)).unwrap();
        let receipts: i64 = conn.query_row("SELECT COUNT(*) FROM ai_my_day_apply_receipts", [], |r| r.get(0)).unwrap();
        assert_eq!(plans, 1); // 今天的保留
        assert_eq!(actions, 1);
        assert_eq!(receipts, 1); // op-1 保留,op-old 已清
        // 普通任务不受清理影响
        assert!(task_repo::get_by_id(&conn, &a).unwrap().is_some());
    }
}
