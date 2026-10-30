use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::ai::config_repo;
use crate::ai::credentials::{CredentialStore, WindowsKeyringStore};
use crate::ai::error::{AiError, AiErrorCode};
use crate::ai::my_day::{
    self, build_my_day_request, build_snapshot, parse_and_validate, request_bytes,
    select_candidate_roots, today_local, MyDayCandidate, MyDayPlanOutput, PromptInputs,
    StoredMyDayContext, StoredMyDayProposal, DEFAULT_TARGET_COUNT, MAX_FOCUS_NOTE_CHARS,
    MAX_REQUEST_BYTES, MAX_TARGET_COUNT, MIN_TARGET_COUNT,
};
use crate::ai::my_day_apply;
use crate::db::task_repo;
use crate::models::task::TaskFilter;
use crate::AppState;

fn credential_store() -> &'static dyn CredentialStore {
    &WindowsKeyringStore
}

// ---------- 准备候选(纯本机,不调用模型) ----------

#[derive(Debug, Deserialize)]
pub struct MyDaySubtaskPick {
    pub task_id: String,
    pub subtask_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct OmittedCandidateDto {
    pub task_id: String,
    pub title: String,
    pub due_date: Option<String>,
    pub priority: i32,
    pub is_pinned: bool,
    pub already_in_my_day: bool,
}

#[derive(Serialize)]
pub struct MyDayContextDto {
    pub context_id: String,
    pub local_date: String,
    pub candidates: Vec<MyDayCandidate>,
    /// 合格但受数量上限未带入的根任务,供界面手动补入。
    pub omitted_candidates: Vec<OmittedCandidateDto>,
    pub eligible_total: usize,
    pub used_count: usize,
    pub omitted_count: usize,
    /// 当前本机计划版本;采纳时作为期望版本回传。
    pub current_revision: i64,
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_prepare_my_day_context(
    state: State<'_, AppState>,
    tag_ids: Option<Vec<String>>,
    manual_task_ids: Option<Vec<String>>,
    subtask_picks: Option<Vec<MyDaySubtaskPick>>,
) -> Result<MyDayContextDto, AiError> {
    let today = today_local();
    let tag_ids = tag_ids.unwrap_or_default();
    let manual_ids = manual_task_ids.unwrap_or_default();
    let picks_input = subtask_picks.unwrap_or_default();

    let conn = state.db()?;

    // 顺带按日期清理过期本机结果;失败不阻塞准备
    let _ = my_day_apply::cleanup_old_plans(&conn, &today);

    // 范围内可执行根任务:状态过滤交给查询,标签即范围
    let roots = task_repo::get_all(
        &conn,
        TaskFilter {
            tag_ids: if tag_ids.is_empty() { None } else { Some(tag_ids.clone()) },
            is_completed: Some(false),
            due_date_from: None,
            due_date_to: None,
            search_query: None,
            parent_task_id: None,
            my_day_date: None,
            priority: None,
            is_suspended: Some(false),
            is_abandoned: Some(false),
            include_children: Some(false),
            include_archived: None,
        },
    )?;
    let scope_ids: HashSet<String> = roots.iter().map(|t| t.id.clone()).collect();

    // 手动补入不得绕过状态与范围检查
    for id in &manual_ids {
        if !scope_ids.contains(id) {
            return Err(AiError::new(
                AiErrorCode::Validation,
                "手动补入的任务不在当前范围或不可执行,请先调整范围或任务状态",
            ));
        }
    }
    let manual_set: HashSet<String> = manual_ids.iter().cloned().collect();

    let selection = select_candidate_roots(&roots, &today, &manual_set);
    let selected_ids: HashSet<String> = selection.selected.iter().map(|(_, t)| t.id.clone()).collect();

    let mut children_by_root: HashMap<String, Vec<crate::models::task::Task>> = HashMap::new();
    for (_, t) in &selection.selected {
        children_by_root.insert(t.id.clone(), task_repo::get_children(&conn, &t.id)?);
    }

    // 子任务替换选择:必须是所选根任务的可执行子任务
    let mut subtask_picks: HashMap<String, Vec<String>> = HashMap::new();
    for pick in &picks_input {
        if !selected_ids.contains(&pick.task_id) {
            return Err(AiError::new(
                AiErrorCode::Validation,
                "子任务选择对应的任务不在本次候选中",
            ));
        }
        let children = children_by_root.get(&pick.task_id).cloned().unwrap_or_default();
        for sid in &pick.subtask_ids {
            let valid = children
                .iter()
                .any(|c| &c.id == sid && my_day::is_executable(c));
            if !valid {
                return Err(AiError::new(
                    AiErrorCode::Validation,
                    "所选子任务不存在或不可执行",
                ));
            }
        }
        subtask_picks.insert(pick.task_id.clone(), pick.subtask_ids.clone());
    }

    let candidates = build_snapshot(&selection.selected, &children_by_root, &today, &subtask_picks);
    let used_count = candidates.len();
    let context_id = uuid::Uuid::new_v4().to_string();
    let stored = StoredMyDayContext {
        context_id: context_id.clone(),
        local_date: today.clone(),
        tag_ids,
        candidates: candidates.clone(),
        eligible_total: selection.eligible_total,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    {
        let mut contexts = state
            .ai_runtime
            .my_day_contexts
            .lock()
            .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
        // 同一日期只保留最新候选;旧 context 不能再用于生成
        contexts.retain(|_, c| c.local_date != today);
        contexts.insert(context_id.clone(), stored);
    }
    {
        // 旧候选上的建议一并作废:重新准备后不能采纳基于旧快照的预览(锁顺序:先 contexts 后 proposals,与采纳侧一致)
        let mut proposals = state
            .ai_runtime
            .my_day_proposals
            .lock()
            .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
        proposals.retain(|_, p| p.local_date != today);
    }

    let omitted_candidates = selection
        .omitted
        .iter()
        .map(|t| OmittedCandidateDto {
            task_id: t.id.clone(),
            title: t.title.clone(),
            due_date: t.due_date.clone(),
            priority: t.priority,
            is_pinned: t.is_pinned,
            already_in_my_day: t.my_day_date.as_deref() == Some(today.as_str()),
        })
        .collect();
    let current_revision = my_day_apply::current_revision(&conn, &today)?;
    Ok(MyDayContextDto {
        context_id,
        local_date: today,
        candidates,
        omitted_candidates,
        eligible_total: selection.eligible_total,
        used_count,
        omitted_count: selection.eligible_total.saturating_sub(used_count),
        current_revision,
    })
}

// ---------- 生成建议 ----------

#[derive(Serialize)]
pub struct MyDayPlanActionDto {
    pub root_task_id: String,
    pub root_title: String,
    pub target_subtask_id: Option<String>,
    pub subtask_title: Option<String>,
    pub already_in_my_day: bool,
    pub reason: String,
    pub next_step: String,
    pub stop_at: String,
}

#[derive(Serialize)]
pub struct MyDayNotSelectedDto {
    pub task_id: String,
    pub title: String,
    pub reason: String,
}

#[derive(Serialize)]
pub struct MyDayPlanProposalDto {
    pub proposal_id: String,
    pub request_id: String,
    pub model_snapshot: String,
    pub local_date: String,
    pub assumptions: Vec<String>,
    pub actions: Vec<MyDayPlanActionDto>,
    pub not_selected: Vec<MyDayNotSelectedDto>,
}

fn resolve_action(dto_out: &MyDayPlanOutput, candidates: &[MyDayCandidate]) -> Result<Vec<MyDayPlanActionDto>, AiError> {
    let mut out = Vec::with_capacity(dto_out.actions.len());
    for a in &dto_out.actions {
        let cand = candidates
            .iter()
            .find(|c| c.temp_ref == a.task_ref)
            .ok_or_else(|| AiError::new(AiErrorCode::InvalidFormat, "建议引用了候选之外的任务"))?;
        let (sub_id, sub_title) = match &a.subtask_ref {
            Some(sub_ref) => {
                let s = cand
                    .subtasks
                    .iter()
                    .find(|s| &s.temp_ref == sub_ref)
                    .ok_or_else(|| AiError::new(AiErrorCode::InvalidFormat, "子任务引用无效"))?;
                (Some(s.subtask_id.clone()), Some(s.title.clone()))
            }
            None => (None, None),
        };
        out.push(MyDayPlanActionDto {
            root_task_id: cand.task_id.clone(),
            root_title: cand.title.clone(),
            target_subtask_id: sub_id,
            subtask_title: sub_title,
            already_in_my_day: cand.already_in_my_day,
            reason: a.reason.clone(),
            next_step: a.next_step.clone(),
            stop_at: a.stop_at.clone(),
        });
    }
    Ok(out)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "snake_case")]
pub async fn ai_generate_my_day_plan<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
    context_id: String,
    focus_note: Option<String>,
    mandatory_task_ids: Option<Vec<String>>,
    excluded_task_ids: Option<Vec<String>>,
    target_count: Option<usize>,
    request_id: Option<String>,
) -> Result<MyDayPlanProposalDto, AiError> {
    let focus_note = focus_note.unwrap_or_default();
    if focus_note.chars().count() > MAX_FOCUS_NOTE_CHARS {
        return Err(AiError::new(AiErrorCode::Validation, "今日重点过长(最多 300 字)"));
    }
    let target_count = target_count.unwrap_or(DEFAULT_TARGET_COUNT);
    if !(MIN_TARGET_COUNT..=MAX_TARGET_COUNT).contains(&target_count) {
        return Err(AiError::new(AiErrorCode::Validation, "推荐数量范围为 1–5 项"));
    }

    // ---- 候选快照(内存)+ 约束复核(不依赖前端) ----
    let context = {
        let contexts = state
            .ai_runtime
            .my_day_contexts
            .lock()
            .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
        contexts.get(&context_id).cloned().ok_or_else(|| {
            AiError::new(AiErrorCode::ApplyConflict, "候选已过期(应用已重启或已重新准备),请重新准备")
        })?
    };
    let today = today_local();
    if context.local_date != today {
        return Err(AiError::new(AiErrorCode::ContextChanged, "已跨到新的日期,请重新准备今天的候选"));
    }

    let mut mandatory_refs: Vec<String> = Vec::new();
    for id in mandatory_task_ids.unwrap_or_default() {
        let Some(cand) = context.candidates.iter().find(|c| c.task_id == id) else {
            return Err(AiError::new(AiErrorCode::Validation, "必做任务不在本次候选范围内"));
        };
        mandatory_refs.push(cand.temp_ref.clone());
    }
    let mut excluded_refs: Vec<String> = Vec::new();
    for id in excluded_task_ids.unwrap_or_default() {
        let Some(cand) = context.candidates.iter().find(|c| c.task_id == id) else {
            return Err(AiError::new(AiErrorCode::Validation, "排除任务不在本次候选范围内"));
        };
        if mandatory_refs.contains(&cand.temp_ref) {
            return Err(AiError::new(AiErrorCode::Validation, "同一任务不能同时设为必做和排除"));
        }
        excluded_refs.push(cand.temp_ref.clone());
    }
    if mandatory_refs.len() > target_count {
        return Err(AiError::new(AiErrorCode::Validation, "必做数量超过推荐数量,请先调整"));
    }
    if context.candidates.is_empty() {
        return Err(AiError::new(AiErrorCode::Validation, "当前范围没有可执行候选,不发送模型请求"));
    }
    let mandatory_set: HashSet<String> = mandatory_refs.iter().cloned().collect();
    let excluded_set: HashSet<String> = excluded_refs.iter().cloned().collect();

    // ---- 短临界区:默认模型快照 + 按日期登记单飞 ----
    let (connection, model, use_stream) = {
        let conn = state.db()?;
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

        let mut active = state
            .ai_runtime
            .active_my_day_dates
            .lock()
            .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
        if active.contains(&today) {
            return Err(AiError::new(AiErrorCode::Validation, "今天已有一次建议生成在进行中,请稍候"));
        }
        active.insert(today.clone());
        (connection, model, use_stream)
    }; // ---- 数据库锁已释放 ----

    let prompt = PromptInputs {
        today: &today,
        candidates: &context.candidates,
        focus_note: &focus_note,
        mandatory_refs: &mandatory_refs,
        excluded_refs: &excluded_refs,
        target_count,
    };
    let mut request = build_my_day_request(&model.model_id, &prompt, use_stream);
    if request_bytes(&request) > MAX_REQUEST_BYTES {
        if let Ok(mut active) = state.ai_runtime.active_my_day_dates.lock() {
            active.remove(&today);
        }
        return Err(AiError::new(
            AiErrorCode::Validation,
            "候选内容超出请求大小上限,请缩小范围(如按标签筛选)后重试",
        ));
    }

    let started = std::time::Instant::now();
    let runtime = state.ai_runtime.clone();
    let snapshot = format!("{} ({})", connection.name, model.model_id);
    let outcome = async {
        use crate::ai::adapter::FinishReason;

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
            .unwrap_or_else(|| format!("myday-{}", uuid::Uuid::new_v4()));

        // JSON 模式被拒(400 类)→ 降级纯文本重试一次(与拆解一致)
        let result = match runtime
            .execute_chat(Some(&app), &request_id, &connection, &api_key, &request)
            .await
        {
            Ok(r) => r,
            Err(e) if e.code == AiErrorCode::InvalidFormat => {
                request.json_mode = false;
                runtime
                    .execute_chat(Some(&app), &request_id, &connection, &api_key, &request)
                    .await?
            }
            Err(e) => return Err(e),
        };

        if result.finish_reason != FinishReason::Stop {
            return Err(AiError::new(
                AiErrorCode::OutputTruncated,
                "建议内容被截断,未产生可采纳的候选",
            ));
        }
        let output =
            match parse_and_validate(&result.text, &context.candidates, &mandatory_set, &excluded_set, target_count) {
                Ok(o) => o,
                Err(e) => return Err(e),
            };

        let proposal_id = uuid::Uuid::new_v4().to_string();
        let stored = StoredMyDayProposal {
            proposal_id: proposal_id.clone(),
            context_id: context.context_id.clone(),
            local_date: today.clone(),
            model_snapshot: snapshot.clone(),
            created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            focus_text: focus_note.trim().to_string(),
            output: output.clone(),
        };
        {
            let mut proposals = runtime
                .my_day_proposals
                .lock()
                .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
            // 同一日期只保留最新建议;旧建议不能再采纳
            proposals.retain(|_, p| p.local_date != today);
            proposals.insert(proposal_id.clone(), stored);
        }

        Ok((proposal_id, request_id, output, result.usage))
    }
    .await;

    // 单飞解除(所有路径)
    if let Ok(mut active) = state.ai_runtime.active_my_day_dates.lock() {
        active.remove(&today);
    }

    // 调用摘要(成功/失败/取消)
    let (proposal_id, request_id, output, _usage) = match outcome {
        Ok(v) => {
            if let Ok(conn) = state.db() {
                let _ = crate::ai::diagnostics::record_invocation(
                    &conn,
                    "my_day_plan",
                    Some(&model.id),
                    &snapshot,
                    "success",
                    None,
                    Some(started.elapsed().as_millis() as i64),
                    v.3.as_ref(),
                );
            }
            v
        }
        Err(e) => {
            if let Ok(conn) = state.db() {
                let _ = crate::ai::diagnostics::record_invocation(
                    &conn,
                    "my_day_plan",
                    Some(&model.id),
                    &snapshot,
                    if e.code == AiErrorCode::Cancelled { "cancelled" } else { "failed" },
                    Some(serde_json::to_value(e.code).unwrap_or_default().to_string().trim_matches('"')),
                    Some(started.elapsed().as_millis() as i64),
                    None,
                );
            }
            return Err(e);
        }
    };

    let actions = resolve_action(&output, &context.candidates)?;
    let not_selected = output
        .not_selected
        .iter()
        .map(|n| {
            let cand = context
                .candidates
                .iter()
                .find(|c| c.temp_ref == n.task_ref);
            MyDayNotSelectedDto {
                task_id: cand.map(|c| c.task_id.clone()).unwrap_or_default(),
                title: cand.map(|c| c.title.clone()).unwrap_or_default(),
                reason: n.reason.clone(),
            }
        })
        .collect();

    Ok(MyDayPlanProposalDto {
        proposal_id,
        request_id,
        model_snapshot: snapshot,
        local_date: today,
        assumptions: output.assumptions,
        actions,
        not_selected,
    })
}

// ---------- 采纳 / 读取 / 清除 ----------

#[tauri::command(rename_all = "snake_case")]
pub async fn ai_apply_my_day_plan<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
    proposal_id: String,
    operation_id: String,
    actions: Vec<my_day::MyDayActionInput>,
    expected_revision: i64,
) -> Result<my_day_apply::ApplyMyDayResult, AiError> {
    if operation_id.trim().is_empty() {
        return Err(AiError::new(AiErrorCode::Validation, "操作标识不能为空"));
    }
    // 锁顺序与准备侧一致:先 contexts 后 proposals
    let (proposal, context) = {
        let contexts = state
            .ai_runtime
            .my_day_contexts
            .lock()
            .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
        let proposal = {
            let proposals = state
                .ai_runtime
                .my_day_proposals
                .lock()
                .map_err(|_| AiError::new(AiErrorCode::Internal, "内部状态锁失败"))?;
            proposals.get(&proposal_id).cloned().ok_or_else(|| {
                AiError::new(
                    AiErrorCode::ApplyConflict,
                    "预览已过期(应用已重启或已被新结果替换),请重新生成",
                )
            })?
        };
        let context = contexts.get(&proposal.context_id).cloned().ok_or_else(|| {
            AiError::new(AiErrorCode::ApplyConflict, "候选快照已过期,请重新准备后再生成")
        })?;
        (proposal, context)
    };

    let today = today_local();
    let result = {
        let conn = state.db()?;
        my_day_apply::apply_my_day_actions(
            &conn,
            &today,
            &context,
            &proposal,
            operation_id.trim(),
            &actions,
            expected_revision,
        )
    };

    match &result {
        Ok(r) if r.already_applied || !r.added_task_ids.is_empty() => {
            // 成功(含幂等命中):候选批次结束
            if let Ok(mut proposals) = state.ai_runtime.my_day_proposals.lock() {
                proposals.remove(&proposal_id);
            }
        }
        _ => {
            // context_changed 等失败保留预览供重新决策
        }
    }
    if matches!(&result, Ok(r) if !r.already_applied) {
        let _ = app.emit("task-changed", ());
    }
    result
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_get_my_day_plan(
    state: State<'_, AppState>,
    date: String,
) -> Result<Option<my_day_apply::MyDayPlanView>, AiError> {
    let conn = state.db()?;
    my_day_apply::get_my_day_plan(&conn, &date)
}

#[tauri::command(rename_all = "snake_case")]
pub fn ai_clear_my_day_plan(
    state: State<'_, AppState>,
    date: String,
    expected_revision: i64,
) -> Result<i64, AiError> {
    let conn = state.db()?;
    my_day_apply::clear_my_day_plan(&conn, &date, expected_revision)
}
