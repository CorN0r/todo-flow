use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::{Emitter, State};

use crate::ai::config_repo::{
    self, AiConnection, AiModel, AiVerification, NewConnection, UpdateConnection,
};
use crate::ai::credentials::{CredentialStore, WindowsKeyringStore};
use crate::ai::error::{AiError, AiErrorCode};
use crate::AppState;

fn credential_store() -> &'static dyn CredentialStore {
    &WindowsKeyringStore
}

#[derive(Debug, Clone, Serialize)]
pub struct AiConnectionInfo {
    #[serde(flatten)]
    pub connection: AiConnection,
    pub credential_present: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiModelInfo {
    #[serde(flatten)]
    pub model: AiModel,
    pub verifications: Vec<AiVerification>,
}

fn attach_credential_status(_conn: &Connection, connections: Vec<AiConnection>) -> Result<Vec<AiConnectionInfo>, AiError> {
    // 凭证存储查询不涉及数据库,逐连接查询即可(连接数量级很小)
    let store = credential_store();
    Ok(connections
        .into_iter()
        .map(|c| {
            let present = store.exists(&c.id).unwrap_or(false);
            AiConnectionInfo {
                connection: c,
                credential_present: present,
            }
        })
        .collect())
}

// ---------- 连接 ----------

#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments)]
pub fn ai_create_connection(
    state: State<AppState>,
    name: String,
    protocol: String,
    base_url: String,
    preset_id: Option<String>,
    timeout_secs: Option<i64>,
    api_key: String,
) -> Result<AiConnectionInfo, AiError> {
    let api_key = api_key.trim().to_string();
    if api_key.is_empty() {
        return Err(AiError::new(AiErrorCode::Validation, "API Key 不能为空"));
    }
    if !matches!(protocol.as_str(), "openai_chat") {
        return Err(AiError::new(
            AiErrorCode::Unsupported,
            "首版仅支持 OpenAI 兼容 Chat Completions 协议",
        ));
    }
    let conn = state.db()?;
    let created = create_connection_with_credential(
        &conn,
        credential_store(),
        NewConnection {
            name,
            protocol,
            base_url,
            preset_id,
            timeout_secs,
        },
        &api_key,
    )?;
    let present = credential_store().exists(&created.id).unwrap_or(false);
    Ok(AiConnectionInfo {
        connection: created,
        credential_present: present,
    })
}

/// 凭证与数据库无法共用事务,固定次序:先写凭证 → 提交配置 → 失败时清理刚写的凭证。
/// 凭证写失败则配置完全没有变化,不会出现"显示保存成功但 Key 未存上"。
fn create_connection_with_credential(
    conn: &Connection,
    store: &dyn CredentialStore,
    req: NewConnection,
    api_key: &str,
) -> Result<AiConnection, AiError> {
    let created = config_repo::create_connection(conn, req)?;
    if let Err(e) = store.set(&created.id, api_key) {
        // 补偿:配置行删除,不留指向不存在凭证的可用引用
        let _ = config_repo::delete_connection(conn, &created.id);
        return Err(e);
    }
    Ok(created)
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_update_connection(
    state: State<AppState>,
    id: String,
    name: Option<String>,
    base_url: Option<String>,
    api_key: Option<String>,
) -> Result<AiConnectionInfo, AiError> {
    let conn = state.db()?;
    let credential_replaced = match api_key.as_deref().map(str::trim) {
        Some(k) if !k.is_empty() => {
            credential_store().set(&id, k)?;
            true
        }
        _ => false,
    };
    let updated = config_repo::update_connection(
        &conn,
        &id,
        UpdateConnection {
            name,
            base_url,
            timeout_secs: None,
            credential_replaced,
        },
    )?;
    let present = credential_store().exists(&updated.id).unwrap_or(false);
    Ok(AiConnectionInfo {
        connection: updated,
        credential_present: present,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_delete_connection(state: State<AppState>, id: String) -> Result<(), AiError> {
    let conn = state.db()?;
    config_repo::delete_connection(&conn, &id)?;
    // 凭证清理失败只留下无害孤儿条目(配置已删,无引用),不阻断删除
    let _ = credential_store().remove(&id);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_set_connection_enabled(state: State<AppState>, id: String, enabled: bool) -> Result<(), AiError> {
    let conn = state.db()?;
    config_repo::set_connection_enabled(&conn, &id, enabled)
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_set_connection_timeout(
    state: State<AppState>,
    id: String,
    timeout_secs: Option<i64>,
) -> Result<(), AiError> {
    let conn = state.db()?;
    // 走 update 以复用"影响请求的参数变化 → 验证过期 + revision"规则
    config_repo::update_connection(
        &conn,
        &id,
        UpdateConnection {
            timeout_secs: Some(timeout_secs),
            ..Default::default()
        },
    )?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_list_connections(state: State<AppState>) -> Result<Vec<AiConnectionInfo>, AiError> {
    let conn = state.db()?;
    let list = config_repo::list_connections(&conn)?;
    attach_credential_status(&conn, list)
}

// ---------- 模型 ----------

#[tauri::command(rename_all = "snake_case")]
pub fn ai_list_models(state: State<AppState>) -> Result<Vec<AiModelInfo>, AiError> {
    let conn = state.db()?;
    let models = config_repo::list_models(&conn)?;
    let mut result = Vec::with_capacity(models.len());
    for m in models {
        let verifications = config_repo::latest_verifications(&conn, &m.id)?;
        result.push(AiModelInfo {
            model: m,
            verifications,
        });
    }
    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_create_model(
    state: State<AppState>,
    connection_id: String,
    model_id: String,
    display_name: Option<String>,
) -> Result<AiModel, AiError> {
    let conn = state.db()?;
    config_repo::create_model(&conn, &connection_id, &model_id, display_name.as_deref())
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_update_model(
    state: State<AppState>,
    id: String,
    model_id: Option<String>,
    display_name: Option<String>,
) -> Result<AiModel, AiError> {
    let conn = state.db()?;
    config_repo::update_model(&conn, &id, model_id.as_deref(), display_name.as_deref())
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_delete_model(state: State<AppState>, id: String) -> Result<(), AiError> {
    let conn = state.db()?;
    // 若是默认模型,删除前要求已清空或换默认:由前端引导,后端兜底清空
    config_repo::delete_model(&conn, &id)
}

// ---------- 默认模型与凭证 ----------

#[tauri::command(rename_all = "snake_case")]
pub fn ai_get_default_model(state: State<AppState>) -> Result<Option<String>, AiError> {
    let conn = state.db()?;
    config_repo::get_default_model_id(&conn)
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_set_default_model(
    state: State<AppState>,
    model_entry_id: Option<String>,
) -> Result<(), AiError> {
    let conn = state.db()?;
    if let Some(ref id) = model_entry_id {
        // 默认模型必须属于启用中的连接,且本机凭证在位
        let model = config_repo::get_model(&conn, id)?
            .ok_or_else(|| AiError::new(AiErrorCode::ConfigMissing, "模型不存在"))?;
        let connection = config_repo::get_connection(&conn, &model.connection_id)?
            .ok_or_else(|| AiError::new(AiErrorCode::ConfigMissing, "所属连接不存在"))?;
        if !connection.enabled {
            return Err(AiError::new(
                AiErrorCode::Validation,
                "该模型所属连接已停用,不能设为默认",
            ));
        }
        if !credential_store().exists(&connection.id).unwrap_or(false) {
            return Err(AiError::new(
                AiErrorCode::CredentialUnavailable,
                "该连接需要先填写 API Key,才能设为默认模型",
            ));
        }
    }
    config_repo::set_default_model_id(&conn, model_entry_id.as_deref())
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_credential_exists(state: State<AppState>, connection_id: String) -> Result<bool, AiError> {
    // state 参数目前只为对称;凭证查询不碰数据库
    let _ = state;
    credential_store().exists(&connection_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;

    /// 可编程凭证替身:可注入写失败,记录调用序列验证保存次序与补偿。
    struct MockStore {
        fail_set: AtomicBool,
        calls: Mutex<RefCell<Vec<(&'static str, String)>>>,
    }

    impl MockStore {
        fn new() -> Self {
            Self {
                fail_set: AtomicBool::new(false),
                calls: Mutex::new(RefCell::new(Vec::new())),
            }
        }
        fn record(&self, op: &'static str, id: &str) {
            self.calls
                .lock()
                .unwrap()
                .borrow_mut()
                .push((op, id.to_string()));
        }
    }

    impl CredentialStore for MockStore {
        fn set(&self, connection_id: &str, _api_key: &str) -> Result<(), AiError> {
            self.record("set", connection_id);
            if self.fail_set.load(Ordering::SeqCst) {
                Err(AiError::new(
                    AiErrorCode::CredentialUnavailable,
                    "注入的写入失败",
                ))
            } else {
                Ok(())
            }
        }
        fn remove(&self, connection_id: &str) -> Result<(), AiError> {
            self.record("remove", connection_id);
            Ok(())
        }
        fn exists(&self, connection_id: &str) -> Result<bool, AiError> {
            self.record("exists", connection_id);
            Ok(true)
        }

        fn get(&self, connection_id: &str) -> Result<Option<String>, AiError> {
            self.record("get", connection_id);
            Ok(Some("mock-key".into()))
        }
    }

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::run(&conn).unwrap();
        conn
    }

    fn sample_req() -> NewConnection {
        NewConnection {
            name: "c".into(),
            protocol: "openai_chat".into(),
            base_url: "https://a.com/v1".into(),
            preset_id: None,
            timeout_secs: None,
        }
    }

    #[test]
    fn credential_write_failure_compensates_config() {
        let conn = setup();
        let store = MockStore::new();
        store.fail_set.store(true, Ordering::SeqCst);

        let err = create_connection_with_credential(&conn, &store, sample_req(), "k").unwrap_err();
        assert_eq!(err.code, AiErrorCode::CredentialUnavailable);

        // 配置不留残留,没有指向不存在凭证的引用
        assert!(config_repo::list_connections(&conn).unwrap().is_empty());
        assert!(config_repo::get_default_model_id(&conn).unwrap().is_none());
    }

    #[test]
    fn create_success_writes_credential_then_config_visible() {
        let conn = setup();
        let store = MockStore::new();
        let created = create_connection_with_credential(&conn, &store, sample_req(), "k").unwrap();
        assert_eq!(created.base_url, "https://a.com/v1");
        assert_eq!(config_repo::list_connections(&conn).unwrap().len(), 1);
    }
}

// ---------- 预设 ----------

#[tauri::command(rename_all = "snake_case")]
pub fn ai_get_presets() -> Result<Vec<crate::ai::presets::ProviderPreset>, AiError> {
    Ok(crate::ai::presets::PRESETS.to_vec())
}

// ---------- 运行时:取消与调用摘要 ----------

#[tauri::command(rename_all = "snake_case")]
pub fn ai_cancel_request(state: State<AppState>, request_id: String) -> Result<(), AiError> {
    state.ai_runtime.cancel(&request_id);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_list_invocations(
    state: State<AppState>,
    limit: Option<i64>,
) -> Result<Vec<crate::ai::diagnostics::AiInvocationSummary>, AiError> {
    let conn = state.db()?;
    crate::ai::diagnostics::list_invocations(&conn, limit.unwrap_or(50).clamp(1, 200))
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_clear_invocations(state: State<AppState>) -> Result<(), AiError> {
    let conn = state.db()?;
    crate::ai::diagnostics::clear_invocations(&conn)
}

// ---------- 模型列表 ----------

/// 从服务获取模型标识列表。失败返回错误,由界面保留手填模型;不据此判定生成接口不可用。
#[tauri::command(rename_all = "snake_case")]
pub async fn ai_fetch_models(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<String>, AiError> {
    use crate::ai::adapter::openai_chat::{classify_status, models_url, MAX_RESPONSE_BYTES};

    let connection = {
        let conn = state.db()?;
        config_repo::get_connection(&conn, &connection_id)?.ok_or_else(|| {
            AiError::new(AiErrorCode::ConfigMissing, "连接不存在")
        })?
    };
    let api_key = credential_store()
        .get(&connection.id)?
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| AiError::new(AiErrorCode::CredentialUnavailable, "该连接尚未配置 API Key"))?;

    let url = models_url(&connection.base_url)?;
    let timeout = std::time::Duration::from_secs(
        connection
            .timeout_secs
            .unwrap_or(crate::ai::gateway::DEFAULT_TIMEOUT_SECS)
            .max(1) as u64,
    );
    let response = state
        .ai_runtime
        .http
        .get(&url)
        .bearer_auth(&api_key)
        .timeout(timeout)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                AiError::new(AiErrorCode::Timeout, "获取模型列表超时")
            } else {
                AiError::new(AiErrorCode::ConnectionFailed, "无法连接到模型服务")
            }
        })?;
    let status = response.status();
    if !status.is_success() {
        let snippet = response.text().await.unwrap_or_default();
        return Err(classify_status(status, &snippet));
    }
    let body = response.text().await.unwrap_or_default();
    if body.len() > MAX_RESPONSE_BYTES {
        return Err(AiError::new(AiErrorCode::InvalidFormat, "模型列表响应超出大小上限"));
    }
    let v: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| AiError::new(AiErrorCode::InvalidFormat, "模型列表不是合法 JSON"))?;
    // OpenAI 格式 {"data":[{"id":...}]};容错裸数组 [{"id":...}]
    let array = v
        .get("data")
        .and_then(|d| d.as_array())
        .cloned()
        .or_else(|| v.as_array().cloned())
        .ok_or_else(|| AiError::new(AiErrorCode::InvalidFormat, "模型列表结构无法识别"))?;
    let mut ids: Vec<String> = array
        .into_iter()
        .filter_map(|item| item.get("id").and_then(serde_json::Value::as_str).map(str::to_string))
        .filter(|s| !s.is_empty())
        .collect();
    ids.sort();
    ids.dedup();
    Ok(ids)
}

// ---------- 验证 ----------

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_verify_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    model_entry_id: String,
    kind: String,
) -> Result<AiVerification, AiError> {
    use crate::ai::probe::{ProbeKind, run_probe};

    let kind = match kind.as_str() {
        "basic" => ProbeKind::Basic,
        "stream" => ProbeKind::Stream,
        "breakdown" => ProbeKind::Breakdown,
        _ => return Err(AiError::new(AiErrorCode::Validation, "未知验证类型")),
    };

    let (connection, model, fingerprint) = {
        let conn = state.db()?;
        let model = config_repo::get_model(&conn, &model_entry_id)?
            .ok_or_else(|| AiError::new(AiErrorCode::ConfigMissing, "模型不存在"))?;
        let connection = config_repo::get_connection(&conn, &model.connection_id)?
            .ok_or_else(|| AiError::new(AiErrorCode::ConfigMissing, "所属连接不存在"))?;
        if !connection.enabled {
            return Err(AiError::new(AiErrorCode::Validation, "该连接已停用"));
        }
        let fingerprint = config_repo::verification_fingerprint(
            &connection.protocol,
            &connection.base_url,
            &model.model_id,
            connection.timeout_secs,
            connection.credential_version,
        );
        (connection, model, fingerprint)
    };

    let api_key = credential_store()
        .get(&connection.id)?
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| AiError::new(AiErrorCode::CredentialUnavailable, "该连接尚未配置 API Key"))?;

    let runtime = state.ai_runtime.clone();
    let request_id = format!("verify-{}", uuid::Uuid::new_v4());
    let outcome = run_probe(
        &runtime,
        Some(&app),
        &request_id,
        &connection,
        &model.model_id,
        &api_key,
        kind,
    )
    .await;

    // 持久化:验证结果 + 调用摘要(固定短输入,无正文入库)
    let conn = state.db()?;
    let status = if outcome.passed { "passed" } else { "failed" };
    let verification = config_repo::upsert_verification(
        &conn,
        &model_entry_id,
        kind.as_str(),
        status,
        &fingerprint,
        outcome.detail.as_deref(),
    )?;
    crate::ai::diagnostics::record_invocation(
        &conn,
        &format!("verify_{}", kind.as_str()),
        Some(&model_entry_id),
        &format!("{} ({})", connection.name, model.model_id),
        if outcome.passed { "success" } else { "failed" },
        outcome.error.as_ref().map(|e| serde_json::to_value(&e.code).unwrap_or_default().as_str().unwrap_or("internal").to_string()).as_deref(),
        Some(outcome.duration_ms as i64),
        outcome.usage.as_ref(),
    )?;
    Ok(verification)
}

// ---------- 任务拆解:生成 ----------

#[derive(serde::Serialize)]
pub struct BreakdownProposalDto {
    pub proposal_id: String,
    /// 发起本次生成的请求标识;前端据此过滤进度事件。
    pub request_id: String,
    pub model_snapshot: String,
    pub assumptions: Vec<String>,
    pub items: Vec<crate::ai::breakdown::BreakdownItem>,
    pub used_stream: bool,
    pub json_fallback: bool,
    pub context_fingerprint: String,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_generate_breakdown(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    user_note: Option<String>,
    request_id: Option<String>,
) -> Result<BreakdownProposalDto, AiError> {
    use crate::ai::breakdown::{
        context_fingerprint, html_to_text, BreakdownContext, ChildSummary, StoredProposal,
    };
    use crate::db::task_repo;

    let user_note = user_note.unwrap_or_default();
    if user_note.chars().count() > 200 {
        return Err(AiError::new(AiErrorCode::Validation, "补充要求过长(最多 200 字)"));
    }

    // ---- 短临界区:校验准入、组装上下文、取默认模型、登记单飞 ----
    let (ctx, fingerprint, connection, model, use_stream) = {
        let conn = state.db()?;
        let task = task_repo::get_by_id(&conn, &task_id)?
            .ok_or_else(|| AiError::new(AiErrorCode::Validation, "任务不存在"))?;
        let deleted: Option<Option<String>> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                rusqlite::params![task_id],
                |row| row.get(0),
            )
            .optional()?;
        if deleted.flatten().is_some() {
            return Err(AiError::new(AiErrorCode::Validation, "任务不存在"));
        }
        if task.parent_task_id.is_some() {
            return Err(AiError::new(
                AiErrorCode::Validation,
                "子任务不能再继续拆解为下一级,请在顶层任务上使用 AI 拆解",
            ));
        }
        if task.is_completed {
            return Err(AiError::new(AiErrorCode::Validation, "任务已完成,不需要拆解"));
        }
        if task.is_archived {
            return Err(AiError::new(AiErrorCode::Validation, "任务已归档,请先恢复"));
        }
        if task.is_suspended || task.is_abandoned {
            return Err(AiError::new(
                AiErrorCode::Validation,
                "任务处于挂起或放弃状态,请先恢复为进行中",
            ));
        }

        let children = task_repo::get_children(&conn, &task_id)?;
        let ctx = BreakdownContext {
            task_title: task.title.clone(),
            description_text: html_to_text(&task.description),
            existing_children: children
                .iter()
                .map(|c| ChildSummary { title: c.title.clone(), is_completed: c.is_completed })
                .collect(),
            user_note: user_note.clone(),
        };
        let fingerprint = context_fingerprint(&ctx);

        // 默认模型 + 其连接
        let default_id = config_repo::get_default_model_id(&conn)?.ok_or_else(|| {
            AiError::new(AiErrorCode::ConfigMissing, "尚未设置默认模型,请先到设置 → AI 模型完成配置")
        })?;
        let model = config_repo::get_model(&conn, &default_id)?.ok_or_else(|| {
            AiError::new(AiErrorCode::ConfigMissing, "默认模型已不存在,请重新选择")
        })?;
        let connection = config_repo::get_connection(&conn, &model.connection_id)?.ok_or_else(|| {
            AiError::new(AiErrorCode::ConfigMissing, "默认模型所属连接已不存在")
        })?;
        if !connection.enabled {
            return Err(AiError::new(AiErrorCode::Validation, "默认模型所属连接已停用"));
        }

        // 正式功能使用已验证可行的接收方式:流式验证通过才用流式
        let use_stream = config_repo::latest_verifications(&conn, &model.id)?
            .iter()
            .any(|v| v.kind == "stream" && v.status == "passed");

        // 同任务单飞
        {
            let mut active = state
                .ai_runtime
                .active_breakdowns
                .lock()
                .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
            if active.contains(&task_id) {
                return Err(AiError::new(AiErrorCode::Validation, "该任务正在拆解中,请稍候"));
            }
            active.insert(task_id.clone());
        }

        (ctx, fingerprint, connection, model, use_stream)
    }; // ---- 数据库锁已释放 ----

    let result = generate_inner(&state, &app, &ctx, &connection, &model, use_stream, request_id).await;

    // 单飞解除(所有路径)
    if let Ok(mut active) = state.ai_runtime.active_breakdowns.lock() {
        active.remove(&task_id);
    }

    let (output, request_id, used_stream, json_fallback, usage) = result?;

    let proposal_id = uuid::Uuid::new_v4().to_string();
    let model_snapshot = format!("{} ({})", connection.name, model.model_id);
    let stored = StoredProposal {
        proposal_id: proposal_id.clone(),
        task_id: task_id.clone(),
        context_fingerprint: fingerprint.clone(),
        model_snapshot: model_snapshot.clone(),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        output: output.clone(),
    };
    if let Ok(mut proposals) = state.ai_runtime.proposals.lock() {
        // 同一任务的旧 proposal 不再可采纳(新预览覆盖旧预览)
        proposals.retain(|_, p| p.task_id != task_id);
        proposals.insert(proposal_id.clone(), stored);
    }

    {
        let conn = state.db()?;
        crate::ai::diagnostics::record_invocation(
            &conn,
            "breakdown",
            Some(&model.id),
            &model_snapshot,
            "success",
            None,
            None,
            usage.as_ref(),
        )?;
    }

    Ok(BreakdownProposalDto {
        proposal_id,
        request_id,
        model_snapshot,
        assumptions: output.assumptions,
        items: output.items,
        used_stream,
        json_fallback,
        context_fingerprint: fingerprint,
    })
}

type GenerateInnerResult = Result<
    (
        crate::ai::breakdown::BreakdownOutput,
        String,
        bool,
        bool,
        Option<crate::ai::adapter::ChatUsage>,
    ),
    AiError,
>;

async fn generate_inner(
    state: &State<'_, AppState>,
    app: &tauri::AppHandle,
    ctx: &crate::ai::breakdown::BreakdownContext,
    connection: &AiConnection,
    model: &AiModel,
    use_stream: bool,
    caller_request_id: Option<String>,
) -> GenerateInnerResult {
    use crate::ai::adapter::FinishReason;
    use crate::ai::breakdown::build_breakdown_request;

    let api_key = credential_store()
        .get(&connection.id)?
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| AiError::new(AiErrorCode::CredentialUnavailable, "该连接尚未配置 API Key"))?;

    let runtime = state.ai_runtime.clone();
    let request_id = caller_request_id
        .filter(|r| {
            !r.is_empty()
                && r.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        })
        .unwrap_or_else(|| format!("breakdown-{}", uuid::Uuid::new_v4()));
    let mut request = build_breakdown_request(&model.model_id, ctx, use_stream);
    let snapshot = format!("{} ({})", connection.name, model.model_id);
    let started = std::time::Instant::now();

    let record_failure = |error_code: &str, usage: Option<&crate::ai::adapter::ChatUsage>| {
        let conn = state.db()?;
        crate::ai::diagnostics::record_invocation(
            &conn,
            "breakdown",
            Some(&model.id),
            &snapshot,
            "failed",
            Some(error_code),
            Some(started.elapsed().as_millis() as i64),
            usage,
        )
    };

    // JSON 模式被拒(400 类)→ 降级纯文本重试一次,界面注明
    let (result, json_fallback) = match runtime
        .execute_chat(Some(app), &request_id, connection, &api_key, &request)
        .await
    {
        Ok(r) => (r, false),
        Err(e) if e.code == AiErrorCode::InvalidFormat => {
            request.json_mode = false;
            let retry = runtime
                .execute_chat(Some(app), &request_id, connection, &api_key, &request)
                .await?;
            (retry, true)
        }
        Err(e) => {
            if e.code == AiErrorCode::Cancelled {
                let conn = state.db()?;
                crate::ai::diagnostics::record_invocation(
                    &conn,
                    "breakdown",
                    Some(&model.id),
                    &snapshot,
                    "cancelled",
                    Some("cancelled"),
                    Some(started.elapsed().as_millis() as i64),
                    None,
                )?;
            } else {
                let code = serde_json::to_value(&e.code)
                    .unwrap_or_default()
                    .to_string()
                    .trim_matches('"')
                    .to_string();
                record_failure(&code, None)?;
            }
            return Err(e);
        }
    };

    if result.finish_reason != FinishReason::Stop {
        record_failure("output_truncated", result.usage.as_ref())?;
        return Err(AiError::new(
            AiErrorCode::OutputTruncated,
            "生成内容被截断,未产生可采纳的候选",
        ));
    }

    let output = match crate::ai::breakdown::parse_and_validate(&result.text) {
        Ok(o) => o,
        Err(e) => {
            record_failure("invalid_format", result.usage.as_ref())?;
            return Err(e);
        }
    };

    Ok((output, request_id, use_stream, json_fallback, result.usage))
}

// ---------- 任务拆解:采纳 ----------

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_apply_breakdown(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
    operation_id: String,
    items: Vec<crate::ai::breakdown::BreakdownItem>,
) -> Result<crate::ai::apply::ApplyResult, AiError> {
    use crate::ai::apply::apply_breakdown_items;

    if operation_id.trim().is_empty() {
        return Err(AiError::new(AiErrorCode::Validation, "操作标识不能为空"));
    }
    let proposal = {
        let proposals = state
            .ai_runtime
            .proposals
            .lock()
            .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
        proposals.get(&proposal_id).cloned().ok_or_else(|| {
            AiError::new(
                AiErrorCode::ApplyConflict,
                "预览已过期(应用已重启或已被新结果替换),请重新生成",
            )
        })?
    };

    let result = {
        let conn = state.db()?;
        apply_breakdown_items(&conn, &proposal.task_id, &proposal, operation_id.trim(), &items)?
    };

    // 成功后清理候选;幂等命中同样清理。context_changed 保留预览供重新决策。
    if result.already_applied || !result.created_task_ids.is_empty() {
        if let Ok(mut proposals) = state.ai_runtime.proposals.lock() {
            proposals.remove(&proposal_id);
        }
    }
    if !result.already_applied {
        let _ = app.emit("task-changed", ());
    }
    Ok(result)
}

// ---------- 任务描述润色 ----------

#[derive(serde::Serialize)]
pub struct PolishProposalDto {
    /// 请求标识(进度事件过滤/取消)。
    pub request_id: String,
    pub model_snapshot: String,
    /// 润色/生成的描述纯文本(前端预览可编辑,采纳走 update_task)。
    pub text: String,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_polish_description(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    note: Option<String>,
    request_id: Option<String>,
) -> Result<PolishProposalDto, AiError> {
    use crate::ai::adapter::FinishReason;
    use crate::ai::polish::{build_polish_request, context_from_parts, validate_polish_text};
    use crate::db::task_repo;

    let note = note.unwrap_or_default();
    if note.chars().count() > 200 {
        return Err(AiError::new(AiErrorCode::Validation, "润色方向过长(最多 200 字)"));
    }

    // ---- 短临界区:准入、上下文、默认模型、单飞 ----
    let (ctx, connection, model, use_stream) = {
        let conn = state.db()?;
        let task = task_repo::get_by_id(&conn, &task_id)?
            .ok_or_else(|| AiError::new(AiErrorCode::Validation, "任务不存在"))?;
        let deleted: Option<Option<String>> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                rusqlite::params![task_id],
                |row| row.get(0),
            )
            .optional()?;
        if deleted.flatten().is_some() {
            return Err(AiError::new(AiErrorCode::Validation, "任务不存在"));
        }
        if task.is_completed {
            return Err(AiError::new(AiErrorCode::Validation, "任务已完成,不需要润色"));
        }
        if task.is_archived {
            return Err(AiError::new(AiErrorCode::Validation, "任务已归档,请先恢复"));
        }

        let children = task_repo::get_children(&conn, &task_id)?;
        let ctx = context_from_parts(
            &task.title,
            &task.description,
            children
                .iter()
                .map(|c| crate::ai::breakdown::ChildSummary {
                    title: c.title.clone(),
                    is_completed: c.is_completed,
                })
                .collect(),
            &note,
        );

        let default_id = config_repo::get_default_model_id(&conn)?.ok_or_else(|| {
            AiError::new(AiErrorCode::ConfigMissing, "尚未设置默认模型,请先到设置 → AI 模型完成配置")
        })?;
        let model = config_repo::get_model(&conn, &default_id)?.ok_or_else(|| {
            AiError::new(AiErrorCode::ConfigMissing, "默认模型已不存在,请重新选择")
        })?;
        let connection = config_repo::get_connection(&conn, &model.connection_id)?.ok_or_else(|| {
            AiError::new(AiErrorCode::ConfigMissing, "默认模型所属连接已不存在")
        })?;
        if !connection.enabled {
            return Err(AiError::new(AiErrorCode::Validation, "默认模型所属连接已停用"));
        }
        let use_stream = config_repo::latest_verifications(&conn, &model.id)?
            .iter()
            .any(|v| v.kind == "stream" && v.status == "passed");

        // 与拆解共用单飞:同一任务同时只允许一个 AI 生成
        {
            let mut active = state
                .ai_runtime
                .active_breakdowns
                .lock()
                .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
            if active.contains(&task_id) {
                return Err(AiError::new(AiErrorCode::Validation, "该任务正在处理 AI 请求,请稍候"));
            }
            active.insert(task_id.clone());
        }
        (ctx, connection, model, use_stream)
    }; // ---- 数据库锁已释放 ----

    let started = std::time::Instant::now();
    let snapshot = format!("{} ({})", connection.name, model.model_id);
    let outcome = async {
        let api_key = credential_store()
            .get(&connection.id)?
            .filter(|k| !k.trim().is_empty())
            .ok_or_else(|| {
                AiError::new(AiErrorCode::CredentialUnavailable, "该连接尚未配置 API Key")
            })?;
        let request_id = request_id
            .filter(|r| {
                !r.is_empty()
                    && r.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            })
            .unwrap_or_else(|| format!("polish-{}", uuid::Uuid::new_v4()));
        let request = build_polish_request(&model.model_id, &ctx, use_stream);
        let result = state
            .ai_runtime
            .execute_chat(Some(&app), &request_id, &connection, &api_key, &request)
            .await?;
        if result.finish_reason != FinishReason::Stop {
            return Err(AiError::new(
                AiErrorCode::OutputTruncated,
                "润色内容被截断,未生成可用结果",
            ));
        }
        let text = validate_polish_text(&result.text)?;
        Ok::<PolishProposalDto, AiError>(PolishProposalDto {
            request_id,
            model_snapshot: snapshot.clone(),
            text,
        })
    }
    .await;

    // 单飞解除(所有路径)
    if let Ok(mut active) = state.ai_runtime.active_breakdowns.lock() {
        active.remove(&task_id);
    }

    // 调用摘要
    {
        let conn = state.db()?;
        match &outcome {
            Ok(dto) => {
                crate::ai::diagnostics::record_invocation(
                    &conn,
                    "polish",
                    Some(&model.id),
                    &dto.model_snapshot,
                    "success",
                    None,
                    Some(started.elapsed().as_millis() as i64),
                    None,
                )?;
            }
            Err(e) => {
                let _ = crate::ai::diagnostics::record_invocation(
                    &conn,
                    "polish",
                    Some(&model.id),
                    &snapshot,
                    if e.code == AiErrorCode::Cancelled { "cancelled" } else { "failed" },
                    Some(
                        &serde_json::to_value(&e.code)
                            .unwrap_or_default()
                            .to_string()
                            .trim_matches('"')
                            .to_string(),
                    ),
                    Some(started.elapsed().as_millis() as i64),
                    None,
                );
            }
        }
    }

    outcome
}

// ---------- 日/周回顾 AI 生成 ----------

#[derive(serde::Serialize)]
pub struct ReviewContextStatusDto {
    pub prepared: bool,
    /// 资料是否相对准备时点已有更新
    pub sources_changed: bool,
    pub context_fingerprint: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ReviewProposalDto {
    /// 请求标识(进度事件过滤/取消)
    pub request_id: String,
    pub model_snapshot: String,
    pub sections: crate::models::review::ReviewSections,
    /// 保存时需随快照回传的元数据(前端原样传给 save_review)
    pub event_cutoff_at: String,
    pub prepared_at: String,
    pub prepared_at_local_date: String,
    pub timezone_offset: String,
    pub coverage_note: String,
    pub source_refs: serde_json::Value,
    pub context_fingerprint: String,
}

/// 准备回顾上下文:固定日期/时区/范围/覆盖/统计与来源版本为快照并预览。
/// 不发起模型请求;幂等,同范围重新准备会替换快照。
#[tauri::command(rename_all = "snake_case")]
pub fn ai_prepare_review_context(
    state: State<'_, AppState>,
    period_kind: String,
    start_date: String,
    tag_ids: Option<Vec<String>>,
    note: Option<String>,
) -> Result<crate::ai::review::PreparedReviewContext, AiError> {
    use crate::ai::review::{self};

    let note = note.unwrap_or_default();
    if note.chars().count() > review::MAX_USER_NOTE_CHARS {
        return Err(AiError::new(
            AiErrorCode::Validation,
            format!("回顾重点至多 {} 字", review::MAX_USER_NOTE_CHARS),
        ));
    }

    let conn = state.db()?;
    let scope = crate::db::review_repo::compute_scope(&period_kind, &start_date, &tag_ids.unwrap_or_default())?;
    let facts = crate::db::review_repo::get_review_facts(&conn, &scope)?;
    let ctx = review::build_context(&conn, &scope, &facts, &note)?;
    let scope_key = ctx.scope_key.clone();
    let mut contexts = state
        .ai_runtime
        .review_contexts
        .lock()
        .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
    contexts.insert(scope_key, ctx.clone());
    Ok(ctx)
}

/// 查询准备状态:是否已准备、资料是否相对准备时点已有更新。
#[tauri::command(rename_all = "snake_case")]
pub fn ai_get_review_context_status(
    state: State<'_, AppState>,
    period_kind: String,
    start_date: String,
    tag_ids: Option<Vec<String>>,
) -> Result<ReviewContextStatusDto, AiError> {
    let scope = crate::db::review_repo::compute_scope(&period_kind, &start_date, &tag_ids.unwrap_or_default())?;
    let stored = {
        let contexts = state
            .ai_runtime
            .review_contexts
            .lock()
            .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
        contexts.get(&scope.scope_key).cloned()
    };
    let Some(stored) = stored else {
        return Ok(ReviewContextStatusDto {
            prepared: false,
            sources_changed: false,
            context_fingerprint: None,
        });
    };
    let current = {
        let conn = state.db()?;
        let facts = crate::db::review_repo::get_review_facts(&conn, &scope)?;
        crate::ai::review::build_context(&conn, &scope, &facts, &stored.user_note)?
    };
    Ok(ReviewContextStatusDto {
        prepared: true,
        sources_changed: current.context_fingerprint != stored.context_fingerprint,
        context_fingerprint: Some(stored.context_fingerprint),
    })
}

/// 生成回顾:使用已准备的快照;同一范围同时至多一个请求;取消/失败不写库。
#[tauri::command(rename_all = "snake_case")]
pub async fn ai_generate_review(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    period_kind: String,
    start_date: String,
    tag_ids: Option<Vec<String>>,
    request_id: Option<String>,
) -> Result<ReviewProposalDto, AiError> {
    use crate::ai::adapter::FinishReason;
    use crate::ai::review::{self};

    let scope =
        crate::db::review_repo::compute_scope(&period_kind, &start_date, &tag_ids.unwrap_or_default())?;

    // ---- 短临界区:快照、默认模型、单飞 ----
    let (ctx, connection, model, use_stream) = {
        let conn = state.db()?;
        let contexts = state
            .ai_runtime
            .review_contexts
            .lock()
            .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
        let ctx = contexts.get(&scope.scope_key).cloned().ok_or_else(|| {
            AiError::new(AiErrorCode::Validation, "请先准备资料,再生成回顾")
        })?;
        drop(contexts);

        let default_id = config_repo::get_default_model_id(&conn)?.ok_or_else(|| {
            AiError::new(AiErrorCode::ConfigMissing, "尚未设置默认模型,请先到设置 → AI 模型完成配置")
        })?;
        let model = config_repo::get_model(&conn, &default_id)?
            .ok_or_else(|| AiError::new(AiErrorCode::ConfigMissing, "默认模型已不存在,请重新选择"))?;
        let connection = config_repo::get_connection(&conn, &model.connection_id)?.ok_or_else(|| {
            AiError::new(AiErrorCode::ConfigMissing, "默认模型所属连接已不存在")
        })?;
        if !connection.enabled {
            return Err(AiError::new(AiErrorCode::Validation, "默认模型所属连接已停用"));
        }
        let use_stream = config_repo::latest_verifications(&conn, &model.id)?
            .iter()
            .any(|v| v.kind == "stream" && v.status == "passed");

        {
            let mut active = state
                .ai_runtime
                .active_review_scopes
                .lock()
                .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
            if active.contains(&scope.scope_key) {
                return Err(AiError::new(AiErrorCode::Validation, "该回顾范围正在生成,请稍候"));
            }
            active.insert(scope.scope_key.clone());
        }
        (ctx, connection, model, use_stream)
    }; // ---- 数据库锁已释放 ----

    let started = std::time::Instant::now();
    let snapshot = format!("{} ({})", connection.name, model.model_id);
    let scope_key = ctx.scope_key.clone();
    let outcome = async {
        let api_key = credential_store()
            .get(&connection.id)?
            .filter(|k| !k.trim().is_empty())
            .ok_or_else(|| {
                AiError::new(AiErrorCode::CredentialUnavailable, "该连接尚未配置 API Key")
            })?;
        let request_id = request_id
            .filter(|r| {
                !r.is_empty()
                    && r.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            })
            .unwrap_or_else(|| format!("review-{}", uuid::Uuid::new_v4()));

        // 空材料不发送空请求(手写回顾仍可用)
        if ctx.groups.is_empty() && ctx.records.is_empty() {
            return Err(AiError::new(
                AiErrorCode::Validation,
                "该范围内没有任何任务事实或进展记录,未发送模型请求;可直接手写回顾",
            ));
        }

        let request = review::build_review_request(&model.model_id, &ctx, use_stream);
        review::check_request_size(&request)?;
        let result = state
            .ai_runtime
            .execute_chat(Some(&app), &request_id, &connection, &api_key, &request)
            .await?;
        if result.finish_reason != FinishReason::Stop {
            return Err(AiError::new(
                AiErrorCode::OutputTruncated,
                "回顾内容被截断,未生成可保存稿",
            ));
        }
        let sections = review::parse_and_validate(&result.text, &review::valid_ref_set(&ctx))?;

        let dto = ReviewProposalDto {
            request_id,
            model_snapshot: snapshot.clone(),
            sections,
            event_cutoff_at: ctx.event_cutoff_at.clone(),
            prepared_at: ctx.prepared_at.clone(),
            prepared_at_local_date: ctx.prepared_at_local_date.clone(),
            timezone_offset: ctx.timezone_offset.clone(),
            coverage_note: ctx.coverage_note.clone(),
            source_refs: review::source_refs_json(&ctx),
            context_fingerprint: ctx.context_fingerprint.clone(),
        };

        let proposal = crate::ai::review::StoredReviewProposal {
            scope_key: scope_key.clone(),
            context_fingerprint: ctx.context_fingerprint.clone(),
            model_snapshot: snapshot.clone(),
            created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            sections: dto.sections.clone(),
        };
        let mut proposals = state
            .ai_runtime
            .review_proposals
            .lock()
            .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
        proposals.insert(scope_key.clone(), proposal);

        Ok::<ReviewProposalDto, AiError>(dto)
    }
    .await;

    // 单飞解除(所有路径)
    if let Ok(mut active) = state.ai_runtime.active_review_scopes.lock() {
        active.remove(&scope_key);
    }

    // 调用摘要
    {
        let conn = state.db()?;
        match &outcome {
            Ok(dto) => {
                crate::ai::diagnostics::record_invocation(
                    &conn,
                    "review",
                    Some(&model.id),
                    &dto.model_snapshot,
                    "success",
                    None,
                    Some(started.elapsed().as_millis() as i64),
                    None,
                )?;
            }
            Err(e) => {
                let _ = crate::ai::diagnostics::record_invocation(
                    &conn,
                    "review",
                    Some(&model.id),
                    &snapshot,
                    if e.code == AiErrorCode::Cancelled { "cancelled" } else { "failed" },
                    Some(
                        &serde_json::to_value(&e.code)
                            .unwrap_or_default()
                            .to_string()
                            .trim_matches('"')
                            .to_string(),
                    ),
                    Some(started.elapsed().as_millis() as i64),
                    None,
                );
            }
        }
    }

    outcome
}
