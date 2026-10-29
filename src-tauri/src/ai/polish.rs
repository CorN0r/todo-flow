use crate::ai::adapter::{ChatMessage, ChatRequest};
use crate::ai::breakdown::{html_to_text, ChildSummary};
use crate::ai::error::{AiError, AiErrorCode};

/// 润色输出长度上限(字符)。
pub const MAX_POLISH_CHARS: usize = 4000;

/// 润色输入上下文:与拆解同一输入边界——标题、描述文本、现有子任务摘要;
/// 不含图片数据、附件、链接内容或数据库主键。
#[derive(Debug, Clone)]
pub struct PolishContext {
    pub task_title: String,
    pub description_text: String,
    pub existing_children: Vec<ChildSummary>,
    /// 用户补充的润色方向(可选,≤200 字),生成时优先遵循。
    pub user_note: String,
}

const SYSTEM_PROMPT: &str = "你是任务描述助手。根据任务信息改写任务描述:\
如果已有描述,把它润色为清晰、具体、可直接执行的说明,保留原有全部关键信息,不添加臆造的事实;\
如果描述为空,根据标题写出一段简洁的执行说明。\
只输出描述正文,不要任何前言、解释或标题重复。\
使用纯文本,用换行分段;不要使用 Markdown 符号、列表编号或 HTML。";

fn build_user_message(ctx: &PolishContext) -> String {
    let mut msg = String::new();
    msg.push_str("任务标题:");
    msg.push_str(&ctx.task_title);
    msg.push('\n');
    if ctx.description_text.trim().is_empty() {
        msg.push_str("任务描述:(为空,请根据标题生成)\n");
    } else {
        msg.push_str("任务描述:\n");
        msg.push_str(&ctx.description_text);
        msg.push('\n');
    }
    if !ctx.existing_children.is_empty() {
        msg.push_str("已有子任务(描述应与它们衔接,不重复罗列):\n");
        for child in &ctx.existing_children {
            msg.push_str("- ");
            msg.push_str(&child.title);
            let done_mark = if child.is_completed { "(已完成)" } else { "" };
            msg.push_str(done_mark);
            msg.push('\n');
        }
    }
    if !ctx.user_note.trim().is_empty() {
        msg.push_str("润色方向(用户补充,在不丢失原有信息的前提下优先遵循):");
        msg.push_str(ctx.user_note.trim());
        msg.push('\n');
    }
    msg
}

/// 润色用非流式/流式由调用方决定;不用 JSON 模式,输出即正文。
pub fn build_polish_request(model_id: &str, ctx: &PolishContext, stream: bool) -> ChatRequest {
    let mut req = ChatRequest::new(
        model_id,
        vec![ChatMessage::system(SYSTEM_PROMPT), ChatMessage::user(build_user_message(ctx))],
    );
    req.stream = stream;
    req
}

/// 本地校验:非空白且不超过上限。截断/超限都不产出可采纳预览。
pub fn validate_polish_text(text: &str) -> Result<String, AiError> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(AiError::new(
            AiErrorCode::InvalidFormat,
            "润色结果为空,未生成可用内容",
        ));
    }
    if trimmed.chars().count() > MAX_POLISH_CHARS {
        return Err(AiError::new(
            AiErrorCode::InvalidFormat,
            format!("润色结果超过 {} 字上限", MAX_POLISH_CHARS),
        ));
    }
    Ok(trimmed.to_string())
}

/// 从任务行数据构建上下文(供命令层复用)。
pub fn context_from_parts(
    task_title: &str,
    description_html: &str,
    children: Vec<ChildSummary>,
    user_note: &str,
) -> PolishContext {
    PolishContext {
        task_title: task_title.to_string(),
        description_text: html_to_text(description_html),
        existing_children: children,
        user_note: user_note.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> PolishContext {
        PolishContext {
            task_title: "准备旅行".into(),
            description_text: "去京都 看枫叶".into(),
            existing_children: vec![ChildSummary { title: "订机票".into(), is_completed: false }],
            user_note: String::new(),
        }
    }

    #[test]
    fn request_contains_context_and_constraints() {
        let req = build_polish_request("m", &sample(), true);
        assert_eq!(req.messages.len(), 2);
        assert!(req.stream);
        assert!(!req.json_mode);
        let user = &req.messages[1].content;
        assert!(user.contains("准备旅行"));
        assert!(user.contains("去京都 看枫叶"));
        assert!(user.contains("订机票"));
        let system = &req.messages[0].content;
        assert!(system.contains("纯文本"));
    }

    #[test]
    fn user_note_included_when_present_omitted_when_empty() {
        let mut ctx = sample();
        ctx.user_note = " 更商务,突出时间节点 ".into();
        let user = &build_polish_request("m", &ctx, false).messages[1].content;
        assert!(user.contains("润色方向"));
        assert!(user.contains("更商务,突出时间节点"));

        let without = &build_polish_request("m", &sample(), false).messages[1].content;
        assert!(!without.contains("润色方向"));
    }

    #[test]
    fn empty_description_marks_generate_mode() {
        let mut ctx = sample();
        ctx.description_text = String::new();
        let req = build_polish_request("m", &ctx, false);
        assert!(req.messages[1].content.contains("为空,请根据标题生成"));
    }

    #[test]
    fn context_from_parts_strips_images() {
        let ctx = context_from_parts(
            "t",
            "<p>正文</p><p><img src=\"data:image/png;base64,AA\"/></p>",
            vec![],
            "偏正式",
        );
        assert_eq!(ctx.description_text, "正文");
        assert!(!ctx.description_text.contains("data:image"));
        assert_eq!(ctx.user_note, "偏正式");
    }

    #[test]
    fn validate_accepts_normal_and_rejects_bad() {
        assert_eq!(validate_polish_text("  好的描述 \n").unwrap(), "好的描述");
        assert_eq!(
            validate_polish_text("   \n ").unwrap_err().code,
            AiErrorCode::InvalidFormat
        );
        let long = "字".repeat(MAX_POLISH_CHARS + 1);
        assert_eq!(
            validate_polish_text(&long).unwrap_err().code,
            AiErrorCode::InvalidFormat
        );
        // 恰好在上限内通过
        let edge = "字".repeat(MAX_POLISH_CHARS);
        assert!(validate_polish_text(&edge).is_ok());
    }
}
