/// OpenAI 兼容 Chat Completions 适配。
/// 全部为纯函数:URL/请求体构造与响应解析不依赖网络,可用单元测试覆盖;
/// HTTP 执行在 gateway 完成。
use serde_json::{json, Value};

use crate::ai::adapter::{
    ChatRequest, ChatResult, ChatRole, ChatUsage, FinishReason,
};
use crate::ai::error::{AiError, AiErrorCode};

/// 响应体累计上限(非流式整包 / 流式全文),防止无界响应。
pub const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
/// 单条 SSE 事件(两个分隔符之间)的上限。
pub const MAX_SSE_EVENT_BYTES: usize = 64 * 1024;

/// 对话端点 = 规范化基础地址 + /chat/completions。
/// 不统一强加 /v1,不丢用户基础路径;误填完整端点在保存时已被 normalize_base_url 拦截。
pub fn chat_url(base_url: &str) -> Result<String, AiError> {
    Ok(format!("{}/chat/completions", base_url.trim_end_matches('/')))
}

/// 模型列表端点 = 基础地址 + /models。
pub fn models_url(base_url: &str) -> Result<String, AiError> {
    Ok(format!("{}/models", base_url.trim_end_matches('/')))
}

/// 构造请求体:仅发 model/messages/stream,可选 max_tokens 与 response_format。
/// 不默认强塞 temperature、推理参数或不支持的输出限制字段。
pub fn build_request_body(req: &ChatRequest) -> Value {
    let mut body = json!({
        "model": req.model,
        "messages": req
            .messages
            .iter()
            .map(|m| json!({
                "role": match m.role {
                    ChatRole::System => "system",
                    ChatRole::User => "user",
                    ChatRole::Assistant => "assistant",
                },
                "content": m.content,
            }))
            .collect::<Vec<_>>(),
        "stream": req.stream,
    });
    if let Some(max_tokens) = req.max_tokens {
        body["max_tokens"] = json!(max_tokens);
    }
    if req.json_mode {
        body["response_format"] = json!({ "type": "json_object" });
    }
    body
}

/// HTTP 状态 → 错误分类。404 可能是模型不存在也可能是地址错误,提示里带上两种可能。
pub fn classify_status(status: reqwest::StatusCode, body_snippet: &str) -> AiError {
    let code = match status.as_u16() {
        401 | 403 => AiErrorCode::AuthFailed,
        404 => AiErrorCode::ModelNotFound,
        408 | 504 => AiErrorCode::Timeout,
        429 => AiErrorCode::RateLimited,
        400 | 409 | 422 => {
            // 400 多为参数/模型名不合法;保留服务消息作为 detail
            return AiError::new(AiErrorCode::InvalidFormat, "服务拒绝了请求")
                .with_detail(truncate(body_snippet, 300));
        }
        _ if status.is_server_error() => AiErrorCode::ConnectionFailed,
        _ => AiErrorCode::ConnectionFailed,
    };
    let message = match code {
        AiErrorCode::AuthFailed => "鉴权失败,请检查 API Key",
        AiErrorCode::ModelNotFound => "模型不存在或不可用(请核对模型标识与基础地址)",
        AiErrorCode::RateLimited => "请求过于频繁,已触发服务限流",
        _ => "服务请求失败",
    };
    AiError::new(code, message).with_detail(truncate(body_snippet, 300))
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut end = max;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…", &s[..end])
    }
}

fn parse_finish_reason(v: Option<&str>) -> FinishReason {
    match v {
        Some("stop") => FinishReason::Stop,
        Some("length") => FinishReason::Length,
        Some("content_filter") => FinishReason::ContentFilter,
        _ => FinishReason::Other,
    }
}

fn parse_usage(v: Option<&Value>) -> Option<ChatUsage> {
    let u = v?;
    Some(ChatUsage {
        prompt_tokens: u.get("prompt_tokens").and_then(Value::as_i64),
        completion_tokens: u.get("completion_tokens").and_then(Value::as_i64),
        total_tokens: u.get("total_tokens").and_then(Value::as_i64),
    })
}

/// 解析非流式完整响应体。
pub fn parse_complete_response(body: &str) -> Result<ChatResult, AiError> {
    let v: Value = serde_json::from_str(body).map_err(|e| {
        AiError::new(AiErrorCode::InvalidFormat, "返回内容不是合法 JSON").with_detail(e.to_string())
    })?;
    let choice = v
        .get("choices")
        .and_then(|c| c.get(0))
        .ok_or_else(|| AiError::new(AiErrorCode::InvalidFormat, "返回缺少 choices 内容"))?;
    let text = choice
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    Ok(ChatResult {
        text,
        finish_reason: parse_finish_reason(
            choice.get("finish_reason").and_then(Value::as_str),
        ),
        actual_model: v.get("model").and_then(Value::as_str).map(str::to_string),
        usage: parse_usage(v.get("usage")),
    })
}

/// 从一条 SSE data 负载中提取 (增量文本, 可选 finish_reason, 可选 usage)。
/// [DONE] 哨兵由 SseParser 处理,这里只看 JSON 事件。
pub fn parse_stream_event(payload: &str) -> Result<StreamEvent, AiError> {
    let v: Value = serde_json::from_str(payload).map_err(|e| {
        AiError::new(AiErrorCode::InvalidFormat, "流式事件不是合法 JSON").with_detail(e.to_string())
    })?;
    let choice = v.get("choices").and_then(|c| c.get(0));
    let delta = choice
        .and_then(|c| c.get("delta"))
        .and_then(|d| d.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let finish_reason = choice
        .and_then(|c| c.get("finish_reason"))
        .and_then(Value::as_str)
        .map(|s| parse_finish_reason(Some(s)));
    Ok(StreamEvent {
        delta,
        finish_reason,
        actual_model: v.get("model").and_then(Value::as_str).map(str::to_string),
        usage: parse_usage(v.get("usage")),
    })
}

#[derive(Debug, Clone, Default)]
pub struct StreamEvent {
    pub delta: String,
    pub finish_reason: Option<FinishReason>,
    pub actual_model: Option<String>,
    pub usage: Option<ChatUsage>,
}

/// 增量 SSE 解析器:喂入任意切割的文本块,吐出完整的 data 负载。
/// 事件以空行分隔(\n\n 或 \r\n\r\n),数据行以 "data:" 开头。
#[derive(Debug, Default)]
pub struct SseParser {
    buffer: String,
}

#[derive(Debug, PartialEq)]
pub enum SseItem {
    /// 一条 data 负载(已去掉 "data:" 前缀与首空格)
    Data(String),
    /// 服务端结束哨兵
    Done,
}

impl SseParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn feed(&mut self, chunk: &str) -> Result<Vec<SseItem>, AiError> {
        self.buffer.push_str(chunk);
        if self.buffer.len() > MAX_SSE_EVENT_BYTES * 2 {
            return Err(AiError::new(
                AiErrorCode::InvalidFormat,
                "流式响应异常,单个事件超出大小上限",
            ));
        }
        let mut items = Vec::new();
        loop {
            // 同时接受 \n\n 与 \r\n\r\n 分隔
            let pos = self.buffer.find("\n\n").map(|p| (p, 2)).or_else(|| {
                self.buffer.find("\r\n\r\n").map(|p| (p, 4))
            });
            let Some((end, sep_len)) = pos else { break };
            let event: String = self.buffer.drain(..end + sep_len).collect();
            let event = event[..event.len() - sep_len].to_string();
            if event.trim().is_empty() {
                continue;
            }
            for line in event.lines() {
                let line = line.trim_end_matches('\r');
                if let Some(payload) = line.strip_prefix("data:") {
                    let payload = payload.strip_prefix(' ').unwrap_or(payload);
                    if payload == "[DONE]" {
                        items.push(SseItem::Done);
                    } else if !payload.is_empty() {
                        items.push(SseItem::Data(payload.to_string()));
                    }
                }
                // 注释行(: keep-alive)与其他字段忽略
            }
        }
        Ok(items)
    }

    /// 流结束:若缓冲区还有未终止事件内容,属于协议异常。
    pub fn finish(&self) -> Result<(), AiError> {
        if self.buffer.trim().is_empty() {
            Ok(())
        } else {
            Err(AiError::new(
                AiErrorCode::InvalidFormat,
                "流式响应未正常结束",
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::adapter::ChatMessage;

    #[test]
    fn chat_url_appends_endpoint_without_adding_version() {
        assert_eq!(chat_url("https://api.example.com").unwrap(), "https://api.example.com/chat/completions");
        assert_eq!(chat_url("https://api.example.com/v1").unwrap(), "https://api.example.com/v1/chat/completions");
        assert_eq!(chat_url("https://api.example.com/v1/").unwrap(), "https://api.example.com/v1/chat/completions");
        assert_eq!(models_url("https://api.example.com/v1").unwrap(), "https://api.example.com/v1/models");
    }

    #[test]
    fn request_body_minimal_and_optional_fields() {
        let mut req = ChatRequest::new("m", vec![ChatMessage::user("hi")]);
        let body = build_request_body(&req);
        assert_eq!(body["model"], "m");
        assert_eq!(body["stream"], false);
        assert_eq!(body["messages"][0]["role"], "user");
        assert!(body.get("max_tokens").is_none());
        assert!(body.get("response_format").is_none());
        assert!(body.get("temperature").is_none());

        req.max_tokens = Some(1024);
        req.json_mode = true;
        let body = build_request_body(&req);
        assert_eq!(body["max_tokens"], 1024);
        assert_eq!(body["response_format"]["type"], "json_object");
    }

    #[test]
    fn classifies_http_status() {
        assert_eq!(classify_status(reqwest::StatusCode::UNAUTHORIZED, "").code, AiErrorCode::AuthFailed);
        assert_eq!(classify_status(reqwest::StatusCode::FORBIDDEN, "").code, AiErrorCode::AuthFailed);
        assert_eq!(classify_status(reqwest::StatusCode::NOT_FOUND, "").code, AiErrorCode::ModelNotFound);
        assert_eq!(classify_status(reqwest::StatusCode::TOO_MANY_REQUESTS, "").code, AiErrorCode::RateLimited);
        assert_eq!(classify_status(reqwest::StatusCode::BAD_GATEWAY, "").code, AiErrorCode::ConnectionFailed);
        assert_eq!(
            classify_status(reqwest::StatusCode::BAD_REQUEST, "bad param").code,
            AiErrorCode::InvalidFormat
        );
    }

    #[test]
    fn parse_complete_response_full() {
        let body = r#"{
            "model": "deepseek-chat",
            "choices": [{"message": {"content": "hello"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
        }"#;
        let r = parse_complete_response(body).unwrap();
        assert_eq!(r.text, "hello");
        assert_eq!(r.finish_reason, FinishReason::Stop);
        assert_eq!(r.actual_model.as_deref(), Some("deepseek-chat"));
        assert_eq!(r.usage.as_ref().unwrap().total_tokens, Some(15));
        assert!(r.is_complete());
    }

    #[test]
    fn parse_complete_response_truncated() {
        let body = r#"{"choices": [{"message": {"content": "abc"}, "finish_reason": "length"}]}"#;
        let r = parse_complete_response(body).unwrap();
        assert_eq!(r.finish_reason, FinishReason::Length);
        assert!(!r.is_complete());
    }

    #[test]
    fn parse_complete_response_rejects_garbage() {
        assert!(parse_complete_response("not json").is_err());
        assert!(parse_complete_response("{\"choices\": []}").is_err());
    }

    #[test]
    fn stream_event_extracts_delta_and_finish() {
        let e = parse_stream_event(
            r#"{"choices": [{"delta": {"content": "你"}, "finish_reason": null}]}"#,
        )
        .unwrap();
        assert_eq!(e.delta, "你");
        assert!(e.finish_reason.is_none());

        let e = parse_stream_event(
            r#"{"choices": [{"delta": {},"finish_reason": "stop"}], "usage": {"total_tokens": 9}}"#,
        )
        .unwrap();
        assert_eq!(e.delta, "");
        assert_eq!(e.finish_reason, Some(FinishReason::Stop));
        assert_eq!(e.usage.unwrap().total_tokens, Some(9));
    }

    #[test]
    fn sse_parser_handles_split_chunks() {
        let mut p = SseParser::new();
        // 半行切割 + \r\n 混用 + 注释行
        let a = p.feed("data: {\"a\"").unwrap();
        assert!(a.is_empty());
        let b = p.feed(":1}\n\ndata: {\"b\":2}\r\n\r").unwrap();
        assert_eq!(b, vec![SseItem::Data("{\"a\":1}".to_string())]);
        let c = p.feed("\ndata: [DONE]\n\n").unwrap();
        assert_eq!(c, vec![SseItem::Data("{\"b\":2}".to_string()), SseItem::Done]);
        p.finish().unwrap();
    }

    #[test]
    fn sse_parser_finish_rejects_trailing_partial() {
        let mut p = SseParser::new();
        p.feed("data: {\"un").unwrap();
        assert!(p.finish().is_err());
    }
}
