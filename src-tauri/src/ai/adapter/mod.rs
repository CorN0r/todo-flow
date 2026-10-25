/// 协议适配层:把统一 ChatRequest 转换为具体服务协议,把响应规范化为 ChatResult。
/// 内部接口与 OpenAI 兼容协议解耦,为未来 Responses/厂商原生协议留位。
pub mod openai_chat;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatRole {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self { role: ChatRole::System, content: content.into() }
    }
    pub fn user(content: impl Into<String>) -> Self {
        Self { role: ChatRole::User, content: content.into() }
    }
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    /// 输出上限。仅用户显式配置时携带(兼容差异由适配规则处理)。
    pub max_tokens: Option<i64>,
    /// 请求服务端 JSON 输出模式(服务不支持时由调用方降级重试)。
    pub json_mode: bool,
}

impl ChatRequest {
    pub fn new(model: impl Into<String>, messages: Vec<ChatMessage>) -> Self {
        Self {
            model: model.into(),
            messages,
            stream: false,
            max_tokens: None,
            json_mode: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    Stop,
    Length,
    ContentFilter,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatUsage {
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ChatResult {
    pub text: String,
    pub finish_reason: FinishReason,
    /// 服务实际返回的模型标识(可能与请求的不同)。
    pub actual_model: Option<String>,
    pub usage: Option<ChatUsage>,
}

impl ChatResult {
    /// 完成且未截断、未被过滤时为 true,可进入业务结构校验。
    pub fn is_complete(&self) -> bool {
        matches!(self.finish_reason, FinishReason::Stop)
    }
}
