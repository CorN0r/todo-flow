use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::ai::adapter::{ChatMessage, ChatRequest};
use crate::ai::error::{AiError, AiErrorCode};

/// 候选数量与长度上限(统一业务校验;设计文档 §10.2)。
pub const MAX_ITEMS: usize = 20;
pub const MAX_ASSUMPTIONS: usize = 10;
pub const MAX_TITLE_CHARS: usize = 120;
pub const MAX_INSTRUCTIONS_CHARS: usize = 2000;
pub const MAX_ASSUMPTION_CHARS: usize = 200;

/// 拆解输入上下文:仅包含设计允许传给模型的内容,不含数据库主键。
#[derive(Debug, Clone, Serialize)]
pub struct BreakdownContext {
    pub task_title: String,
    /// 描述 HTML 已转为纯文本(内嵌图片数据随之移除)。
    pub description_text: String,
    /// 现有子任务 (标题, 是否完成),保持顺序。
    pub existing_children: Vec<ChildSummary>,
    /// 用户可选的一句话补充要求。
    pub user_note: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChildSummary {
    pub title: String,
    pub is_completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakdownItem {
    pub title: String,
    pub instructions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakdownOutput {
    pub assumptions: Vec<String>,
    pub items: Vec<BreakdownItem>,
}

/// 简化 HTML→文本:去标签、保留块级换行、解常见实体。与前端 stripHtml 语义一致,
/// img(data URI)随标签一并移除。
pub fn html_to_text(html: &str) -> String {
    let mut s = html
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</p>", "\n")
        .replace("</div>", "\n")
        .replace("</li>", "\n")
        .replace("</tr>", "\n");
    // 去掉所有标签
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    s = out
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    // 合并空白:3+ 换行 → 2
    let mut result = String::with_capacity(s.len());
    let mut newlines = 0;
    for ch in s.chars() {
        if ch == '\n' {
            newlines += 1;
            if newlines <= 2 {
                result.push(ch);
            }
        } else {
            newlines = 0;
            result.push(ch);
        }
    }
    result.trim().to_string()
}

/// 上下文指纹:父任务标题+描述文本+现有子任务有序(标题,完成态)。
/// 不用秒级 updated_at 做唯一判断;采纳前重算比对。
pub fn context_fingerprint(ctx: &BreakdownContext) -> String {
    let mut hasher = Sha256::new();
    hasher.update(ctx.task_title.trim().as_bytes());
    hasher.update(b"\x00");
    hasher.update(ctx.description_text.trim().as_bytes());
    hasher.update(b"\x00");
    for child in &ctx.existing_children {
        hasher.update(child.title.trim().as_bytes());
        hasher.update(if child.is_completed { b"\x01" } else { b"\x00" });
    }
    format!("{:x}", hasher.finalize())
}

const SYSTEM_PROMPT: &str = "你是任务拆解助手。根据给定的任务信息,拆解出可以直接开始执行的子任务。\
只输出一个 JSON 对象,不要输出任何其他文字、解释或代码块标记。格式:\
{\"assumptions\":[\"需要用户确认的假设\"],\"items\":[{\"title\":\"子任务标题\",\"instructions\":\"具体执行说明\"}]}\
要求:\
- assumptions 是信息模糊时你做出的假设;没有假设则为空数组。\
- items 生成 3 到 7 项,简单任务可以更少,最多 20 项;每项都是可以立即开始执行的具体步骤。\
- title 和 instructions 都是纯文本;instructions 说明具体怎么做。\
- 不要输出任务的截止日期、优先级、预计耗时或任务 ID;不要修改已有子任务。";

fn build_user_message(ctx: &BreakdownContext) -> String {
    let mut msg = String::new();
    msg.push_str("任务标题:");
    msg.push_str(&ctx.task_title);
    msg.push_str("\n");
    if !ctx.description_text.is_empty() {
        msg.push_str("任务描述:");
        msg.push_str(&ctx.description_text);
        msg.push_str("\n");
    }
    if !ctx.existing_children.is_empty() {
        msg.push_str("已有子任务(不要重复,新的子任务应与它们互补):\n");
        for child in &ctx.existing_children {
            msg.push_str("- ");
            msg.push_str(&child.title);
            msg.push_str(if child.is_completed { "(已完成)" } else { "" });
            msg.push('\n');
        }
    }
    if !ctx.user_note.trim().is_empty() {
        msg.push_str("补充要求:");
        msg.push_str(ctx.user_note.trim());
        msg.push('\n');
    }
    msg
}

pub fn build_breakdown_request(model_id: &str, ctx: &BreakdownContext, stream: bool) -> ChatRequest {
    let mut req = ChatRequest::new(
        model_id,
        vec![ChatMessage::system(SYSTEM_PROMPT), ChatMessage::user(build_user_message(ctx))],
    );
    req.stream = stream;
    req.json_mode = true;
    req
}

/// 剥掉 Markdown 代码围栏(```json ... ``` 或 ``` ... ```),模型常见输出形态。
pub fn strip_code_fences(text: &str) -> &str {
    let t = text.trim();
    let Some(start) = t.find("```") else { return t };
    let after = &t[start + 3..];
    // 跳过语言标记行
    let after = match after.find('\n') {
        Some(nl) if after[..nl].trim().chars().all(|c| c.is_ascii_alphanumeric()) => &after[nl + 1..],
        _ => after,
    };
    match after.rfind("```") {
        Some(end) => after[..end].trim(),
        None => after.trim(),
    }
}

/// 本地结构校验:每次输出必须完整通过;截断/非法 JSON/超限都不产出候选。
pub fn parse_and_validate(raw: &str) -> Result<BreakdownOutput, AiError> {
    let cleaned = strip_code_fences(raw);
    // 容错:截取首个 { 到最后一个 } 之间(部分模型在 JSON 前后加说明文字)
    let start = cleaned.find('{');
    let end = cleaned.rfind('}');
    let json_str = match (start, end) {
        (Some(s), Some(e)) if e > s => &cleaned[s..=e],
        _ => {
            return Err(AiError::new(
                AiErrorCode::InvalidFormat,
                "返回内容不是有效的任务拆解结构",
            ))
        }
    };
    let parsed: BreakdownOutput = serde_json::from_str(json_str).map_err(|_| {
        AiError::new(
            AiErrorCode::InvalidFormat,
            "返回内容不是有效的任务拆解结构(可能被截断)",
        )
    })?;

    if parsed.items.is_empty() {
        return Err(AiError::new(AiErrorCode::InvalidFormat, "拆解结果没有包含任何子任务"));
    }
    if parsed.items.len() > MAX_ITEMS {
        return Err(AiError::new(
            AiErrorCode::InvalidFormat,
            format!("拆解结果超过 {} 项上限", MAX_ITEMS),
        ));
    }
    if parsed.assumptions.len() > MAX_ASSUMPTIONS {
        return Err(AiError::new(AiErrorCode::InvalidFormat, "假设数量超出上限"));
    }
    for a in &parsed.assumptions {
        if a.trim().is_empty() || a.chars().count() > MAX_ASSUMPTION_CHARS {
            return Err(AiError::new(AiErrorCode::InvalidFormat, "假设内容为空或过长"));
        }
    }
    for item in &parsed.items {
        let title = item.title.trim();
        if title.is_empty() || title.chars().count() > MAX_TITLE_CHARS {
            return Err(AiError::new(AiErrorCode::InvalidFormat, "子任务标题为空或过长"));
        }
        if item.instructions.chars().count() > MAX_INSTRUCTIONS_CHARS {
            return Err(AiError::new(AiErrorCode::InvalidFormat, "执行说明过长"));
        }
    }
    // 规范化:trim 标题与说明
    Ok(BreakdownOutput {
        assumptions: parsed.assumptions.iter().map(|s| s.trim().to_string()).collect(),
        items: parsed
            .items
            .iter()
            .map(|i| BreakdownItem {
                title: i.title.trim().to_string(),
                instructions: i.instructions.trim().to_string(),
            })
            .collect(),
    })
}

/// 验证用内置虚构任务(固定输入,不含任何用户任务内容)。
pub fn sample_context_for_verification() -> BreakdownContext {
    BreakdownContext {
        task_title: "组织一次团队周会".into(),
        description_text: "五个人的小组,需要准备议程、会议室和会议纪要。".into(),
        existing_children: vec![],
        user_note: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_to_text_strips_images_and_tags() {
        let html = "<p>准备<b>发布</b></p><p><img src=\"data:image/png;base64,AAAA\"/></p><div>确认清单</div>";
        assert_eq!(html_to_text(html), "准备发布\n\n确认清单");
    }

    #[test]
    fn html_to_text_entities_and_newlines() {
        assert_eq!(html_to_text("a&nbsp;&amp;&nbsp;b"), "a & b");
        assert_eq!(html_to_text("x<br/>y"), "x\ny");
        assert_eq!(html_to_text("a\n\n\n\nb"), "a\n\nb");
    }

    #[test]
    fn fingerprint_changes_with_relevant_context() {
        let base = BreakdownContext {
            task_title: "t".into(),
            description_text: "d".into(),
            existing_children: vec![ChildSummary { title: "c1".into(), is_completed: false }],
            user_note: "note".into(),
        };
        // 补充要求不参与指纹(仅发给模型的输入,不影响任务库状态)
        let mut changed_note = base.clone();
        changed_note.user_note = "另一个要求".into();
        assert_eq!(context_fingerprint(&base), context_fingerprint(&changed_note));

        let mut changed_title = base.clone();
        changed_title.task_title = "t2".into();
        assert_ne!(context_fingerprint(&base), context_fingerprint(&changed_title));

        let mut changed_child = base.clone();
        changed_child.existing_children[0].is_completed = true;
        assert_ne!(context_fingerprint(&base), context_fingerprint(&changed_child));
    }

    #[test]
    fn validate_accepts_plain_and_fenced_json() {
        let plain = r#"{"assumptions":["假设1"],"items":[{"title":"步骤一","instructions":"怎么做"}]}"#;
        assert!(parse_and_validate(plain).is_ok());

        let fenced = "```json\n{\"assumptions\":[],\"items\":[{\"title\":\"a\",\"instructions\":\"b\"}]}\n```";
        let out = parse_and_validate(fenced).unwrap();
        assert_eq!(out.items.len(), 1);
        assert!(out.assumptions.is_empty());

        let with_prose = "好的,结果如下:{\"assumptions\":[],\"items\":[{\"title\":\"a\",\"instructions\":\"b\"}]} 以上。";
        assert!(parse_and_validate(with_prose).is_ok());
    }

    #[test]
    fn validate_rejects_truncated_and_invalid() {
        // 截断 JSON
        let truncated = r#"{"assumptions":[],"items":[{"title":"步骤一","instr"#;
        assert!(parse_and_validate(truncated).is_err());
        // 空项
        let empty = r#"{"assumptions":[],"items":[]}"#;
        assert!(parse_and_validate(empty).is_err());
        // 超 20 项
        let items: Vec<String> = (0..21).map(|i| format!("{{\"title\":\"t{}\",\"instructions\":\"\"}}", i)).collect();
        let over = format!(r#"{{"assumptions":[],"items":[{}]}}"#, items.join(","));
        assert!(parse_and_validate(&over).is_err());
        // 标题为空
        let blank = r#"{"assumptions":[],"items":[{"title":"  ","instructions":"x"}]}"#;
        assert!(parse_and_validate(blank).is_err());
        // 完全不是 JSON
        assert!(parse_and_validate("我不会拆解").is_err());
    }

    #[test]
    fn request_uses_json_mode_and_context_fields() {
        let ctx = sample_context_for_verification();
        let req = build_breakdown_request("m", &ctx, true);
        assert!(req.json_mode);
        assert!(req.stream);
        assert_eq!(req.messages.len(), 2);
        let user = &req.messages[1].content;
        assert!(user.contains("组织一次团队周会"));
        assert!(!user.contains("data:image"));
    }
}

/// 生成成功后的候选缓存条目(仅内存,退出即弃;设计 §10.2)。
#[derive(Debug, Clone)]
pub struct StoredProposal {
    pub proposal_id: String,
    pub task_id: String,
    pub context_fingerprint: String,
    /// 连接与模型的名称快照,预览界面显示用。
    pub model_snapshot: String,
    pub created_at: String,
    pub output: BreakdownOutput,
}
