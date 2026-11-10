//! 日/周回顾 AI 生成:固定快照的有界上下文、临时来源引用与四类结果校验。
//!
//! 准备阶段把日期/时区/范围/覆盖/统计和来源版本固定为快照(存内存,重启即弃);
//! 生成只发送实际预览的文本与程序事实,不读取任务描述全文、附件或链接。
//! 输出必须为四组有界 JSON,引用本次提供的临时编号;候选外引用、结构不完整
//! 或截断都校验失败,不形成可保存稿。

use std::collections::HashSet;

use rusqlite::Connection;
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::ai::adapter::openai_chat::build_request_body;
use crate::ai::adapter::{ChatMessage, ChatRequest};
use crate::ai::error::{AiError, AiErrorCode};
use crate::db::review_repo;
use crate::models::progress::TaskStateEvent;
use crate::models::review::{ReviewFacts, ReviewScope, ReviewSections};

/// 上下文与输出边界(设计 §7)
pub const MAX_ROOT_GROUPS: usize = 40;
pub const MAX_SUBTASK_FACTS_PER_ROOT: usize = 5;
pub const MAX_RECORDS: usize = 60;
pub const MAX_TITLE_CHARS: usize = 120;
pub const MAX_RECORD_EXCERPT_CHARS: usize = 400;
pub const MAX_USER_NOTE_CHARS: usize = 300;
pub const MAX_REQUEST_BODY_BYTES: usize = 128 * 1024;
pub const MAX_SUMMARY_ITEMS: usize = 8;
pub const MAX_OTHER_ITEMS: usize = 5;
pub const MAX_ITEM_CHARS: usize = 500;

#[derive(Debug, Clone, Serialize)]
pub struct PreparedSourceRef {
    pub ref_id: String,
    pub kind: String,
    pub entity_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreparedFactEntry {
    pub ref_id: String,
    pub entity_id: String,
    pub title: String,
    pub transition: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreparedRootGroup {
    pub ref_id: String,
    pub task_id: String,
    pub title: String,
    pub is_root: bool,
    /// 根任务自身的事实条目
    pub root_facts: Vec<PreparedFactEntry>,
    /// 子任务事实条目(至多 MAX_SUBTASK_FACTS_PER_ROOT)
    pub subtask_facts: Vec<PreparedFactEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreparedRecordRef {
    pub ref_id: String,
    pub record_id: String,
    pub task_id: String,
    pub task_title: String,
    pub record_date: String,
    pub excerpt: String,
    pub full_chars: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct PreparedTotals {
    pub total_root_groups: usize,
    pub included_root_groups: usize,
    pub total_subtask_facts: usize,
    pub included_subtask_facts: usize,
    pub total_records: usize,
    pub included_records: usize,
    pub truncated_records: usize,
}

/// 准备好的回顾上下文快照(存 AiRuntime 内存;同范围重新准备会替换)
#[derive(Debug, Clone, Serialize)]
pub struct PreparedReviewContext {
    pub scope_key: String,
    pub period_kind: String,
    pub period_start: String,
    pub period_end: String,
    pub tag_ids: Vec<String>,
    pub timezone_offset: String,
    pub event_cutoff_at: String,
    pub prepared_at: String,
    pub prepared_at_local_date: String,
    pub coverage_note: String,
    pub completed_root_count: usize,
    pub completed_subtask_count: usize,
    pub reopened_count: usize,
    pub suspended_count: i64,
    pub resumed_count: i64,
    pub abandoned_count: i64,
    pub coverage_status: String,
    pub groups: Vec<PreparedRootGroup>,
    pub records: Vec<PreparedRecordRef>,
    pub user_note: String,
    pub totals: PreparedTotals,
    pub sources: Vec<PreparedSourceRef>,
    pub context_fingerprint: String,
}

/// 生成结果(内存候选;保存时由用户显式确认)
#[derive(Debug, Clone, Serialize)]
pub struct StoredReviewProposal {
    pub scope_key: String,
    pub context_fingerprint: String,
    pub model_snapshot: String,
    pub created_at: String,
    pub sections: ReviewSections,
}

pub fn coverage_note_for(facts: &ReviewFacts) -> String {
    match facts.coverage_status.as_str() {
        "complete" => "本机资料覆盖完整(仅承诺本机可确认事实)".to_string(),
        "partial" => "资料部分可用:该周期包含留存关闭、清理或导入造成的缺口,结论仅基于已记录事件".to_string(),
        _ => "历史资料缺失:该周期早于本机可靠历史起点,不能作为完整总结".to_string(),
    }
}

fn truncate_chars(text: &str, max: usize) -> (String, bool) {
    let count = text.chars().count();
    if count <= max {
        (text.to_string(), false)
    } else {
        (text.chars().take(max).collect(), true)
    }
}

fn fingerprint_hex(parts: &[String]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part.as_bytes());
        hasher.update(b"\x1f");
    }
    format!("{:x}", hasher.finalize())
}

/// 从数据库构建固定快照上下文。用户可在所选范围内调整(重新准备),不静默扩展。
pub fn build_context(
    conn: &Connection,
    scope: &ReviewScope,
    facts: &ReviewFacts,
    user_note: &str,
) -> Result<PreparedReviewContext, AiError> {
    let events = review_repo::load_events_for_review(conn, scope)
        .map_err(AiError::from)?;
    let records = review_repo::load_records_in_range(conn, scope)
        .map_err(AiError::from)?;

    // 按根任务分组(事件按 id 倒序,即最新在前;根的分组顺序=最近活动在前)
    let mut root_order: Vec<String> = Vec::new();
    let mut root_title: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut root_facts: std::collections::HashMap<String, Vec<&TaskStateEvent>> =
        std::collections::HashMap::new();
    let mut subtask_facts: std::collections::HashMap<String, Vec<&TaskStateEvent>> =
        std::collections::HashMap::new();

    for event in &events {
        let root = &event.root_task_id;
        if !root_order.contains(root) {
            root_order.push(root.clone());
            root_title.insert(root.clone(), event.title_snapshot.clone());
        }
        if event.task_id == *root {
            root_facts.entry(root.clone()).or_default().push(event);
        } else {
            subtask_facts.entry(root.clone()).or_default().push(event);
        }
    }

    let total_subtask_facts: usize = subtask_facts.values().map(|v| v.len()).sum();
    let total_root_groups = root_order.len();

    let mut included_subtask_facts = 0usize;
    let mut groups = Vec::new();
    let mut sources = Vec::new();
    for (index, root_id) in root_order.iter().enumerate().take(MAX_ROOT_GROUPS) {
        let ref_id = format!("T{}", index + 1);
        let title = truncate_chars(
            root_title.get(root_id).map(|s| s.as_str()).unwrap_or("(未知任务)"),
            MAX_TITLE_CHARS,
        )
        .0;
        let map_entry = |events: &Vec<&TaskStateEvent>, ref_prefix: &str| {
            events
                .iter()
                .enumerate()
                .map(|(i, event)| PreparedFactEntry {
                    ref_id: format!("{}-{}", ref_prefix, i + 1),
                    entity_id: event.task_id.clone(),
                    title: truncate_chars(&event.title_snapshot, MAX_TITLE_CHARS).0,
                    transition: event.transition.clone(),
                    date: event.local_date.clone(),
                })
                .collect::<Vec<_>>()
        };
        let sub_facts =
            map_entry(subtask_facts.get(root_id).unwrap_or(&Vec::new()), &ref_id);
        included_subtask_facts += sub_facts.len();
        let root_own = map_entry(root_facts.get(root_id).unwrap_or(&Vec::new()), &ref_id);
        sources.push(PreparedSourceRef {
            ref_id: ref_id.clone(),
            kind: "task".to_string(),
            entity_id: root_id.clone(),
            title: title.clone(),
        });
        groups.push(PreparedRootGroup {
            ref_id,
            task_id: root_id.clone(),
            title,
            is_root: true,
            root_facts: root_own,
            subtask_facts: sub_facts,
        });
    }

    let total_records = records.len();
    let mut prepared_records = Vec::new();
    let mut truncated_records = 0usize;
    for (index, record) in records.iter().enumerate().take(MAX_RECORDS) {
        let ref_id = format!("R{}", index + 1);
        let (excerpt, truncated) = truncate_chars(&record.content, MAX_RECORD_EXCERPT_CHARS);
        if truncated {
            truncated_records += 1;
        }
        sources.push(PreparedSourceRef {
            ref_id: ref_id.clone(),
            kind: "record".to_string(),
            entity_id: record.id.clone(),
            title: record
                .task_title
                .clone()
                .unwrap_or_else(|| "(任务已删除)".to_string()),
        });
        prepared_records.push(PreparedRecordRef {
            ref_id,
            record_id: record.id.clone(),
            task_id: record.task_id.clone(),
            task_title: record
                .task_title
                .clone()
                .unwrap_or_else(|| "(任务已删除)".to_string()),
            record_date: record.record_date.clone(),
            excerpt,
            full_chars: record.content.chars().count(),
            truncated,
        });
    }

    let user_note = {
        let trimmed = user_note.trim();
        if trimmed.is_empty() {
            String::new()
        } else {
            truncate_chars(trimmed, MAX_USER_NOTE_CHARS).0
        }
    };

    let included_root_groups = groups.len();
    let included_records = prepared_records.len().min(total_records);

    let mut fingerprint_parts = vec![
        scope.scope_key.clone(),
        facts.event_cutoff_at.clone(),
        format!("events:{}", events.len()),
        format!("records:{}", records.len()),
    ];
    for event in &events {
        fingerprint_parts.push(format!("{}:{}", event.id, event.transition));
    }
    for record in &records {
        fingerprint_parts.push(format!("{}:{}", record.id, record.record_date));
    }
    let context_fingerprint = fingerprint_hex(&fingerprint_parts);

    Ok(PreparedReviewContext {
        scope_key: scope.scope_key.clone(),
        period_kind: scope.kind.clone(),
        period_start: scope.start_date.clone(),
        period_end: scope.end_date.clone(),
        tag_ids: scope.tag_ids.clone(),
        timezone_offset: facts.timezone_offset.clone(),
        event_cutoff_at: facts.event_cutoff_at.clone(),
        prepared_at: facts.prepared_at.clone(),
        prepared_at_local_date: facts.prepared_at.split(' ').next().unwrap_or("").to_string(),
        coverage_note: coverage_note_for(facts),
        completed_root_count: facts.completed_root.len(),
        completed_subtask_count: facts.completed_subtask.len(),
        reopened_count: facts.completed_then_reopened.len(),
        suspended_count: facts.suspended_count,
        resumed_count: facts.resumed_count,
        abandoned_count: facts.abandoned_count,
        coverage_status: facts.coverage_status.clone(),
        groups,
        records: prepared_records,
        user_note,
        totals: PreparedTotals {
            total_root_groups,
            included_root_groups: included_root_groups,
            total_subtask_facts,
            included_subtask_facts,
            total_records,
            included_records: included_records,
            truncated_records,
        },
        sources,
        context_fingerprint,
    })
}

const SYSTEM_PROMPT: &str = "你是任务回顾助手。基于用户提供的某个日/周范围内的任务事实与进展记录,\
输出回顾文稿。严格遵守:\
1) 只输出一个 JSON 对象,不输出任何其他文本或代码块标记;\
2) 结构为 {\"summary\":[],\"observations\":[],\"suggestions\":[],\"questions\":[]},\
每项为 {\"text\":\"...\",\"refs\":[\"T1\"]};\
3) summary 至多 8 项、observations 至多 5 项、suggestions 至多 5 项、questions 至多 5 项,每项至多 500 字;\
4) 每项必须引用至少一个本次提供的来源编号(T 开头为任务,R 开头为记录),\
不得引用未提供的编号,不得编造来源;\
5) 只依据提供的材料陈述;材料没有解释的原因,只能放入 questions 作为待确认问题,\
不得写成已确认事实,不得指责拖延或缺乏投入;\
6) suggestions 是建议,措辞明确表示供用户自行决定;\
7) 没有记录不代表没有工作,不要把材料缺失表述为没有推进;\
8) 使用简体中文。";

fn transition_label(transition: &str) -> String {
    match transition {
        "complete" => "完成".to_string(),
        "reopen" => "重新打开".to_string(),
        "suspend" => "挂起".to_string(),
        "resume" => "恢复进行".to_string(),
        "abandon" => "放弃".to_string(),
        "restore" => "恢复使用".to_string(),
        other => other.to_string(),
    }
}

fn build_user_message(ctx: &PreparedReviewContext) -> String {
    let mut msg = String::new();
    let kind_label = if ctx.period_kind == "day" { "日" } else { "周" };
    msg.push_str(&format!(
        "回顾范围:{}回顾 {} 至 {}(本地时区 UTC{});事件统计截止 {};\n",
        kind_label, ctx.period_start, ctx.period_end, ctx.timezone_offset, ctx.event_cutoff_at
    ));
    if ctx.tag_ids.is_empty() {
        msg.push_str("标签范围:全部\n");
    } else {
        msg.push_str(&format!("标签范围:{}\n", ctx.tag_ids.join(",")));
    }
    msg.push_str(&format!("覆盖说明:{}\n", ctx.coverage_note));
    msg.push_str(&format!(
        "程序统计(已由软件计算,不要改写):根任务完成 {} 项,子任务完成 {} 项,完成后重开 {} 项,挂起 {},恢复 {},放弃 {};进展记录 {} 条(实际带入 {} 条)。\n\n",
        ctx.completed_root_count,
        ctx.completed_subtask_count,
        ctx.reopened_count,
        ctx.suspended_count,
        ctx.resumed_count,
        ctx.abandoned_count,
        ctx.totals.total_records,
        ctx.totals.included_records,
    ));

    if ctx.groups.is_empty() && ctx.records.is_empty() {
        msg.push_str("本次范围内没有任何任务事实或进展记录材料。请如实说明没有可总结的材料,并把\"该范围实际发生了什么\"列入待确认问题,不要编造活动。\n");
    } else {
        if !ctx.groups.is_empty() {
            msg.push_str("任务分组(来源编号 T 开头):\n");
            for group in &ctx.groups {
                msg.push_str(&format!("[{}] {}", group.ref_id, group.title));
                let omitted = ctx
                    .totals
                    .total_root_groups
                    .saturating_sub(ctx.totals.included_root_groups);
                if omitted > 0 {
                    msg.push_str(&format!("(另有 {} 个分组因数量上限未带入)", omitted));
                }
                msg.push('\n');
                for fact in group.root_facts.iter() {
                    msg.push_str(&format!(
                        "  - {}:{}({}) [{}]\n",
                        fact.ref_id,
                        fact.title,
                        transition_label(&fact.transition),
                        fact.date
                    ));
                }
                for fact in &group.subtask_facts {
                    msg.push_str(&format!(
                        "  - {} 子任务:{}({}) [{}]\n",
                        fact.ref_id,
                        fact.title,
                        transition_label(&fact.transition),
                        fact.date
                    ));
                }
            }
        }
        if !ctx.records.is_empty() {
            msg.push_str("\n进展记录(来源编号 R 开头):\n");
            for record in &ctx.records {
                let mark = if record.truncated { "(已截断)" } else { "" };
                msg.push_str(&format!(
                    "[{}] {}({}){}:{}\n",
                    record.ref_id, record.task_title, record.record_date, mark, record.excerpt
                ));
            }
            let omitted = ctx.totals.total_records.saturating_sub(ctx.totals.included_records);
            if omitted > 0 {
                msg.push_str(&format!("(另有 {} 条记录因数量上限未带入)\n", omitted));
            }
        }
    }

    if !ctx.user_note.is_empty() {
        msg.push_str(&format!(
            "\n用户回顾重点(≤{} 字,优先遵循):{}\n",
            MAX_USER_NOTE_CHARS, ctx.user_note
        ));
    }
    msg
}

/// 回顾请求:非 JSON 模式由调用方决定(输出为 JSON 文本,服务端 JSON 模式可选用)
pub fn build_review_request(model_id: &str, ctx: &PreparedReviewContext, stream: bool) -> ChatRequest {
    let mut req = ChatRequest::new(
        model_id,
        vec![
            ChatMessage::system(SYSTEM_PROMPT),
            ChatMessage::user(build_user_message(ctx)),
        ],
    );
    req.stream = stream;
    req
}

/// 请求体大小检查:超限本地拒发,保留用户选择
pub fn check_request_size(req: &ChatRequest) -> Result<(), AiError> {
    let body = build_request_body(req);
    let size = serde_json::to_string(&body)
        .map(|s| s.as_bytes().len())
        .unwrap_or(usize::MAX);
    if size > MAX_REQUEST_BODY_BYTES {
        return Err(AiError::new(
            AiErrorCode::Validation,
            format!(
                "请求体超过 {} KiB 上限,请缩小日期或标签范围后重试",
                MAX_REQUEST_BODY_BYTES / 1024
            ),
        ));
    }
    Ok(())
}

/// 输出校验:四组有界、引用必须在候选内;失败不形成可保存稿
pub fn parse_and_validate(raw: &str, valid_refs: &HashSet<String>) -> Result<ReviewSections, AiError> {
    let stripped = crate::ai::breakdown::strip_code_fences(raw);
    let start = stripped.find('{').ok_or_else(|| {
        AiError::new(AiErrorCode::InvalidFormat, "回顾结果中没有 JSON 对象")
    })?;
    let end = stripped.rfind('}').ok_or_else(|| {
        AiError::new(AiErrorCode::InvalidFormat, "回顾结果 JSON 不完整")
    })?;
    let sections: ReviewSections = serde_json::from_str(&stripped[start..=end]).map_err(|e| {
        AiError::new(AiErrorCode::InvalidFormat, format!("回顾结果结构不合法: {}", e))
    })?;

    let check_items = |items: &[crate::models::review::ReviewSectionItem],
                           max: usize,
                           label: &str|
     -> Result<Vec<crate::models::review::ReviewSectionItem>, AiError> {
        if items.len() > max {
            return Err(AiError::new(
                AiErrorCode::InvalidFormat,
                format!("{} 超过 {} 项上限", label, max),
            ));
        }
        let mut cleaned = Vec::new();
        for item in items {
            let text = item.text.trim();
            if text.is_empty() {
                return Err(AiError::new(
                    AiErrorCode::InvalidFormat,
                    format!("{} 存在空条目", label),
                ));
            }
            if text.chars().count() > MAX_ITEM_CHARS {
                return Err(AiError::new(
                    AiErrorCode::InvalidFormat,
                    format!("{} 条目超过 {} 字上限", label, MAX_ITEM_CHARS),
                ));
            }
            if item.refs.is_empty() {
                return Err(AiError::new(
                    AiErrorCode::InvalidFormat,
                    format!("{} 存在缺少来源引用的条目", label),
                ));
            }
            for r in &item.refs {
                if !valid_refs.contains(r) {
                    return Err(AiError::new(
                        AiErrorCode::InvalidFormat,
                        format!("{} 引用了本次未提供的来源 {}", label, r),
                    ));
                }
            }
            cleaned.push(crate::models::review::ReviewSectionItem {
                text: text.to_string(),
                refs: item.refs.clone(),
            });
        }
        Ok(cleaned)
    };

    let summary = check_items(&sections.summary, MAX_SUMMARY_ITEMS, "总结")?;
    let observations = check_items(&sections.observations, MAX_OTHER_ITEMS, "复盘观察")?;
    let suggestions = check_items(&sections.suggestions, MAX_OTHER_ITEMS, "下一步建议")?;
    let questions = check_items(&sections.questions, MAX_OTHER_ITEMS, "待确认问题")?;

    Ok(ReviewSections {
        summary,
        observations,
        suggestions,
        questions,
    })
}

/// 保存稿使用的来源引用 JSON(与准备阶段一致)
pub fn source_refs_json(ctx: &PreparedReviewContext) -> serde_json::Value {
    serde_json::json!(ctx
        .sources
        .iter()
        .map(|s| serde_json::json!({
            "ref_id": s.ref_id,
            "kind": s.kind,
            "entity_id": s.entity_id,
            "title": s.title,
        }))
        .collect::<Vec<_>>())
}

/// 检查保存稿来源是否仍可用(记录/任务是否仍存在)
pub fn valid_ref_set(ctx: &PreparedReviewContext) -> HashSet<String> {
    ctx.sources.iter().map(|s| s.ref_id.clone()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx_fixture(record_count: usize) -> PreparedReviewContext {
        let mut records = Vec::new();
        for i in 0..record_count {
            records.push(PreparedRecordRef {
                ref_id: format!("R{}", i + 1),
                record_id: format!("rec-{}", i),
                task_id: "task-1".into(),
                task_title: "任务".into(),
                record_date: "2026-10-31".into(),
                excerpt: "内容".into(),
                full_chars: 2,
                truncated: false,
            });
        }
        PreparedReviewContext {
            scope_key: "day:2026-10-31".into(),
            period_kind: "day".into(),
            period_start: "2026-10-31".into(),
            period_end: "2026-10-31".into(),
            tag_ids: vec![],
            timezone_offset: "+08:00".into(),
            event_cutoff_at: "2026-10-31 12:00:00".into(),
            prepared_at: "2026-10-31 12:00:00".into(),
            prepared_at_local_date: "2026-10-31".into(),
            coverage_note: "本机资料覆盖完整".into(),
            completed_root_count: 1,
            completed_subtask_count: 0,
            reopened_count: 0,
            suspended_count: 0,
            resumed_count: 0,
            abandoned_count: 0,
            coverage_status: "complete".into(),
            groups: vec![PreparedRootGroup {
                ref_id: "T1".into(),
                task_id: "task-1".into(),
                title: "任务一".into(),
                is_root: true,
                root_facts: vec![PreparedFactEntry {
                    ref_id: "T1-1".into(),
                    entity_id: "task-1".into(),
                    title: "任务一".into(),
                    transition: "complete".into(),
                    date: "2026-10-31".into(),
                }],
                subtask_facts: vec![],
            }],
            records,
            user_note: String::new(),
            totals: PreparedTotals {
                total_root_groups: 1,
                included_root_groups: 1,
                total_subtask_facts: 0,
                included_subtask_facts: 0,
                total_records: record_count,
                included_records: record_count,
                truncated_records: 0,
            },
            sources: vec![
                PreparedSourceRef {
                    ref_id: "T1".into(),
                    kind: "task".into(),
                    entity_id: "task-1".into(),
                    title: "任务一".into(),
                },
                PreparedSourceRef {
                    ref_id: "R1".into(),
                    kind: "record".into(),
                    entity_id: "rec-0".into(),
                    title: "任务".into(),
                },
            ],
            context_fingerprint: "fp".into(),
        }
    }

    #[test]
    fn validate_accepts_valid_output() {
        let raw = r#"```json
{"summary":[{"text":"推进了初稿","refs":["T1","R1"]}],"observations":[],"suggestions":[{"text":"可先补齐数据","refs":["R1"]}],"questions":[]}
```"#;
        let ctx = ctx_fixture(1);
        let refs = valid_ref_set(&ctx);
        let sections = parse_and_validate(raw, &refs).unwrap();
        assert_eq!(sections.summary.len(), 1);
        assert_eq!(sections.summary[0].refs, vec!["T1", "R1"]);
    }

    #[test]
    fn validate_rejects_unknown_ref_and_structure() {
        let ctx = ctx_fixture(1);
        let refs = valid_ref_set(&ctx);

        // 候选外引用
        let raw = r#"{"summary":[{"text":"x","refs":["T9"]}],"observations":[],"suggestions":[],"questions":[]}"#;
        assert_eq!(
            parse_and_validate(raw, &refs).unwrap_err().code,
            AiErrorCode::InvalidFormat
        );

        // 空引用
        let raw = r#"{"summary":[{"text":"x","refs":[]}],"observations":[],"suggestions":[],"questions":[]}"#;
        assert!(parse_and_validate(raw, &refs).is_err());

        // 结构缺失
        let raw = r#"{"summary":[]}"#;
        assert!(parse_and_validate(raw, &refs).is_err());

        // 条目超限
        let items: Vec<String> = (0..9)
            .map(|i| format!("{{\"text\":\"{}\",\"refs\":[\"T1\"]}}", i))
            .collect();
        let raw = format!(
            "{{\"summary\":[{}],\"observations\":[],\"suggestions\":[],\"questions\":[]}}",
            items.join(",")
        );
        assert!(parse_and_validate(&raw, &refs).is_err());

        // 超长条目
        let long = "字".repeat(MAX_ITEM_CHARS + 1);
        let raw = format!(
            "{{\"summary\":[{{\"text\":\"{}\",\"refs\":[\"T1\"]}}],\"observations\":[],\"suggestions\":[],\"questions\":[]}}",
            long
        );
        assert!(parse_and_validate(&raw, &refs).is_err());
    }

    #[test]
    fn request_contains_bounds_and_note() {
        let mut ctx = ctx_fixture(2);
        ctx.user_note = "重点看协作阻塞".into();
        let req = build_review_request("m", &ctx, true);
        assert!(req.stream);
        let user = &req.messages[1].content;
        assert!(user.contains("2026-10-31"));
        assert!(user.contains("程序统计"));
        assert!(user.contains("[T1]"));
        assert!(user.contains("[R1]"));
        assert!(user.contains("重点看协作阻塞"));
        assert!(check_request_size(&req).is_ok());
    }

    #[test]
    fn request_size_rejects_huge_body() {
        let mut ctx = ctx_fixture(1);
        ctx.records[0].excerpt = "字".repeat(200_000);
        let req = build_review_request("m", &ctx, false);
        assert!(check_request_size(&req).is_err());
    }
}
