use std::time::Instant;

use crate::ai::adapter::{ChatMessage, ChatRequest, ChatResult, ChatUsage, FinishReason};
use crate::ai::breakdown;
use crate::ai::config_repo::AiConnection;
use crate::ai::error::{AiError, AiErrorCode};
use crate::ai::gateway::AiRuntime;

/// 验证种类。输入全部为固定短小文本或内置虚构任务,不含任何用户任务内容。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbeKind {
    Basic,
    Stream,
    Breakdown,
}

impl ProbeKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ProbeKind::Basic => "basic",
            ProbeKind::Stream => "stream",
            ProbeKind::Breakdown => "breakdown",
        }
    }
}

#[derive(Debug)]
pub struct ProbeOutcome {
    pub passed: bool,
    /// 通过时的备注(如 json_fallback)或失败时的错误摘要。
    pub detail: Option<String>,
    pub error: Option<AiError>,
    pub duration_ms: u64,
    pub usage: Option<ChatUsage>,
}

/// 基础与流式验证共用的固定测试输入。
const PROBE_USER_PROMPT: &str = "这是一次连通性测试,请只回复两个字:收到";
const PROBE_SYSTEM_PROMPT: &str = "你是连通性测试助手,只输出简短确认。";

fn require_complete_stop(result: &ChatResult, kind: &str) -> Result<(), AiError> {
    match result.finish_reason {
        FinishReason::Stop if !result.text.trim().is_empty() => Ok(()),
        FinishReason::Length => Err(AiError::new(
            AiErrorCode::OutputTruncated,
            format!("{}验证的输出被截断", kind),
        )),
        FinishReason::ContentFilter => Err(AiError::new(
            AiErrorCode::Unsupported,
            format!("{}验证的输出被服务拒绝(内容过滤)", kind),
        )),
        _ => Err(AiError::new(
            AiErrorCode::InvalidFormat,
            format!("{}验证未正常完成", kind),
        )),
    }
}

/// 执行一次验证。只做调用与本地判定,不写库;持久化由命令层完成。
pub async fn run_probe(
    runtime: &AiRuntime,
    app: Option<&tauri::AppHandle>,
    request_id: &str,
    connection: &AiConnection,
    model_id: &str,
    api_key: &str,
    kind: ProbeKind,
) -> ProbeOutcome {
    let started = Instant::now();
    let outcome = match kind {
        ProbeKind::Basic => probe_plain(runtime, app, request_id, connection, model_id, api_key).await,
        ProbeKind::Stream => probe_stream(runtime, app, request_id, connection, model_id, api_key).await,
        ProbeKind::Breakdown => probe_breakdown(runtime, app, request_id, connection, model_id, api_key).await,
    };
    let duration_ms = started.elapsed().as_millis() as u64;
    let (passed, detail, error, usage) = match outcome {
        Ok((usage, detail)) => (true, detail, None, usage),
        Err((e, usage)) => (false, Some(e.message.clone()), Some(e), usage),
    };
    ProbeOutcome {
        passed,
        detail,
        error,
        duration_ms,
        usage,
    }
}

type ProbeResult = Result<(Option<ChatUsage>, Option<String>), (AiError, Option<ChatUsage>)>;

fn basic_request(model_id: &str, stream: bool) -> ChatRequest {
    let mut req = ChatRequest::new(
        model_id,
        vec![
            ChatMessage::system(PROBE_SYSTEM_PROMPT),
            ChatMessage::user(PROBE_USER_PROMPT),
        ],
    );
    req.stream = stream;
    req
}

async fn probe_plain(
    runtime: &AiRuntime,
    app: Option<&tauri::AppHandle>,
    request_id: &str,
    connection: &AiConnection,
    model_id: &str,
    api_key: &str,
) -> ProbeResult {
    let req = basic_request(model_id, false);
    let result = runtime
        .execute_chat(app, request_id, connection, api_key, &req)
        .await
        .map_err(|e| (e, None))?;
    require_complete_stop(&result, "基础").map_err(|e| (e, result.usage.clone()))?;
    Ok((result.usage, None))
}

async fn probe_stream(
    runtime: &AiRuntime,
    app: Option<&tauri::AppHandle>,
    request_id: &str,
    connection: &AiConnection,
    model_id: &str,
    api_key: &str,
) -> ProbeResult {
    let req = basic_request(model_id, true);
    let result = runtime
        .execute_chat(app, request_id, connection, api_key, &req)
        .await
        .map_err(|e| (e, None))?;
    require_complete_stop(&result, "流式").map_err(|e| (e, result.usage.clone()))?;
    Ok((result.usage, None))
}

async fn probe_breakdown(
    runtime: &AiRuntime,
    app: Option<&tauri::AppHandle>,
    request_id: &str,
    connection: &AiConnection,
    model_id: &str,
    api_key: &str,
) -> ProbeResult {
    let ctx = breakdown::sample_context_for_verification();
    // 先尝试 JSON 输出模式;服务拒绝(400 类)时降级纯文本重试一次并注明。
    // 界面不得把降级结果声称成"服务支持 JSON 模式"。
    let mut req = breakdown::build_breakdown_request(model_id, &ctx, false);

    let first = runtime.execute_chat(app, request_id, connection, api_key, &req).await;
    let (result, json_fallback) = match first {
        Ok(r) => (r, false),
        Err(e) if e.code == AiErrorCode::InvalidFormat => {
            req.json_mode = false;
            let retry = runtime
                .execute_chat(app, request_id, connection, api_key, &req)
                .await
                .map_err(|e2| (e2, None))?;
            (retry, true)
        }
        Err(e) => return Err((e, None)),
    };

    if result.finish_reason != FinishReason::Stop {
        return Err((
            AiError::new(AiErrorCode::OutputTruncated, "拆解样例输出被截断"),
            result.usage.clone(),
        ));
    }
    let validated = breakdown::parse_and_validate(&result.text)
        .map_err(|e| (e, result.usage.clone()))?;
    let detail = if json_fallback {
        Some("该服务拒绝了 JSON 输出模式,已用纯文本生成并通过本地结构校验(不代表服务支持严格 JSON)".to_string())
    } else if validated.assumptions.is_empty() {
        None
    } else {
        Some("样例包含假设".to_string())
    };
    Ok((result.usage, detail))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn breakdown_probe_json_fallback_via_mock() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        // 第一次请求带 response_format → 400;第二次(降级)返回合法拆解 JSON
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            for (round, body) in [
                ("{\"error\":\"response_format not supported\"}".to_string()),
                // 第二次(降级纯文本)响应:标准 ChatCompletion 包裹拆解 JSON
                (r#"{"model":"m","choices":[{"message":{"content":"{\"assumptions\":[],\"items\":[{\"title\":\"定议程\",\"instructions\":\"列出议题\"}]}"},"finish_reason":"stop"}]}"#.to_string()),
            ]
            .into_iter()
            .enumerate()
            {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buf = [0u8; 16384];
                let mut req = Vec::new();
                loop {
                    let n = stream.read(&mut buf).await.unwrap();
                    if n == 0 { break; }
                    req.extend_from_slice(&buf[..n]);
                    if req.windows(4).any(|w| w == b"\r\n\r\n") { break; }
                }
                let is_first = round == 0;
                let status = if is_first { "400 Bad Request" } else { "200 OK" };
                let resp = format!(
                    "HTTP/1.1 {}\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
                    status, body.len(), body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            }
        });

        let connection = AiConnection {
            id: "c".into(),
            name: "mock".into(),
            protocol: "openai_chat".into(),
            base_url: format!("http://{}", addr),
            preset_id: None,
            credential_version: 1,
            revision: 1,
            enabled: true,
            timeout_secs: Some(5),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let runtime = AiRuntime::new();
        let outcome = run_probe(&runtime, None, "probe-1", &connection, "m", "k", ProbeKind::Breakdown).await;
        assert!(outcome.passed, "detail: {:?}", outcome.detail);
        assert!(outcome.detail.unwrap().contains("纯文本"));
        assert!(outcome.duration_ms > 0);
    }
}
