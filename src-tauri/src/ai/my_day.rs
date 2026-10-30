use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::ai::adapter::{ChatMessage, ChatRequest};
use crate::ai::breakdown::html_to_text;
use crate::ai::error::{AiError, AiErrorCode};
use crate::models::task::Task;

/// 今日行动建议的数量与长度上限(统一业务校验;变更设计 §2/§3/§4)。
pub const MAX_ROOT_TASKS: usize = 20;
pub const MAX_SUBTASKS_PER_ROOT: usize = 5;
pub const MIN_TARGET_COUNT: usize = 1;
pub const MAX_TARGET_COUNT: usize = 5;
pub const DEFAULT_TARGET_COUNT: usize = 3;
/// 「置顶或高优先级」分组阈值:priority 3=高、4=紧急。
pub const HIGH_PRIORITY: i32 = 3;
/// 未来多少个自然日内到期算「近期到期」组。
pub const UPCOMING_DAYS: i64 = 7;

pub const MAX_TITLE_CHARS: usize = 120;
pub const MAX_DESC_CHARS: usize = 300;
pub const MAX_SUBTASK_TITLE_CHARS: usize = 120;
pub const MAX_SUBTASK_DESC_CHARS: usize = 100;
pub const MAX_REASON_CHARS: usize = 200;
pub const MAX_STEP_CHARS: usize = 300;
pub const MAX_ASSUMPTIONS: usize = 5;
pub const MAX_ASSUMPTION_CHARS: usize = 200;
pub const MAX_NOT_SELECTED: usize = 3;
pub const MAX_FOCUS_NOTE_CHARS: usize = 300;
/// 最终序列化请求体上限;超限本地拒绝,提示缩小范围。
pub const MAX_REQUEST_BYTES: usize = 128 * 1024;

/// 软件当前本地日期(YYYY-MM-DD)。准备与采纳都以本机日期为准,模型不计算「今天」。
pub fn today_local() -> String {
    chrono::Local::now().date_naive().format("%Y-%m-%d").to_string()
}

/// 候选分组,数值越小越先占候选名额(design §2:
/// 显式补入 → 超期 → 未来 7 日 → 置顶/高优先 → 无截止日期 → 其他)。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CandidateGroup {
    Manual,
    Overdue,
    Upcoming,
    PinnedHigh,
    NoDueDate,
    Other,
}

impl CandidateGroup {
    fn rank(self) -> u8 {
        match self {
            CandidateGroup::Manual => 0,
            CandidateGroup::Overdue => 1,
            CandidateGroup::Upcoming => 2,
            CandidateGroup::PinnedHigh => 3,
            CandidateGroup::NoDueDate => 4,
            CandidateGroup::Other => 5,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            CandidateGroup::Manual => "manual",
            CandidateGroup::Overdue => "overdue",
            CandidateGroup::Upcoming => "upcoming",
            CandidateGroup::PinnedHigh => "pinned_high",
            CandidateGroup::NoDueDate => "no_due_date",
            CandidateGroup::Other => "other",
        }
    }
}

/// 共享可执行判定:未删除(get_all 已滤)、未归档、未完成、未挂起、未放弃。
pub fn is_executable(task: &Task) -> bool {
    !task.is_archived && !task.is_completed && !task.is_suspended && !task.is_abandoned
}

fn due_day(task: &Task) -> Option<&str> {
    task.due_date.as_deref().map(|d| &d[..d.len().min(10)])
}

fn group_of(task: &Task, today: &str, manual: &HashSet<String>, today_end: &str) -> CandidateGroup {
    if manual.contains(&task.id) {
        return CandidateGroup::Manual;
    }
    match due_day(task) {
        Some(d) if d < today => CandidateGroup::Overdue,
        Some(d) if d <= today_end => CandidateGroup::Upcoming,
        Some(_) => {
            if task.is_pinned || task.priority >= HIGH_PRIORITY {
                CandidateGroup::PinnedHigh
            } else {
                CandidateGroup::Other
            }
        }
        None => {
            if task.is_pinned || task.priority >= HIGH_PRIORITY {
                CandidateGroup::PinnedHigh
            } else {
                CandidateGroup::NoDueDate
            }
        }
    }
}

/// 组内排序:优先级降序、有效截止日期升序(无日期在后)、创建时间升序、ID 稳定兜底。
fn compare_in_group(a: &Task, b: &Task) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    b.priority
        .cmp(&a.priority)
        .then_with(|| match (due_day(a), due_day(b)) {
            (Some(x), Some(y)) => x.cmp(y),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => Ordering::Equal,
        })
        .then_with(|| a.created_at.cmp(&b.created_at))
        .then_with(|| a.id.cmp(&b.id))
}

/// 第一阶段:从范围内可执行根任务中按分组选出候选。
/// 输入应为已按状态与范围过滤的根任务;今日已加入身份不影响占位顺序。
/// `omitted` 为合格但受数量上限未带入的根任务(按同序排列),供界面手动补入。
pub struct RootSelection {
    pub selected: Vec<(CandidateGroup, Task)>,
    pub eligible_total: usize,
    pub omitted: Vec<Task>,
}

pub fn select_candidate_roots(
    roots: &[Task],
    today: &str,
    manual_task_ids: &HashSet<String>,
) -> RootSelection {
    let today_end = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d")
        .map(|d| (d + chrono::Duration::days(UPCOMING_DAYS)).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| today.to_string());

    let mut grouped: Vec<(CandidateGroup, &Task)> = roots
        .iter()
        .filter(|t| t.parent_task_id.is_none() && is_executable(t))
        .map(|t| (group_of(t, today, manual_task_ids, &today_end), t))
        .collect();
    let eligible_total = grouped.len();
    grouped.sort_by(|(ga, a), (gb, b)| ga.rank().cmp(&gb.rank()).then_with(|| compare_in_group(a, b)));

    // 同一任务只会落在一个组,无需再去重;只截取数量
    let ordered: Vec<(CandidateGroup, &Task)> = grouped;
    let selected = ordered
        .iter()
        .take(MAX_ROOT_TASKS)
        .map(|(g, t)| (*g, (*t).clone()))
        .collect();
    let omitted = ordered.iter().skip(MAX_ROOT_TASKS).map(|(_, t)| (*t).clone()).collect();
    RootSelection {
        selected,
        eligible_total,
        omitted,
    }
}

fn truncate_chars(s: &str, max: usize) -> (String, bool) {
    if s.chars().count() <= max {
        (s.to_string(), false)
    } else {
        (s.chars().take(max).collect(), true)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CandidateSubtask {
    pub subtask_id: String,
    pub temp_ref: String,
    pub title: String,
    pub instructions: String,
    pub is_completed: bool,
}

/// 可执行但未纳入上下文的子任务摘要(不发给模型,仅供界面替换选择)。
#[derive(Debug, Clone, Serialize)]
pub struct OmittedSubtask {
    pub subtask_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MyDayCandidate {
    pub task_id: String,
    pub temp_ref: String,
    pub title: String,
    pub description_text: String,
    pub due_date: Option<String>,
    pub priority: i32,
    pub is_pinned: bool,
    pub already_in_my_day: bool,
    pub group: CandidateGroup,
    pub subtasks: Vec<CandidateSubtask>,
    pub truncated_desc: bool,
    pub omitted_subtasks: usize,
    /// 可执行但未纳入的子任务明细,界面替换纳入用。
    pub omitted_subtask_details: Vec<OmittedSubtask>,
    /// 准备时的完整内容指纹(不含 my_day_date;采纳前重算比对)。
    pub fingerprint: String,
}

/// 任务完整内容指纹:标题 + 描述全文(非发送给模型的截断文本)+ 日期/优先级/置顶事实
/// + 全部子任务(标题,完成态)。不包含 my_day_date——采纳本身会写该字段。
pub fn task_fingerprint(task: &Task, children: &[(String, bool)]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(task.title.trim().as_bytes());
    hasher.update(b"\x00");
    hasher.update(html_to_text(&task.description).trim().as_bytes());
    hasher.update(b"\x00");
    hasher.update(task.due_date.as_deref().unwrap_or("").as_bytes());
    hasher.update(b"\x00");
    hasher.update(task.priority.to_le_bytes());
    hasher.update(if task.is_pinned { b"\x01" } else { b"\x00" });
    hasher.update(b"\x00");
    for (title, completed) in children {
        hasher.update(title.trim().as_bytes());
        hasher.update(if *completed { b"\x01" } else { b"\x00" });
    }
    format!("{:x}", hasher.finalize())
}

/// 第二阶段:为选中的根任务构建候选快照(子任务摘要 + 指纹 + 截断标记)。
/// `children_by_root` 只需包含选中根任务;`subtask_picks` 允许用户替换纳入的子任务
/// (仍须为该根任务的可执行子任务,至多 5 个,超出按原顺序截断)。
pub fn build_snapshot(
    selected: &[(CandidateGroup, Task)],
    children_by_root: &HashMap<String, Vec<Task>>,
    today: &str,
    subtask_picks: &HashMap<String, Vec<String>>,
) -> Vec<MyDayCandidate> {
    selected
        .iter()
        .enumerate()
        .map(|(idx, (group, task))| {
            let temp_ref = format!("t{:02}", idx + 1);
            let all_children = children_by_root.get(&task.id).cloned().unwrap_or_default();
            let executable: Vec<&Task> = all_children.iter().filter(|c| is_executable(c)).collect();

            let picked_ids = subtask_picks.get(&task.id);
            let mut chosen: Vec<&&Task> = match picked_ids {
                Some(ids) => {
                    let id_set: HashSet<&String> = ids.iter().collect();
                    executable.iter().filter(|c| id_set.contains(&c.id)).collect()
                }
                None => executable.iter().take(MAX_SUBTASKS_PER_ROOT).collect(),
            };
            chosen.truncate(MAX_SUBTASKS_PER_ROOT);
            let chosen_ids: HashSet<&str> = chosen.iter().map(|c| c.id.as_str()).collect();
            let omitted_details = executable
                .iter()
                .filter(|c| !chosen_ids.contains(c.id.as_str()))
                .map(|c| OmittedSubtask {
                    subtask_id: c.id.clone(),
                    title: truncate_chars(c.title.trim(), MAX_SUBTASK_TITLE_CHARS).0,
                })
                .collect();
            let omitted = executable.len().saturating_sub(chosen.len());

            let subtasks = chosen
                .iter()
                .enumerate()
                .map(|(sidx, c)| {
                    let (title, _) = truncate_chars(c.title.trim(), MAX_SUBTASK_TITLE_CHARS);
                    let (instructions, _) =
                        truncate_chars(html_to_text(&c.description).trim(), MAX_SUBTASK_DESC_CHARS);
                    CandidateSubtask {
                        subtask_id: c.id.clone(),
                        temp_ref: format!("{}.s{:02}", temp_ref, sidx + 1),
                        title,
                        instructions,
                        is_completed: c.is_completed,
                    }
                })
                .collect();

            let (desc, truncated) =
                truncate_chars(html_to_text(&task.description).trim(), MAX_DESC_CHARS);
            MyDayCandidate {
                task_id: task.id.clone(),
                temp_ref,
                title: truncate_chars(task.title.trim(), MAX_TITLE_CHARS).0,
                description_text: desc,
                due_date: task.due_date.clone(),
                priority: task.priority,
                is_pinned: task.is_pinned,
                already_in_my_day: task.my_day_date.as_deref() == Some(today),
                group: *group,
                subtasks,
                truncated_desc: truncated,
                omitted_subtasks: omitted,
                omitted_subtask_details: omitted_details,
                fingerprint: task_fingerprint(
                    task,
                    &all_children
                        .iter()
                        .map(|c| (c.title.clone(), c.is_completed))
                        .collect::<Vec<_>>(),
                ),
            }
        })
        .collect()
}

// ---------- 提示词 ----------

const SYSTEM_PROMPT: &str = "你是今日行动规划助手。从给定的候选任务中选出今天值得推进的少量重点,\
并说明理由、下一步行动和本次停止标准。\
只输出一个 JSON 对象,不要输出任何其他文字、解释或代码块标记。格式:\
{\"assumptions\":[\"需要用户确认的假设\"],\"actions\":[{\"task_ref\":\"t01\",\"subtask_ref\":\"t01.s02\",\"reason\":\"推荐理由\",\"next_step\":\"下一步行动\",\"stop_at\":\"本次停止标准\"}],\"not_selected\":[{\"task_ref\":\"t05\",\"reason\":\"未选原因\"}]}\
要求:\
- actions 数量为 1 到推荐数量,每个根任务至多一项;task_ref 只能使用候选清单中给出的引用。\
- subtask_ref 可省略;给出时只能指向该根任务下列出的子任务,表示这次先推进这一步。\
- reason 说明为什么今天值得推进;next_step 是马上可以开始的第一个动作;stop_at 描述这次做到哪里可以停。\
- 必做任务必须出现在 actions 中;排除任务不能出现在 actions 中。\
- assumptions 是信息模糊时的假设,没有则为空数组;not_selected 至多 3 项,只解释取舍。\
- 不要发明新任务、新日期或新优先级;不要输出任务 ID、预计耗时或日历时段。";

pub struct PromptInputs<'a> {
    pub today: &'a str,
    pub candidates: &'a [MyDayCandidate],
    pub focus_note: &'a str,
    /// 必做/排除用临时候选引用表达。
    pub mandatory_refs: &'a [String],
    pub excluded_refs: &'a [String],
    pub target_count: usize,
}

fn due_fact(due: Option<&str>, today: &str) -> String {
    let Some(d) = due else { return "无截止日期".to_string() };
    let day = &d[..d.len().min(10)];
    match chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d")
        .ok()
        .and_then(|t| chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d").ok().map(|d| (t, d)))
    {
        Some((t, d)) if d < t => format!("{}(已逾期 {} 天)", day, (t - d).num_days()),
        Some((t, d)) => format!("{}({} 天后到期)", day, (d - t).num_days()),
        None => day.to_string(),
    }
}

pub fn build_user_message(input: &PromptInputs) -> String {
    let mut msg = String::new();
    msg.push_str(&format!("今天是 {}。\n", input.today));
    if !input.focus_note.trim().is_empty() {
        msg.push_str(&format!("用户今日重点:{}\n", input.focus_note.trim()));
    }
    msg.push_str(&format!("推荐数量:{}\n", input.target_count));
    if !input.mandatory_refs.is_empty() {
        msg.push_str(&format!(
            "必做(必须出现在建议中): {}\n",
            input.mandatory_refs.join(", ")
        ));
    }
    if !input.excluded_refs.is_empty() {
        msg.push_str(&format!(
            "排除(不要出现在建议中): {}\n",
            input.excluded_refs.join(", ")
        ));
    }
    msg.push_str(&format!("\n候选任务清单(共 {} 项,引用不可更改):\n", input.candidates.len()));
    for c in input.candidates {
        let mut facts = vec![due_fact(c.due_date.as_deref(), input.today)];
        facts.push(format!("优先级 {}", c.priority));
        if c.is_pinned {
            facts.push("已置顶".into());
        }
        if c.already_in_my_day {
            facts.push("今日已加入".into());
        }
        msg.push_str(&format!("[{}] {} | {}\n", c.temp_ref, c.title, facts.join(" | ")));
        if !c.description_text.is_empty() {
            msg.push_str(&format!("  说明: {}\n", c.description_text));
        }
        for s in &c.subtasks {
            if s.instructions.is_empty() {
                msg.push_str(&format!("  - [{}] {}\n", s.temp_ref, s.title));
            } else {
                msg.push_str(&format!("  - [{}] {} — {}\n", s.temp_ref, s.title, s.instructions));
            }
        }
    }
    msg
}

pub fn build_my_day_request(model_id: &str, input: &PromptInputs, stream: bool) -> ChatRequest {
    let mut req = ChatRequest::new(
        model_id,
        vec![
            ChatMessage::system(SYSTEM_PROMPT),
            ChatMessage::user(build_user_message(input)),
        ],
    );
    req.stream = stream;
    req.json_mode = true;
    req
}

/// 序列化请求体大小校验:超限在本地停止,不静默删减后发送。
pub fn request_bytes(req: &ChatRequest) -> usize {
    crate::ai::adapter::openai_chat::build_request_body(req)
        .to_string()
        .len()
}

// ---------- 模型输出 ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MyDayActionOutput {
    pub task_ref: String,
    #[serde(default)]
    pub subtask_ref: Option<String>,
    pub reason: String,
    pub next_step: String,
    pub stop_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotSelectedOutput {
    pub task_ref: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MyDayPlanOutput {
    #[serde(default)]
    pub assumptions: Vec<String>,
    pub actions: Vec<MyDayActionOutput>,
    #[serde(default)]
    pub not_selected: Vec<NotSelectedOutput>,
}

/// 本地结构校验:引用、父子关系、数量、必做/排除、长度全部通过才产出候选。
pub fn parse_and_validate(
    raw: &str,
    candidates: &[MyDayCandidate],
    mandatory_refs: &HashSet<String>,
    excluded_refs: &HashSet<String>,
    target_count: usize,
) -> Result<MyDayPlanOutput, AiError> {
    let cleaned = crate::ai::breakdown::strip_code_fences(raw);
    let start = cleaned.find('{');
    let end = cleaned.rfind('}');
    let json_str = match (start, end) {
        (Some(s), Some(e)) if e > s => &cleaned[s..=e],
        _ => return Err(AiError::new(AiErrorCode::InvalidFormat, "返回内容不是有效的行动建议结构")),
    };
    let parsed: MyDayPlanOutput = serde_json::from_str(json_str).map_err(|_| {
        AiError::new(AiErrorCode::InvalidFormat, "返回内容不是有效的行动建议结构(可能被截断)")
    })?;

    let ref_exists = |r: &str| candidates.iter().any(|c| c.temp_ref == r);
    let subtask_of = |root: &str, sub: &str| candidates
        .iter()
        .any(|c| c.temp_ref == root && c.subtasks.iter().any(|s| s.temp_ref == sub));

    if parsed.actions.is_empty() {
        return Err(AiError::new(AiErrorCode::InvalidFormat, "行动建议没有包含任何行动卡"));
    }
    if parsed.actions.len() > target_count.max(MIN_TARGET_COUNT) {
        return Err(AiError::new(
            AiErrorCode::InvalidFormat,
            format!("行动建议超过 {} 项上限", target_count),
        ));
    }
    let mut seen_roots = HashSet::new();
    for a in &parsed.actions {
        if !ref_exists(&a.task_ref) {
            return Err(AiError::new(AiErrorCode::InvalidFormat, "建议引用了候选之外的任务"));
        }
        if excluded_refs.contains(&a.task_ref) {
            return Err(AiError::new(AiErrorCode::InvalidFormat, "建议包含了被排除的任务"));
        }
        if !seen_roots.insert(a.task_ref.clone()) {
            return Err(AiError::new(AiErrorCode::InvalidFormat, "同一根任务出现了多张行动卡"));
        }
        if let Some(sub) = &a.subtask_ref {
            if sub.is_empty() {
                // 空串视为未指定
            } else if !subtask_of(&a.task_ref, sub) {
                return Err(AiError::new(AiErrorCode::InvalidFormat, "子任务引用不属于该根任务或不在候选中"));
            }
        }
        for (label, text, max) in [
            ("推荐理由", &a.reason, MAX_REASON_CHARS),
            ("下一步行动", &a.next_step, MAX_STEP_CHARS),
            ("停止标准", &a.stop_at, MAX_STEP_CHARS),
        ] {
            if text.trim().is_empty() {
                return Err(AiError::new(AiErrorCode::InvalidFormat, format!("行动卡的{}为空", label)));
            }
            if text.chars().count() > max {
                return Err(AiError::new(AiErrorCode::InvalidFormat, format!("行动卡的{}过长", label)));
            }
        }
    }
    for m in mandatory_refs {
        if !seen_roots.contains(m) {
            return Err(AiError::new(AiErrorCode::InvalidFormat, "必做任务未全部出现在建议中"));
        }
    }
    if parsed.assumptions.len() > MAX_ASSUMPTIONS {
        return Err(AiError::new(AiErrorCode::InvalidFormat, "假设数量超出上限"));
    }
    for a in &parsed.assumptions {
        if a.trim().is_empty() || a.chars().count() > MAX_ASSUMPTION_CHARS {
            return Err(AiError::new(AiErrorCode::InvalidFormat, "假设内容为空或过长"));
        }
    }
    if parsed.not_selected.len() > MAX_NOT_SELECTED {
        return Err(AiError::new(AiErrorCode::InvalidFormat, "取舍说明超过 3 项上限"));
    }
    for n in &parsed.not_selected {
        if !ref_exists(&n.task_ref) {
            return Err(AiError::new(AiErrorCode::InvalidFormat, "取舍说明引用了候选之外的任务"));
        }
        if n.reason.trim().is_empty() || n.reason.chars().count() > MAX_REASON_CHARS {
            return Err(AiError::new(AiErrorCode::InvalidFormat, "取舍说明为空或过长"));
        }
    }

    // 规范化:trim 文本,空 subtask_ref 归一为 None
    Ok(MyDayPlanOutput {
        assumptions: parsed.assumptions.iter().map(|s| s.trim().to_string()).collect(),
        actions: parsed
            .actions
            .iter()
            .map(|a| MyDayActionOutput {
                task_ref: a.task_ref.trim().to_string(),
                subtask_ref: a.subtask_ref.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from),
                reason: a.reason.trim().to_string(),
                next_step: a.next_step.trim().to_string(),
                stop_at: a.stop_at.trim().to_string(),
            })
            .collect(),
        not_selected: parsed
            .not_selected
            .iter()
            .map(|n| NotSelectedOutput {
                task_ref: n.task_ref.trim().to_string(),
                reason: n.reason.trim().to_string(),
            })
            .collect(),
    })
}

// ---------- 内存快照(仅内存,退出即弃) ----------

#[derive(Debug, Clone)]
pub struct StoredMyDayContext {
    pub context_id: String,
    pub local_date: String,
    pub tag_ids: Vec<String>,
    pub candidates: Vec<MyDayCandidate>,
    pub eligible_total: usize,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct StoredMyDayProposal {
    pub proposal_id: String,
    pub context_id: String,
    pub local_date: String,
    pub model_snapshot: String,
    pub created_at: String,
    /// 用户本次生成时的今日重点输入,采纳成功后作为计划快照保存。
    pub focus_text: String,
    pub output: MyDayPlanOutput,
}

/// 采纳时前端提交的行动卡(真实任务 ID + 用户编辑后的文本,顺序即采纳顺序)。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MyDayActionInput {
    pub root_task_id: String,
    #[serde(default)]
    pub target_subtask_id: Option<String>,
    pub reason: String,
    pub next_step: String,
    pub stop_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str, title: &str, due: Option<&str>, priority: i32) -> Task {
        Task {
            id: id.into(),
            title: title.into(),
            description: String::new(),
            is_completed: false,
            is_archived: false,
            is_suspended: false,
            is_abandoned: false,
            is_pinned: false,
            priority,
            due_date: due.map(String::from),
            reminder: None,
            tag_ids: vec![],
            parent_task_id: None,
            sort_order: 0,
            recurrence: None,
            my_day_date: None,
            children_count: None,
            source: None,
            created_at: format!("2026-10-{:02} 08:00:00", id.parse::<u32>().unwrap_or(1)),
            updated_at: String::new(),
        }
    }

    fn child(id: &str, parent: &str, title: &str, completed: bool) -> Task {
        let mut t = task(id, title, None, 0);
        t.parent_task_id = Some(parent.into());
        t.is_completed = completed;
        t
    }

    const TODAY: &str = "2026-10-30";

    #[test]
    fn groups_order_manual_overdue_upcoming_pinned_nodue_other() {
        let roots = vec![
            task("6", "其他有日期", Some("2026-12-01"), 0),
            task("5", "无日期普通", None, 0),
            task("3", "紧急远期", Some("2026-12-30"), 4), // 高优先 → PinnedHigh
            task("2", "下周到期", Some("2026-11-03"), 0),
            task("1", "已逾期", Some("2026-10-20"), 0),
        ];
        let mut pinned = task("4", "置顶无日期", None, 0);
        pinned.is_pinned = true;

        let manual: HashSet<String> = ["9".to_string()].into_iter().collect();
        let mut manual_task = task("9", "手动补入", None, 0);
        manual_task.my_day_date = Some(TODAY.into());
        let mut all = roots;
        all.push(pinned);
        all.push(manual_task);

        let sel = select_candidate_roots(&all, TODAY, &manual);
        assert_eq!(sel.eligible_total, 7);
        let ids: Vec<&str> = sel.selected.iter().map(|(_, t)| t.id.as_str()).collect();
        // PinnedHigh 组内按优先级降序:紧急远期(4) 先于 置顶无日期(0)
        assert_eq!(ids, vec!["9", "1", "2", "3", "4", "5", "6"]);
    }

    #[test]
    fn selection_limits_to_max_roots_and_my_day_does_not_jump_queue() {
        let mut roots = Vec::new();
        // 20 个「其他」组任务,已加入今日的那个排在同组最后(创建最晚):
        // 已加入身份本身不提供占位优先级
        for i in 0..MAX_ROOT_TASKS {
            let mut t = task(&format!("{}", i), &format!("其他 {i}"), Some("2026-12-01"), 0);
            t.created_at = format!("2026-10-{:02} 08:00:00", i + 1);
            roots.push(t);
        }
        let mut in_day = task("99", "已在今日", Some("2026-12-01"), 0);
        in_day.my_day_date = Some(TODAY.into());
        in_day.created_at = "2026-10-31 08:00:00".into();
        roots.push(in_day);

        let sel = select_candidate_roots(&roots, TODAY, &HashSet::new());
        assert_eq!(sel.eligible_total, MAX_ROOT_TASKS + 1);
        assert_eq!(sel.selected.len(), MAX_ROOT_TASKS);
        assert!(sel.selected.iter().all(|(_, t)| t.id != "99"));
        // 未带入的正是创建最晚的"已在今日"任务
        assert_eq!(sel.omitted.len(), 1);
        assert_eq!(sel.omitted[0].id, "99");
    }

    #[test]
    fn non_executable_and_children_excluded() {
        let mut completed = task("c1", "已完成", None, 0);
        completed.is_completed = true;
        let mut suspended = task("c2", "挂起", None, 0);
        suspended.is_suspended = true;
        let mut sub = task("c3", "子任务", None, 0);
        sub.parent_task_id = Some("a".into());

        let sel = select_candidate_roots(&[completed, suspended, sub, task("a", "正常", None, 0)], TODAY, &HashSet::new());
        assert_eq!(sel.eligible_total, 1);
        assert_eq!(sel.selected[0].1.id, "a");
    }

    #[test]
    fn snapshot_assigns_temp_refs_limits_subtasks_and_flags() {
        let root = task("r1", "根任务", None, 2);
        let children: Vec<Task> = (0..7)
            .map(|i| child(&format!("s{}", i), "r1", &format!("步骤 {}", i), i == 6))
            .collect();
        let mut map = HashMap::new();
        map.insert("r1".to_string(), children);

        let snap = build_snapshot(&[(CandidateGroup::NoDueDate, root.clone())], &map, TODAY, &HashMap::new());
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0].temp_ref, "t01");
        assert_eq!(snap[0].group, CandidateGroup::NoDueDate);
        assert_eq!(snap[0].subtasks.len(), MAX_SUBTASKS_PER_ROOT);
        // 6 个可执行 + 1 个已完成 → 可执行 6,取前 5,遗漏 1
        assert_eq!(snap[0].omitted_subtasks, 1);
        assert_eq!(snap[0].omitted_subtask_details.len(), 1);
        assert_eq!(snap[0].omitted_subtask_details[0].subtask_id, "s5");
        assert_eq!(snap[0].subtasks[0].temp_ref, "t01.s01");

        // 指纹含全部子任务(含已完成),含标题与描述全文
        let mut changed_desc = root.clone();
        changed_desc.description = "<p>完整描述变化</p>".into();
        let snap2 = build_snapshot(&[(CandidateGroup::NoDueDate, changed_desc)], &map, TODAY, &HashMap::new());
        assert_ne!(snap[0].fingerprint, snap2[0].fingerprint);

        // my_day_date 不参与指纹:写入今日归属不应使指纹失效
        let mut in_day = root.clone();
        in_day.my_day_date = Some(TODAY.into());
        let snap3 = build_snapshot(&[(CandidateGroup::NoDueDate, in_day)], &map, TODAY, &HashMap::new());
        assert_eq!(snap[0].fingerprint, snap3[0].fingerprint);
        assert!(snap3[0].already_in_my_day);
    }

    #[test]
    fn subtask_picks_replace_default_selection() {
        let root = task("r1", "根任务", None, 0);
        let children = vec![child("s1", "r1", "一", false), child("s2", "r1", "二", false), child("s3", "r1", "三", false)];
        let mut map = HashMap::new();
        map.insert("r1".to_string(), children);
        let mut picks = HashMap::new();
        picks.insert("r1".to_string(), vec!["s3".to_string()]);

        let snap = build_snapshot(&[(CandidateGroup::Other, root)], &map, TODAY, &picks);
        assert_eq!(snap[0].subtasks.len(), 1);
        assert_eq!(snap[0].subtasks[0].subtask_id, "s3");
        assert_eq!(snap[0].omitted_subtasks, 2);
        assert_eq!(
            snap[0].omitted_subtask_details.iter().map(|d| d.subtask_id.as_str()).collect::<Vec<_>>(),
            vec!["s1", "s2"]
        );
    }

    #[test]
    fn subtask_picks_are_capped_at_limit() {
        let root = task("r1", "根任务", None, 0);
        let children: Vec<Task> = (0..7)
            .map(|i| child(&format!("s{}", i), "r1", &format!("步骤 {}", i), false))
            .collect();
        let mut map = HashMap::new();
        map.insert("r1".to_string(), children);
        let mut picks = HashMap::new();
        picks.insert(
            "r1".to_string(),
            (0..7).map(|i| format!("s{}", i)).collect::<Vec<_>>(),
        );

        let snap = build_snapshot(&[(CandidateGroup::Other, root)], &map, TODAY, &picks);
        assert_eq!(snap[0].subtasks.len(), MAX_SUBTASKS_PER_ROOT);
        assert_eq!(snap[0].subtasks.last().unwrap().subtask_id, "s4");
        assert_eq!(snap[0].omitted_subtasks, 2);
    }

    #[test]
    fn user_message_contains_refs_and_facts_not_ids() {
        let root = task("real-id-1", "设计评审", Some("2026-10-28"), 3);
        let mut in_day = task("real-id-2", "已加入事项", None, 0);
        in_day.my_day_date = Some(TODAY.into());
        let snap = build_snapshot(
            &[(CandidateGroup::Other, root), (CandidateGroup::NoDueDate, in_day)],
            &HashMap::new(),
            TODAY,
            &HashMap::new(),
        );
        let input = PromptInputs {
            today: TODAY,
            candidates: &snap,
            focus_note: "推进评审",
            mandatory_refs: &["t01".to_string()],
            excluded_refs: &[],
            target_count: 2,
        };
        let msg = build_user_message(&input);
        assert!(msg.contains("[t01] 设计评审"));
        assert!(msg.contains("已逾期 2 天"));
        assert!(msg.contains("今日已加入"));
        assert!(msg.contains("必做(必须出现在建议中): t01"));
        assert!(!msg.contains("real-id-1"));
    }

    fn validate_output(raw: &str, snap: &[MyDayCandidate]) -> Result<MyDayPlanOutput, AiError> {
        parse_and_validate(raw, snap, &["t01".to_string()].into_iter().collect(), &HashSet::new(), 3)
    }

    fn two_task_snapshot() -> Vec<MyDayCandidate> {
        let root = task("a", "任务A", None, 0);
        let mut root_b = task("b", "任务B", None, 0);
        root_b.id = "b".into();
        let children = vec![child("s1", "a", "步骤一", false)];
        let mut map = HashMap::new();
        map.insert("a".to_string(), children);
        build_snapshot(
            &[(CandidateGroup::Other, root), (CandidateGroup::Other, root_b)],
            &map,
            TODAY,
            &HashMap::new(),
        )
    }

    #[test]
    fn validate_accepts_well_formed_output() {
        let snap = two_task_snapshot();
        let raw = r#"{"assumptions":["假设1"],"actions":[
            {"task_ref":"t01","subtask_ref":"t01.s01","reason":"理由","next_step":"第一步","stop_at":"停下来"},
            {"task_ref":"t02","reason":"理由B","next_step":"做B","stop_at":"停B"}],
            "not_selected":[]}"#;
        let out = validate_output(raw, &snap).unwrap();
        assert_eq!(out.actions.len(), 2);
        assert_eq!(out.actions[0].subtask_ref.as_deref(), Some("t01.s01"));
        assert!(out.actions[1].subtask_ref.is_none());
    }

    #[test]
    fn validate_rejects_unknown_ref_dup_root_missing_mandatory_bad_subtask() {
        let snap = two_task_snapshot();
        // 未知引用
        let unknown = r#"{"assumptions":[],"actions":[{"task_ref":"t99","reason":"r","next_step":"n","stop_at":"s"}]}"#;
        assert!(validate_output(unknown, &snap).is_err());
        // 重复根任务
        let dup = r#"{"assumptions":[],"actions":[{"task_ref":"t01","reason":"r","next_step":"n","stop_at":"s"},{"task_ref":"t01","reason":"r","next_step":"n","stop_at":"s"}]}"#;
        assert!(validate_output(dup, &snap).is_err());
        // 遗漏必做(t01 未出现)
        let missing = r#"{"assumptions":[],"actions":[{"task_ref":"t02","reason":"r","next_step":"n","stop_at":"s"}]}"#;
        assert!(validate_output(missing, &snap).is_err());
        // 错误父子关系:t02 的卡指向 t01 的子任务
        let bad_sub = r#"{"assumptions":[],"actions":[{"task_ref":"t02","subtask_ref":"t01.s01","reason":"r","next_step":"n","stop_at":"s"}]}"#;
        assert!(validate_output(bad_sub, &snap).is_err());
        // 超过目标项数
        let over = r#"{"assumptions":[],"actions":[{"task_ref":"t01","reason":"r","next_step":"n","stop_at":"s"},{"task_ref":"t02","reason":"r","next_step":"n","stop_at":"s"}]}"#;
        let err = parse_and_validate(over, &snap, &HashSet::new(), &HashSet::new(), 1).unwrap_err();
        assert_eq!(err.code, AiErrorCode::InvalidFormat);
    }

    #[test]
    fn validate_rejects_excluded_empty_and_overlong_fields() {
        let snap = two_task_snapshot();
        // 包含排除项
        let excluded: HashSet<String> = ["t02".to_string()].into_iter().collect();
        let raw = r#"{"assumptions":[],"actions":[{"task_ref":"t02","reason":"r","next_step":"n","stop_at":"s"}]}"#;
        assert!(parse_and_validate(raw, &snap, &HashSet::new(), &excluded, 3).is_err());
        // 空下一步
        let blank = r#"{"assumptions":[],"actions":[{"task_ref":"t01","reason":"r","next_step":"  ","stop_at":"s"}]}"#;
        assert!(validate_output(blank, &snap).is_err());
        // 截断 JSON
        let truncated = r#"{"assumptions":[],"actions":[{"task_ref":"t01","reason":"r","next_ste"#;
        assert!(validate_output(truncated, &snap).is_err());
        // 假设超数
        let assumptions: Vec<String> = (0..6).map(|i| format!("{{\"假设{}\"}}", i)).collect();
        let _ = assumptions; // 结构化构造太绕,直接写 6 条
        let over_assum = format!(
            r#"{{"assumptions":{},"actions":[{{"task_ref":"t01","reason":"r","next_step":"n","stop_at":"s"}}]}}"#,
            (0..6).map(|i| format!("\"假设{}\"", i)).collect::<Vec<_>>().join(",")
        );
        assert!(validate_output(&over_assum, &snap).is_err());
    }

    #[test]
    fn request_uses_json_mode_and_respects_size_budget() {
        let snap = two_task_snapshot();
        let input = PromptInputs {
            today: TODAY,
            candidates: &snap,
            focus_note: "",
            mandatory_refs: &[],
            excluded_refs: &[],
            target_count: 3,
        };
        let req = build_my_day_request("m", &input, true);
        assert!(req.json_mode);
        assert!(req.stream);
        assert!(request_bytes(&req) < MAX_REQUEST_BYTES);
    }
}
