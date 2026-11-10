use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::Emitter;

use crate::ai::adapter::openai_chat::{
    build_request_body, chat_url, classify_status, parse_complete_response, parse_stream_event,
    SseItem, SseParser, MAX_RESPONSE_BYTES,
};
use crate::ai::adapter::{ChatRequest, ChatResult, FinishReason};
use crate::ai::config_repo::AiConnection;use crate::ai::error::{AiError, AiErrorCode};

pub const DEFAULT_TIMEOUT_SECS: i64 = 120;
/// 用户请求与测试合计的并发槽位上限。
pub const MAX_CONCURRENT_REQUESTS: usize = 2;
/// 进度事件单次推送的最小累计增量,避免逐 token 事件刷屏。
const PROGRESS_FLUSH_CHARS: usize = 24;

/// 进度事件载荷。只发发起请求的 main 窗口,前端按 request_id 过滤。
#[derive(Clone, serde::Serialize)]
pub struct ProgressEvent {
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

/// 模型请求运行时:HTTP 客户端、并发槽、取消注册表。
/// 网络执行期间不持有数据库锁;调用方负责在调用前后用短临界区读写配置与摘要。
pub struct AiRuntime {
    pub http: reqwest::Client,
    permits: Arc<tokio::sync::Semaphore>,
    in_flight: Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>,
    /// 同一任务同时只允许一次拆解生成(设计 §6:同一任务同时只运行一次拆解)。
    pub active_breakdowns: Mutex<std::collections::HashSet<String>>,
    /// 拆解候选缓存 proposalId → StoredProposal;仅内存,重启即弃。
    pub proposals: Mutex<HashMap<String, crate::ai::breakdown::StoredProposal>>,
    /// 今日行动建议:同一本地日期同时只允许一次规划请求。
    pub active_my_day_dates: Mutex<std::collections::HashSet<String>>,
    /// 今日行动建议:contextId → 候选快照;同一日期只保留最新一份,仅内存。
    pub my_day_contexts: Mutex<HashMap<String, crate::ai::my_day::StoredMyDayContext>>,
    /// 今日行动建议:proposalId → 生成结果;同一日期只保留最新一份,仅内存。
    pub my_day_proposals: Mutex<HashMap<String, crate::ai::my_day::StoredMyDayProposal>>,
    /// 日/周回顾:同一回顾范围同时至多一个生成请求。
    pub active_review_scopes: Mutex<std::collections::HashSet<String>>,
    /// 日/周回顾:scopeKey → 准备好的上下文快照;同范围重新准备会替换,仅内存。
    pub review_contexts: Mutex<HashMap<String, crate::ai::review::PreparedReviewContext>>,
    /// 日/周回顾:scopeKey → 生成候选;仅内存,保存与否由用户显式决定。
    pub review_proposals: Mutex<HashMap<String, crate::ai::review::StoredReviewProposal>>,
}

impl Default for AiRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl AiRuntime {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::builder()
                .user_agent(concat!("TodoFlow/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("failed to build reqwest client"),
            permits: Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_REQUESTS)),
            in_flight: Mutex::new(HashMap::new()),
            active_breakdowns: Mutex::new(std::collections::HashSet::new()),
            proposals: Mutex::new(HashMap::new()),
            active_my_day_dates: Mutex::new(std::collections::HashSet::new()),
            my_day_contexts: Mutex::new(HashMap::new()),
            my_day_proposals: Mutex::new(HashMap::new()),
            active_review_scopes: Mutex::new(std::collections::HashSet::new()),
            review_contexts: Mutex::new(HashMap::new()),
            review_proposals: Mutex::new(HashMap::new()),
        }
    }

    /// 并发槽位(测试用)。
    pub fn permits(&self) -> &Arc<tokio::sync::Semaphore> {
        &self.permits
    }

    /// 请求进行中数量(测试/诊断用)。
    pub fn in_flight_count(&self) -> usize {
        self.in_flight.lock().map(|m| m.len()).unwrap_or(0)
    }

    /// 发出取消信号。不存在的 request_id 静默忽略(晚到的取消无害)。
    pub fn cancel(&self, request_id: &str) {
        if let Ok(mut map) = self.in_flight.lock() {
            if let Some(tx) = map.remove(request_id) {
                let _ = tx.send(());
            }
        }
    }

    fn emit_progress<R: tauri::Runtime>(app: Option<&tauri::AppHandle<R>>, event: ProgressEvent) {
        if let Some(app) = app {
            let _ = app.emit_to("main", "ai-request-progress", event);
        }
    }

    fn map_reqwest_error(e: &reqwest::Error) -> AiError {
        if e.is_timeout() {
            AiError::new(AiErrorCode::Timeout, "请求超时")
        } else if e.is_connect() {
            AiError::new(AiErrorCode::ConnectionFailed, "无法连接到模型服务")
        } else {
            AiError::new(AiErrorCode::ConnectionFailed, "网络请求失败").with_detail(e.to_string())
        }
    }

    /// 执行一次对话请求。返回规范化结果;错误带机器可读 code。
    /// 取消 = 本地停止等待/接收/处理;晚到的服务响应在取消后不会被读取。
    pub async fn execute_chat<R: tauri::Runtime>(
        &self,
        app: Option<&tauri::AppHandle<R>>,
        request_id: &str,
        connection: &AiConnection,
        api_key: &str,
        request: &ChatRequest,
    ) -> Result<ChatResult, AiError> {
        let _permit = self
            .permits
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| AiError::new(AiErrorCode::Internal, "并发槽已关闭"));

        let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
        self.in_flight
            .lock()
            .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?
            .insert(request_id.to_string(), cancel_tx);
        let _request_guard = RequestGuard { runtime: self, request_id: request_id.to_string() };

        let timeout = Duration::from_secs(
            connection.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS).max(1) as u64,
        );
        let url = chat_url(&connection.base_url)?;
        let body = build_request_body(request);

        let send_fut = self
            .http
            .post(&url)
            .bearer_auth(api_key)
            .json(&body)
            .timeout(timeout)
            .send();

        let response = tokio::select! {
            biased;
            _ = &mut cancel_rx => {
                return Err(AiError::new(AiErrorCode::Cancelled, "已取消"));
            }
            res = send_fut => res.map_err(|e| Self::map_reqwest_error(&e))?,
        };

        let status = response.status();
        if !status.is_success() {
            let snippet = response
                .text()
                .await
                .unwrap_or_default();
            return Err(classify_status(status, &snippet));
        }

        if request.stream {
            Self::read_stream(app, request_id, response, cancel_rx).await
        } else {
            Self::read_complete(response, cancel_rx).await
        }
    }

    async fn read_complete(
        response: reqwest::Response,
        mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
    ) -> Result<ChatResult, AiError> {
        let mut response = response;
        let mut body = Vec::with_capacity(8 * 1024);
        loop {
            let chunk_fut = response.chunk();
            tokio::select! {
                biased;
                _ = &mut cancel_rx => {
                    return Err(AiError::new(AiErrorCode::Cancelled, "已取消"));
                }
                chunk = chunk_fut => {
                    let chunk = chunk.map_err(|e| Self::map_reqwest_error(&e))?;
                    match chunk {
                        Some(bytes) => {
                            if body.len() + bytes.len() > MAX_RESPONSE_BYTES {
                                return Err(AiError::new(
                                    AiErrorCode::InvalidFormat,
                                    "响应体超出大小上限",
                                ));
                            }
                            body.extend_from_slice(&bytes);
                        }
                        None => break,
                    }
                }
            }
        }
        let text = String::from_utf8_lossy(&body).to_string();
        parse_complete_response(&text)
    }

    async fn read_stream<R: tauri::Runtime>(
        app: Option<&tauri::AppHandle<R>>,
        request_id: &str,
        response: reqwest::Response,
        mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
    ) -> Result<ChatResult, AiError> {
        let mut response = response;
        let mut parser = SseParser::new();
        let mut text = String::new();
        let mut pending_progress = String::new();
        let mut finish_reason: Option<FinishReason> = None;
        let mut actual_model: Option<String> = None;
        let mut usage = None;
        let mut done_seen = false;
        let mut total_bytes = 0usize;

        loop {
            let chunk_fut = response.chunk();
            tokio::select! {
                biased;
                _ = &mut cancel_rx => {
                    return Err(AiError::new(AiErrorCode::Cancelled, "已取消"));
                }
                chunk = chunk_fut => {
                    let chunk = chunk.map_err(|e| Self::map_reqwest_error(&e))?;
                    let Some(bytes) = chunk else { break };
                    total_bytes += bytes.len();
                    if total_bytes > MAX_RESPONSE_BYTES {
                        return Err(AiError::new(AiErrorCode::InvalidFormat, "流式响应超出大小上限"));
                    }
                    let chunk_str = String::from_utf8_lossy(&bytes).to_string();
                    for item in parser.feed(&chunk_str)? {
                        match item {
                            SseItem::Done => done_seen = true,
                            SseItem::Data(payload) => {
                                let ev = parse_stream_event(&payload)?;
                                if !ev.delta.is_empty() {
                                    text.push_str(&ev.delta);
                                    pending_progress.push_str(&ev.delta);
                                }
                                if let Some(fr) = ev.finish_reason {
                                    finish_reason = Some(fr);
                                }
                                if ev.actual_model.is_some() {
                                    actual_model = ev.actual_model;
                                }
                                if ev.usage.is_some() {
                                    usage = ev.usage;
                                }
                            }
                        }
                    }
                    if pending_progress.chars().count() >= PROGRESS_FLUSH_CHARS {
                        Self::emit_progress(
                            app,
                            ProgressEvent {
                                request_id: request_id.to_string(),
                                delta: Some(std::mem::take(&mut pending_progress)),
                                status: None,
                            },
                        );
                    }
                }
            }
        }

        parser.finish()?;
        Self::emit_progress(
            app,
            ProgressEvent {
                request_id: request_id.to_string(),
                delta: if pending_progress.is_empty() {
                    None
                } else {
                    Some(std::mem::take(&mut pending_progress))
                },
                status: Some(if done_seen { "done".into() } else { "ended".into() }),
            },
        );

        Ok(ChatResult {
            text,
            finish_reason: finish_reason.unwrap_or(FinishReason::Other),
            actual_model,
            usage,
        })
    }
}

/// 退出作用域时移除 in_flight 注册(成功、失败、取消路径统一)。
struct RequestGuard<'a> {
    runtime: &'a AiRuntime,
    request_id: String,
}

impl Drop for RequestGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut map) = self.runtime.in_flight.lock() {
            map.remove(&self.request_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::task::JoinHandle;

    /// 启动一次性 mock 服务器:读完整请求(头+短 body),按脚本分块延时写响应。
    /// 返回 (base_url, 收到的请求字节)。
    async fn start_mock(
        script: Vec<(Duration, String)>,
    ) -> (String, Arc<Mutex<Vec<u8>>>, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let received = Arc::new(Mutex::new(Vec::new()));
        let received_clone = received.clone();
        let handle = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = [0u8; 16384];
            let mut req_bytes = Vec::new();
            // 读到请求头结束(小 body 通常同包到达;再补一次短超时读)
            loop {
                let n = stream.read(&mut buf).await.unwrap();
                if n == 0 {
                    break;
                }
                req_bytes.extend_from_slice(&buf[..n]);
                if req_bytes.windows(4).any(|w| w == b"\r\n\r\n") {
                    // 头结束;短超时内再收一次,把同连接随后到达的 body 一并记下
                    if let Ok(Ok(n2)) = tokio::time::timeout(Duration::from_millis(100), stream.read(&mut buf)).await {
                        if n2 > 0 {
                            req_bytes.extend_from_slice(&buf[..n2]);
                        }
                    }
                    break;
                }
            }
            *received_clone.lock().unwrap() = req_bytes;
            for (delay, part) in script {
                if !delay.is_zero() {
                    tokio::time::sleep(delay).await;
                }
                let _ = stream.write_all(part.as_bytes()).await;
            }
            tokio::time::sleep(Duration::from_millis(300)).await;
        });
        (format!("http://{}", addr), received, handle)
    }

    fn connection_for(base_url: &str, timeout: Option<i64>) -> AiConnection {
        AiConnection {
            id: "conn-1".into(),
            name: "mock".into(),
            protocol: "openai_chat".into(),
            base_url: base_url.into(),
            preset_id: None,
            credential_version: 1,
            revision: 1,
            enabled: true,
            timeout_secs: timeout,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    const SSE_HEADERS: &str = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n";

    #[tokio::test]
    async fn streams_split_chunks_to_full_text() {
        // 刻意把一条 SSE 事件劈成两半,并把两个事件挤进同一块
        let (base, received, _h) = start_mock(vec![
            (Duration::ZERO, SSE_HEADERS.into()),
            (Duration::ZERO, "data: {\"choices\":[{\"delta\":{\"conte".into()),
            (Duration::ZERO, "nt\":\"你\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"好\"},\"finish_reason\":\"stop\"}]}\n\n".into()),
            (Duration::ZERO, "data: [DONE]\n\n".into()),
        ])
        .await;

        let runtime = Arc::new(AiRuntime::new());
        let mut req = ChatRequest::new("mock-model", vec![crate::ai::adapter::ChatMessage::user("hi")]);
        req.stream = true;
        let result = runtime
            .execute_chat::<tauri::Wry>(None, "req-1", &connection_for(&base, None), "test-key", &req)
            .await
            .unwrap();

        assert_eq!(result.text, "你好");
        assert_eq!(result.finish_reason, FinishReason::Stop);
        let req_bytes = received.lock().unwrap().clone();
        let headers = String::from_utf8_lossy(&req_bytes).to_ascii_lowercase();
        assert!(headers.contains("authorization: bearer test-key"));
        assert!(headers.contains("/chat/completions"));
    }

    #[tokio::test]
    async fn non_stream_parses_complete_body() {
        let body = r#"{"model":"m","choices":[{"message":{"content":"答案"},"finish_reason":"stop"}]}"#;
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let (base, _received, _h) = start_mock(vec![(Duration::ZERO, resp)]).await;
        let runtime = AiRuntime::new();
        let req = ChatRequest::new("m", vec![crate::ai::adapter::ChatMessage::user("hi")]);
        let result = runtime
            .execute_chat::<tauri::Wry>(None, "req-2", &connection_for(&base, None), "k", &req)
            .await
            .unwrap();
        assert_eq!(result.text, "答案");
        assert!(result.is_complete());
    }

    #[tokio::test]
    async fn http_401_maps_to_auth_failed() {
        let resp = "HTTP/1.1 401 Unauthorized\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".into();
        let (base, _received, _h) = start_mock(vec![(Duration::ZERO, resp)]).await;
        let runtime = AiRuntime::new();
        let req = ChatRequest::new("m", vec![crate::ai::adapter::ChatMessage::user("hi")]);
        let err = runtime
            .execute_chat::<tauri::Wry>(None, "req-3", &connection_for(&base, None), "bad-key", &req)
            .await
            .unwrap_err();
        assert_eq!(err.code, AiErrorCode::AuthFailed);
    }

    #[tokio::test]
    async fn cancel_returns_cancelled_and_ignores_late_data() {
        // 头立即回,数据 400ms 后才到;150ms 时取消
        let (base, _received, _h) = start_mock(vec![
            (Duration::ZERO, SSE_HEADERS.into()),
            (
                Duration::from_millis(400),
                "data: {\"choices\":[{\"delta\":{\"content\":\"晚\"}}]}\n\ndata: [DONE]\n\n".into(),
            ),
        ])
        .await;
        let runtime = Arc::new(AiRuntime::new());
        let mut req = ChatRequest::new("m", vec![crate::ai::adapter::ChatMessage::user("hi")]);
        req.stream = true;
        let conn = connection_for(&base, None);
        let exec = runtime.execute_chat::<tauri::Wry>(None, "req-4", &conn, "k", &req);
        tokio::pin!(exec);
        // select 保证请求先被 poll(完成 in_flight 注册),再在 150ms 发出取消
        let err = tokio::select! {
            res = &mut exec => res.unwrap_err(),
            _ = tokio::time::sleep(Duration::from_millis(150)) => {
                runtime.cancel("req-4");
                exec.await.unwrap_err()
            }
        };
        assert_eq!(err.code, AiErrorCode::Cancelled);
        assert_eq!(runtime.in_flight_count(), 0);
    }

    #[tokio::test]
    async fn stalled_server_times_out() {
        // 5 秒不回任何字节,连接超时 1 秒
        let (base, _received, _h) = start_mock(vec![(Duration::from_secs(5), SSE_HEADERS.into())]).await;
        let runtime = AiRuntime::new();
        let req = ChatRequest::new("m", vec![crate::ai::adapter::ChatMessage::user("hi")]);
        let err = runtime
            .execute_chat::<tauri::Wry>(None, "req-5", &connection_for(&base, Some(1)), "k", &req)
            .await
            .unwrap_err();
        assert_eq!(err.code, AiErrorCode::Timeout);
    }

    #[tokio::test]
    async fn concurrency_limited_to_two_slots() {
        let runtime = AiRuntime::new();
        let p1 = runtime.permits().clone().try_acquire_owned().unwrap();
        let p2 = runtime.permits().clone().try_acquire_owned().unwrap();
        assert!(runtime.permits().clone().try_acquire_owned().is_err());
        drop((p1, p2));
        assert!(runtime.permits().clone().try_acquire_owned().is_ok());
    }
}
