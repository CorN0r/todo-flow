use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::ai::breakdown::{BreakdownItem, StoredProposal};
use crate::ai::error::{AiError, AiErrorCode};
use crate::db::task_repo;
use crate::models::task::CreateTaskRequest;

#[derive(Debug, Clone, Serialize)]
pub struct ApplyResult {
    pub created_task_ids: Vec<String>,
    /// true = 重复提交命中幂等回执,直接返回原结果,未重复添加。
    pub already_applied: bool,
}

/// 用户提交内容的规范化指纹(幂等比对:同一 operation 相同内容 → 原结果;不同内容 → 冲突)。
pub fn content_hash(items: &[BreakdownItem]) -> String {
    let mut hasher = Sha256::new();
    for item in items {
        hasher.update(item.title.trim().as_bytes());
        hasher.update(b"\x01");
        hasher.update(item.instructions.trim().as_bytes());
        hasher.update(b"\x02");
    }
    format!("{:x}", hasher.finalize())
}

fn validate_items(items: &[BreakdownItem]) -> Result<(), AiError> {
    if items.is_empty() {
        return Err(AiError::new(AiErrorCode::Validation, "没有选中任何要添加的子任务"));
    }
    for item in items {
        let title = item.title.trim();
        if title.is_empty()
            || title.chars().count() > crate::ai::breakdown::MAX_TITLE_CHARS
            || item.instructions.chars().count() > crate::ai::breakdown::MAX_INSTRUCTIONS_CHARS
        {
            return Err(AiError::new(
                AiErrorCode::Validation,
                "存在标题为空或内容超限的子任务",
            ));
        }
    }
    Ok(())
}

fn stored_task_ids(result_json: &str) -> Vec<String> {
    #[derive(serde::Deserialize)]
    struct ReceiptPayload {
        task_ids: Vec<String>,
    }
    serde_json::from_str::<ReceiptPayload>(result_json)
        .map(|p| p.task_ids)
        .unwrap_or_default()
}

/// 批量采纳事务。调用方负责:先从内存缓存取 StoredProposal、事务提交后 emit task-changed
/// 并清理 proposal 缓存。函数内部单事务完成全部写库步骤,任一失败整批回滚。
pub fn apply_breakdown_items(
    conn: &Connection,
    parent_task_id: &str,
    proposal: &StoredProposal,
    operation_id: &str,
    items: &[BreakdownItem],
) -> Result<ApplyResult, AiError> {
    validate_items(items)?;
    let submitted_hash = content_hash(items);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AiError::new(AiErrorCode::Internal, format!("开启事务失败: {}", e)))?;

    // ① 幂等:同一操作重复提交相同内容 → 原结果;不同内容 → 明确冲突
    let existing: Option<(String, i64, String)> = tx
        .query_row(
            "SELECT proposal_id, item_count, result FROM ai_apply_receipts WHERE operation_id = ?1",
            params![operation_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    if let Some((_pid, _count, result)) = existing {
        let stored = stored_task_ids(&result);
        let stored_hash: Option<String> = tx
            .query_row(
                "SELECT content_hash FROM ai_apply_receipts WHERE operation_id = ?1",
                params![operation_id],
                |row| row.get(0),
            )
            .optional()?;
        if stored_hash.as_deref() == Some(submitted_hash.as_str()) {
            return Ok(ApplyResult {
                created_task_ids: stored,
                already_applied: true,
            });
        }
        return Err(AiError::new(
            AiErrorCode::ApplyConflict,
            "该操作已用其他内容提交过,不能重复使用同一操作标识",
        ));
    }

    // ② 同一建议批次只允许成功采纳一次
    let adopted: Option<String> = tx
        .query_row(
            "SELECT operation_id FROM ai_apply_receipts WHERE proposal_id = ?1",
            params![proposal.proposal_id],
            |row| row.get(0),
        )
        .optional()?;
    if adopted.is_some() {
        return Err(AiError::new(
            AiErrorCode::ApplyConflict,
            "该建议批次已采纳过,如需再添加请重新生成",
        ));
    }

    // ③ 父任务仍有效 + 上下文指纹一致(生成后任务或子任务变了 → 拦截,不落库旧建议)
    let parent = task_repo::get_by_id(&tx, parent_task_id)?
        .ok_or_else(|| AiError::new(AiErrorCode::ContextChanged, "父任务已不存在"))?;
    let deleted_at: Option<Option<String>> = tx
        .query_row(
            "SELECT deleted_at FROM tasks WHERE id = ?1",
            params![parent_task_id],
            |row| row.get(0),
        )
        .optional()?;
    if deleted_at.flatten().is_some()
        || parent.is_archived
        || parent.is_completed
        || parent.is_abandoned
        || parent.is_suspended
    {
        return Err(AiError::new(
            AiErrorCode::ContextChanged,
            "父任务状态已变化(完成/归档/挂起等),请处理后重新生成",
        ));
    }
    if parent.parent_task_id.is_some() {
        return Err(AiError::new(
            AiErrorCode::ContextChanged,
            "该任务不是顶层任务,不能再创建下一级子任务",
        ));
    }
    let children = task_repo::get_children(&tx, parent_task_id)?;
    let current_fp = crate::ai::breakdown::context_fingerprint(&crate::ai::breakdown::BreakdownContext {
        task_title: parent.title.clone(),
        description_text: crate::ai::breakdown::html_to_text(&parent.description),
        existing_children: children
            .iter()
            .map(|c| crate::ai::breakdown::ChildSummary {
                title: c.title.clone(),
                is_completed: c.is_completed,
            })
            .collect(),
        user_note: String::new(),
    });
    if current_fp != proposal.context_fingerprint {
        return Err(AiError::new(
            AiErrorCode::ContextChanged,
            "生成后任务内容发生了变化,请基于当前内容重新生成",
        ));
    }

    // ④ 复用现有创建规则;instructions 纯文本安全写入描述;来源标记 agent;
    //    task_repo 内部同步操作与本事务一起提交
    let mut created_ids = Vec::with_capacity(items.len());
    for item in items {
        let task = task_repo::create(
            &tx,
            CreateTaskRequest {
                title: item.title.trim().to_string(),
                description: Some(item.instructions.trim().to_string()),
                tag_ids: None,
                parent_task_id: Some(parent_task_id.to_string()),
                due_date: None,
                priority: None,
                reminder: None,
                recurrence: None,
                my_day_date: None,
                source: Some("agent".to_string()),
            },
        )?;
        created_ids.push(task.id);
    }

    // ⑤ 回执:操作摘要 + 创建任务 ID;不保存原始提示或候选正文
    let result_json = serde_json::json!({ "task_ids": created_ids }).to_string();
    tx.execute(
        "INSERT INTO ai_apply_receipts (operation_id, proposal_id, task_id, item_count, content_hash, result)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            operation_id,
            proposal.proposal_id,
            parent_task_id,
            items.len() as i64,
            submitted_hash,
            result_json
        ],
    )?;

    tx.commit()
        .map_err(|e| AiError::new(AiErrorCode::Internal, format!("采纳事务提交失败: {}", e)))?;

    Ok(ApplyResult {
        created_task_ids: created_ids,
        already_applied: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::breakdown::{BreakdownOutput, ChildSummary};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::run(&conn).unwrap();
        conn
    }

    fn create_parent(conn: &Connection) -> String {
        let task = task_repo::create(
            conn,
            CreateTaskRequest {
                title: "准备旅行".into(),
                description: Some("<p>去京都</p>".into()),
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

    fn proposal_for(parent_id: &str, fingerprint: String) -> StoredProposal {
        StoredProposal {
            proposal_id: "prop-1".into(),
            task_id: parent_id.to_string(),
            context_fingerprint: fingerprint,
            model_snapshot: "测试连接 (m)".into(),
            created_at: String::new(),
            output: BreakdownOutput {
                assumptions: vec![],
                items: vec![],
            },
        }
    }

    fn fingerprint_of(conn: &Connection, parent_id: &str) -> String {
        let parent = task_repo::get_by_id(conn, parent_id).unwrap().unwrap();
        let children = task_repo::get_children(conn, parent_id).unwrap();
        crate::ai::breakdown::context_fingerprint(&crate::ai::breakdown::BreakdownContext {
            task_title: parent.title,
            description_text: crate::ai::breakdown::html_to_text(&parent.description),
            existing_children: children
                .iter()
                .map(|c| ChildSummary { title: c.title.clone(), is_completed: c.is_completed })
                .collect(),
            user_note: String::new(),
        })
    }

    fn items() -> Vec<BreakdownItem> {
        vec![
            BreakdownItem { title: "订机票".into(), instructions: "比较价格后下单".into() },
            BreakdownItem { title: "订酒店".into(), instructions: "选择车站附近".into() },
        ]
    }

    #[test]
    fn applies_items_with_agent_source_in_one_transaction() {
        let conn = setup();
        let parent = create_parent(&conn);
        let fp = fingerprint_of(&conn, &parent);
        let proposal = proposal_for(&parent, fp);

        let result = apply_breakdown_items(&conn, &parent, &proposal, "op-1", &items()).unwrap();
        assert!(!result.already_applied);
        assert_eq!(result.created_task_ids.len(), 2);

        let children = task_repo::get_children(&conn, &parent).unwrap();
        assert_eq!(children.len(), 2);
        assert!(children.iter().all(|c| c.source.as_deref() == Some("agent")));
        assert_eq!(children[0].title, "订机票");
        assert_eq!(children[0].description, "比较价格后下单");
    }

    #[test]
    fn duplicate_operation_returns_original_result() {
        let conn = setup();
        let parent = create_parent(&conn);
        let fp = fingerprint_of(&conn, &parent);
        let proposal = proposal_for(&parent, fp);

        let first = apply_breakdown_items(&conn, &parent, &proposal, "op-1", &items()).unwrap();
        // 注意:第二次提交时任务已变化(多了子任务),指纹校验会拦截——
        // 幂等回执检查在指纹检查之前,这正是超时重试的安全语义
        let second = apply_breakdown_items(&conn, &parent, &proposal, "op-1", &items()).unwrap();
        assert!(second.already_applied);
        assert_eq!(first.created_task_ids, second.created_task_ids);
        assert_eq!(task_repo::get_children(&conn, &parent).unwrap().len(), 2);
    }

    #[test]
    fn same_operation_different_content_conflicts() {
        let conn = setup();
        let parent = create_parent(&conn);
        let fp = fingerprint_of(&conn, &parent);
        let proposal = proposal_for(&parent, fp);
        apply_breakdown_items(&conn, &parent, &proposal, "op-1", &items()).unwrap();

        let mut changed = items();
        changed[0].title = "改名".into();
        let err = apply_breakdown_items(&conn, &parent, &proposal, "op-1", &changed).unwrap_err();
        assert_eq!(err.code, AiErrorCode::ApplyConflict);
    }

    #[test]
    fn same_proposal_second_adoption_conflicts() {
        let conn = setup();
        let parent = create_parent(&conn);
        let fp = fingerprint_of(&conn, &parent);
        let proposal = proposal_for(&parent, fp);
        apply_breakdown_items(&conn, &parent, &proposal, "op-1", &items()).unwrap();
        let err = apply_breakdown_items(&conn, &parent, &proposal, "op-2", &items()).unwrap_err();
        assert_eq!(err.code, AiErrorCode::ApplyConflict);
    }

    #[test]
    fn context_change_blocks_stale_proposal() {
        let conn = setup();
        let parent = create_parent(&conn);
        let stale = proposal_for(&parent, "old-fingerprint".into());
        let err = apply_breakdown_items(&conn, &parent, &stale, "op-1", &items()).unwrap_err();
        assert_eq!(err.code, AiErrorCode::ContextChanged);
        assert!(task_repo::get_children(&conn, &parent).unwrap().is_empty());
    }

    #[test]
    fn task_changed_after_generation_blocks_apply() {
        let conn = setup();
        let parent = create_parent(&conn);
        let fp_at_generation = fingerprint_of(&conn, &parent);
        let proposal = proposal_for(&parent, fp_at_generation);

        // 生成后用户手动加了子任务 → 指纹变化
        task_repo::create(
            &conn,
            CreateTaskRequest {
                title: "手动子任务".into(),
                description: None,
                tag_ids: None,
                parent_task_id: Some(parent.clone()),
                due_date: None,
                priority: None,
                reminder: None,
                recurrence: None,
                my_day_date: None,
                source: None,
            },
        )
        .unwrap();

        let err = apply_breakdown_items(&conn, &parent, &proposal, "op-1", &items()).unwrap_err();
        assert_eq!(err.code, AiErrorCode::ContextChanged);
        // 原有子任务保留,没有半批写入
        let children = task_repo::get_children(&conn, &parent).unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].title, "手动子任务");
    }

    #[test]
    fn invalid_items_rejected_before_writes() {
        let conn = setup();
        let parent = create_parent(&conn);
        let fp = fingerprint_of(&conn, &parent);
        let proposal = proposal_for(&parent, fp);

        let empty: Vec<BreakdownItem> = vec![];
        assert_eq!(
            apply_breakdown_items(&conn, &parent, &proposal, "op-1", &empty).unwrap_err().code,
            AiErrorCode::Validation
        );
        let blank_title = vec![BreakdownItem { title: "  ".into(), instructions: "".into() }];
        assert_eq!(
            apply_breakdown_items(&conn, &parent, &proposal, "op-2", &blank_title).unwrap_err().code,
            AiErrorCode::Validation
        );
    }
}
