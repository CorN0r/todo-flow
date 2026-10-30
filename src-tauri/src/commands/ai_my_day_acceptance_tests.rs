//! 真实模型验收(tasks 7.2/7.3):默认 ignored,显式运行
//! `cargo test --lib real_model_acceptance -- --ignored --nocapture`
//!
//! 直接驱动业务层(候选组装 → 真实网关请求 → 本地校验 → 事务采纳 → 读取/清除),
//! 与命令层的差异只在参数装配与诊断记录(命令胶水由单元测试与代码走查覆盖)。
//! 模型配置只读自真实应用数据库(默认 %APPDATA%/com.todoflow.desktop/todo.db,可用
//! TODOFLOW_REAL_DB 覆盖);候选与采纳写入临时库中的虚构任务,不触碰用户任务;
//! API Key 只经 Windows 凭据管理器读取,不出现在任何日志里。

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use rusqlite::Connection;

use crate::ai::adapter::FinishReason;
use crate::ai::config_repo;
use crate::ai::credentials::{CredentialStore, WindowsKeyringStore};
use crate::ai::error::{AiError, AiErrorCode};
use crate::ai::gateway::AiRuntime;
use crate::ai::my_day::{
    build_my_day_request, build_snapshot, parse_and_validate, request_bytes, select_candidate_roots,
    today_local, MyDayActionInput, MyDayCandidate, MyDayPlanOutput, PromptInputs,
    MAX_REQUEST_BYTES,
};
use crate::ai::my_day_apply;
use crate::db::task_repo;
use crate::models::task::{CreateTaskRequest, TaskFilter};

fn day_offset(n: i64) -> String {
    (chrono::Local::now().date_naive() + chrono::Duration::days(n))
        .format("%Y-%m-%d")
        .to_string()
}

fn real_db_path() -> PathBuf {
    if let Ok(p) = std::env::var("TODOFLOW_REAL_DB") {
        return PathBuf::from(p);
    }
    let app_data =
        std::env::var("APPDATA").expect("需要 APPDATA 定位真实数据库(或设置 TODOFLOW_REAL_DB)");
    PathBuf::from(app_data)
        .join("com.todoflow.desktop")
        .join("todo.db")
}

type AiConnRow = (
    String, String, String, String, Option<String>, i64, i64, i64, Option<i64>, String, String,
);
type AiModelRow = (String, String, String, String, String, String);
type AiVerifRow = (String, String, String, String, Option<String>, Option<String>, String);

/// 把真实库中的模型配置(连接/模型/验证记录/默认模型设置)复制进虚构库;
/// 只读真实库,不写回任何内容。
fn copy_model_config(dst: &Connection) {
    let real = Connection::open(real_db_path()).expect("打开真实应用数据库失败");
    let mut conns: Vec<AiConnRow> = Vec::new();
    let mut stmt = real
        .prepare("SELECT id,name,protocol,base_url,preset_id,credential_version,revision,enabled,timeout_secs,created_at,updated_at FROM ai_connections")
        .unwrap();
    for row in stmt
        .query_map([], |r| {
            Ok((
                r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?,
                r.get(7)?, r.get(8)?, r.get(9)?, r.get(10)?,
            ))
        })
        .unwrap()
    {
        conns.push(row.unwrap());
    }
    assert!(
        !conns.is_empty(),
        "真实数据库中没有 AI 连接,请先在应用中配置模型"
    );

    let mut models: Vec<AiModelRow> = Vec::new();
    let mut stmt = real
        .prepare("SELECT id,connection_id,model_id,display_name,created_at,updated_at FROM ai_models")
        .unwrap();
    for row in stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)))
        .unwrap()
    {
        models.push(row.unwrap());
    }

    let mut verifs: Vec<AiVerifRow> = Vec::new();
    if let Ok(mut stmt) = real.prepare(
        "SELECT id,model_entry_id,kind,status,fingerprint,detail,verified_at FROM ai_model_verifications",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?))
        }) {
            for row in rows.flatten() {
                verifs.push(row);
            }
        }
    }

    let default_entry: String = real
        .query_row(
            "SELECT value FROM settings WHERE key = 'ai_default_model'",
            [],
            |r| r.get(0),
        )
        .expect("真实数据库没有设置默认模型");

    for c in &conns {
        dst.execute(
            "INSERT INTO ai_connections (id,name,protocol,base_url,preset_id,credential_version,revision,enabled,timeout_secs,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            rusqlite::params![c.0, c.1, c.2, c.3, c.4, c.5, c.6, c.7, c.8, c.9, c.10],
        )
        .unwrap();
    }
    for m in &models {
        dst.execute(
            "INSERT INTO ai_models (id,connection_id,model_id,display_name,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
            rusqlite::params![m.0, m.1, m.2, m.3, m.4, m.5],
        )
        .unwrap();
    }
    for v in &verifs {
        dst.execute(
            "INSERT INTO ai_model_verifications (id,model_entry_id,kind,status,fingerprint,detail,verified_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![v.0, v.1, v.2, v.3, v.4, v.5, v.6],
        )
        .unwrap();
    }
    dst.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_default_model', ?1)",
        rusqlite::params![default_entry],
    )
    .unwrap();
}

fn make_tag(conn: &Connection, id: &str, name: &str) {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "INSERT INTO tags (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?1, ?2, '#7C72F6', 'tag', 0, ?3, ?3)",
        rusqlite::params![id, name, now],
    )
    .unwrap();
}

fn make_task(
    conn: &Connection,
    title: &str,
    due: Option<&str>,
    priority: i32,
    tag: Option<&str>,
    desc: &str,
) -> String {
    let task = task_repo::create(
        conn,
        CreateTaskRequest {
            title: title.into(),
            description: Some(desc.into()),
            tag_ids: Some(tag.map(|t| vec![t.to_string()]).unwrap_or_default()),
            parent_task_id: None,
            due_date: due.map(String::from),
            priority: Some(priority),
            reminder: None,
            recurrence: None,
            my_day_date: None,
            source: None,
        },
    )
    .unwrap();
    task.id
}

fn make_sub(conn: &Connection, parent: &str, title: &str, desc: &str) -> String {
    let task = task_repo::create(
        conn,
        CreateTaskRequest {
            title: title.into(),
            description: Some(desc.into()),
            tag_ids: None,
            parent_task_id: Some(parent.into()),
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
            my_day_date: None,
            source: None,
        },
    )
    .unwrap();
    task.id
}

/// 准备阶段:范围内可执行根任务 → 分组选择 → 候选快照(与命令层同构)。
fn prepare(conn: &Connection, tag: &str, today: &str) -> (Vec<MyDayCandidate>, i64) {
    let roots = task_repo::get_all(
        conn,
        TaskFilter {
            tag_ids: Some(vec![tag.to_string()]),
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
    )
    .unwrap();
    let selection = select_candidate_roots(&roots, today, &HashSet::new());
    let mut children_map: HashMap<String, Vec<_>> = HashMap::new();
    for (_, t) in &selection.selected {
        children_map.insert(t.id.clone(), task_repo::get_children(conn, &t.id).unwrap());
    }
    let candidates = build_snapshot(&selection.selected, &children_map, today, &HashMap::new());
    let revision = my_day_apply::current_revision(conn, today).unwrap();
    (candidates, revision)
}

/// 生成阶段:真实网关请求 + 本地结构校验(与命令层同构,含 JSON 降级重试)。
#[allow(clippy::too_many_arguments)]
async fn generate(
    runtime: &Arc<AiRuntime>,
    conn: &Connection,
    candidates: &[MyDayCandidate],
    today: &str,
    focus: Option<&str>,
    mandatory: &[String],
    excluded: &[String],
    target_count: usize,
    request_id: &str,
) -> Result<MyDayPlanOutput, AiError> {
    let to_temp = |ids: &[String]| -> Vec<String> {
        ids.iter()
            .filter_map(|id| candidates.iter().find(|c| &c.task_id == id).map(|c| c.temp_ref.clone()))
            .collect()
    };
    let mandatory_refs = to_temp(mandatory);
    let excluded_refs = to_temp(excluded);
    if mandatory.len() != mandatory_refs.len() || excluded.len() != excluded_refs.len() {
        return Err(AiError::new(AiErrorCode::Validation, "必做/排除不在候选范围内"));
    }
    if candidates.is_empty() {
        return Err(AiError::new(AiErrorCode::Validation, "当前范围没有可执行候选,不发送模型请求"));
    }

    let default_id = config_repo::get_default_model_id(conn)?
        .ok_or_else(|| AiError::new(AiErrorCode::ConfigMissing, "尚未设置默认模型"))?;
    let model = config_repo::get_model(conn, &default_id)?
        .ok_or_else(|| AiError::new(AiErrorCode::ConfigMissing, "默认模型已不存在"))?;
    let connection = config_repo::get_connection(conn, &model.connection_id)?
        .ok_or_else(|| AiError::new(AiErrorCode::ConfigMissing, "默认模型所属连接已不存在"))?;
    let use_stream = config_repo::latest_verifications(conn, &model.id)?
        .iter()
        .any(|v| v.kind == "stream" && v.status == "passed");

    let prompt = PromptInputs {
        today,
        candidates,
        focus_note: focus.unwrap_or(""),
        mandatory_refs: &mandatory_refs,
        excluded_refs: &excluded_refs,
        target_count,
    };
    let mut request = build_my_day_request(&model.model_id, &prompt, use_stream);
    if request_bytes(&request) > MAX_REQUEST_BYTES {
        return Err(AiError::new(AiErrorCode::Validation, "候选内容超出请求大小上限"));
    }

    let api_key = WindowsKeyringStore
        .get(&connection.id)?
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| AiError::new(AiErrorCode::CredentialUnavailable, "该连接尚未配置 API Key"))?;

    let result = match runtime
        .execute_chat::<tauri::Wry>(None, request_id, &connection, &api_key, &request)
        .await
    {
        Ok(r) => r,
        Err(e) if e.code == AiErrorCode::InvalidFormat => {
            request.json_mode = false;
            runtime
                .execute_chat::<tauri::Wry>(None, request_id, &connection, &api_key, &request)
                .await?
        }
        Err(e) => return Err(e),
    };
    if result.finish_reason != FinishReason::Stop {
        return Err(AiError::new(AiErrorCode::OutputTruncated, "建议内容被截断"));
    }
    parse_and_validate(
        &result.text,
        candidates,
        &mandatory_refs.into_iter().collect(),
        &excluded_refs.into_iter().collect(),
        target_count,
    )
}

struct SampleCtx<'a> {
    conn: &'a Connection,
    runtime: &'a Arc<AiRuntime>,
    today: String,
    failures: &'a mut Vec<String>,
    log: &'a mut Vec<String>,
}

/// 一次样例:准备 → 真实生成 → 打印建议 → 全量采纳 → 读取计划。
#[allow(clippy::too_many_arguments)]
async fn run_sample(
    ctx: &mut SampleCtx<'_>,
    title: &str,
    tag: &str,
    focus: Option<&str>,
    target: usize,
    expect_actions: Option<usize>,
    seed: impl FnOnce(&Connection),
    mandatory: Vec<String>,
    excluded: Vec<String>,
) -> Vec<crate::ai::my_day::MyDayActionOutput> {
    let SampleCtx { conn, runtime, today, failures, log } = ctx;
    log.push(format!("【验收】=== 样本 {title}(标签 {tag})==="));
    seed(conn);

    let (candidates, revision) = prepare(conn, tag, today);
    log.push(format!("【验收】候选 {} 项(目标 {} 项)", candidates.len(), target));
    assert!(!candidates.is_empty(), "样本 {title} 候选为空");

    let output = generate(
        runtime,
        conn,
        &candidates,
        today,
        focus,
        &mandatory,
        &excluded,
        target,
        &format!("acceptance-{tag}"),
    )
    .await
    .expect("生成失败");

    if !output.assumptions.is_empty() {
        log.push(format!("【验收】假设:{}", output.assumptions.join(" / ")));
    }
    for (i, a) in output.actions.iter().enumerate() {
        let cand = candidates.iter().find(|c| c.temp_ref == a.task_ref).unwrap();
        let sub = a
            .subtask_ref
            .as_ref()
            .map(|r| format!(" → {}", cand.subtasks.iter().find(|s| &s.temp_ref == r).unwrap().title))
            .unwrap_or_default();
        log.push(format!(
            "【验收】行动{}:{}{sub}{}",
            i + 1,
            cand.title,
            if cand.already_in_my_day { "(已加入)" } else { "" }
        ));
        log.push(format!("【验收】   理由:{}", a.reason));
        log.push(format!("【验收】   下一步:{}", a.next_step));
        log.push(format!("【验收】   停止标准:{}", a.stop_at));
    }
    for n in &output.not_selected {
        let cand = candidates.iter().find(|c| c.temp_ref == n.task_ref);
        if let Some(c) = cand {
            log.push(format!("【验收】未选:{} — {}", c.title, n.reason));
        }
    }

    if let Some(expect) = expect_actions {
        if output.actions.len() != expect {
            failures.push(format!("样本 {title} 行动数 {} ≠ 预期 {expect}", output.actions.len()));
        }
    }
    for m in &mandatory {
        let temp = candidates.iter().find(|c| &c.task_id == m).unwrap().temp_ref.clone();
        if !output.actions.iter().any(|a| a.task_ref == temp) {
            failures.push(format!("样本 {title} 必做任务未被覆盖"));
        }
    }
    for e in &excluded {
        let temp = candidates.iter().find(|c| &c.task_id == e).unwrap().temp_ref.clone();
        if output.actions.iter().any(|a| a.task_ref == temp) {
            failures.push(format!("样本 {title} 出现了排除任务"));
        }
    }

    // 全量采纳:temp 引用解析回真实任务 ID
    let actions: Vec<MyDayActionInput> = output
        .actions
        .iter()
        .map(|a| {
            let cand = candidates.iter().find(|c| c.temp_ref == a.task_ref).unwrap();
            MyDayActionInput {
                root_task_id: cand.task_id.clone(),
                target_subtask_id: a
                    .subtask_ref
                    .as_ref()
                    .map(|r| cand.subtasks.iter().find(|s| &s.temp_ref == r).unwrap().subtask_id.clone()),
                reason: a.reason.clone(),
                next_step: a.next_step.clone(),
                stop_at: a.stop_at.clone(),
            }
        })
        .collect();
    // 构造与命令层一致的内存上下文/建议(仅采纳复核需要)
    let stored_ctx = crate::ai::my_day::StoredMyDayContext {
        context_id: format!("acc-ctx-{tag}"),
        local_date: today.clone(),
        tag_ids: vec![],
        candidates,
        eligible_total: 0,
        created_at: String::new(),
    };
    let stored_proposal = crate::ai::my_day::StoredMyDayProposal {
        proposal_id: format!("acc-prop-{tag}"),
        context_id: stored_ctx.context_id.clone(),
        local_date: today.clone(),
        model_snapshot: String::new(),
        created_at: String::new(),
        focus_text: focus.unwrap_or("").to_string(),
        output: output.clone(),
    };
    let result = my_day_apply::apply_my_day_actions(
        conn,
        today,
        &stored_ctx,
        &stored_proposal,
        &format!("acceptance-op-{tag}"),
        &actions,
        revision,
    )
    .expect("采纳失败");
    log.push(format!(
        "【验收】采纳成功:新增 {} 项,已在今日 {} 项,计划版本 {}",
        result.added_task_ids.len(),
        actions.len() - result.added_task_ids.len(),
        result.revision
    ));

    let plan = my_day_apply::get_my_day_plan(conn, today)
        .unwrap()
        .expect("采纳后读取计划为空");
    let bad: Vec<String> = plan
        .actions
        .iter()
        .filter(|a| !a.can_start)
        .map(|a| a.status.clone())
        .collect();
    if !bad.is_empty() {
        failures.push(format!("样本 {title} 采纳后卡片不可开工:{bad:?}"));
    }
    output.actions.clone()
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "真实模型验收:需本机已配置默认模型;cargo test --lib real_model_acceptance -- --ignored --nocapture"]
async fn real_model_acceptance_five_samples() {
    let dir = tempfile::tempdir().expect("创建临时目录失败");
    let db_path = dir.path().join("acceptance.db");
    let conn = Connection::open(&db_path).unwrap();
    crate::db::migrations::run(&conn).unwrap();
    copy_model_config(&conn);
    let today = today_local();
    let default_entry: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'ai_default_model'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let (conn_name, model_id): (String, String) = conn
        .query_row(
            "SELECT c.name, m.model_id FROM ai_models m JOIN ai_connections c ON c.id = m.connection_id WHERE m.id = ?1",
            rusqlite::params![default_entry],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    println!("【验收】模型配置:连接「{conn_name}」模型 {model_id},验收日期 {today}");

    let runtime = Arc::new(AiRuntime::new());
    let mut failures: Vec<String> = Vec::new();
    let mut log: Vec<String> = Vec::new();

    // ---- 样本 A:无日期重要任务 ----
    run_sample(
        &mut SampleCtx { conn: &conn, runtime: &runtime, today: today.clone(), failures: &mut failures, log: &mut log },
        "A 无日期重要任务",
        "acc-a",
        Some("先把下一版功能推进到可以审核"),
        3,
        None,
        |conn| {
            make_tag(conn, "acc-a", "验收A");
            make_task(conn, "设计今日行动建议方案", None, 4, Some("acc-a"),
                "确定范围选择、结果预览和采纳流程,产出可审核的说明");
            make_task(conn, "调整界面配色", None, 1, Some("acc-a"), "美化设置页配色");
            make_task(conn, "提交周报", Some(today.as_str()), 2, Some("acc-a"), "汇总本周进展");
        },
        vec![],
        vec![],
    )
    .await;
    {
        // 无日期重要任务被选入;采纳只写今日归属,不补截止日期
        let plan = my_day_apply::get_my_day_plan(&conn, &today).unwrap().unwrap();
        let mut found_no_due = false;
        for act in &plan.actions {
            let t = task_repo::get_by_id(&conn, &act.root_task_id).unwrap().unwrap();
            if act.root_title.as_deref() == Some("设计今日行动建议方案") {
                found_no_due = true;
                if t.due_date.is_some() {
                    failures.push("样本 A:无日期任务被补了截止日期".into());
                }
                if t.my_day_date.as_deref() != Some(today.as_str()) {
                    failures.push("样本 A:无日期任务未被加入今日".into());
                }
            }
        }
        if !found_no_due {
            failures.push("样本 A:无日期重要任务未被选入".into());
        }
    }

    // ---- 样本 B:全部紧急(超期)----
    let mut ctx = SampleCtx { conn: &conn, runtime: &runtime, today: today.clone(), failures: &mut failures, log: &mut log };
    let overdue_days: Vec<String> = (1..=5i64).map(|i| day_offset(-i)).collect();
    let actions_b = run_sample(
        &mut ctx,
        "B 全部紧急",
        "acc-b",
        None,
        3,
        Some(3),
        |conn| {
            make_tag(conn, "acc-b", "验收B");
            for i in 1..=5i64 {
                make_task(conn, &format!("修复线上问题 {i}"), Some(&day_offset(-i)), 4,
                    Some("acc-b"), "影响用户使用,需要尽快处理");
            }
        },
        vec![],
        vec![],
    )
    .await;
    {
        let _ = overdue_days;
        let (candidates_b, _) = prepare(&conn, "acc-b", &today);
        for a in &actions_b {
            let cand = candidates_b.iter().find(|c| c.temp_ref == a.task_ref).unwrap();
            let t = task_repo::get_by_id(&conn, &cand.task_id).unwrap().unwrap();
            let overdue = t
                .due_date
                .as_deref()
                .map(|d| &d[..10] < today.as_str())
                .unwrap_or(false);
            if !overdue {
                failures.push("样本 B:入选任务不是超期任务".into());
            }
        }
    }

    // ---- 样本 C:多个父子任务 ----
    let mut ctx = SampleCtx { conn: &conn, runtime: &runtime, today: today.clone(), failures: &mut failures, log: &mut log };
    let actions_c = run_sample(
        &mut ctx,
        "C 父子任务",
        "acc-c",
        None,
        2,
        None,
        |conn| {
            make_tag(conn, "acc-c", "验收C");
            let meeting = make_task(conn, "组织团队周会", Some(&day_offset(1)), 2, Some("acc-c"),
                "五个人的小组周会");
            make_sub(conn, &meeting, "准备议程", "收集本周话题并排序");
            make_sub(conn, &meeting, "预订会议室", "确认时间和设备");
            make_sub(conn, &meeting, "发出邀请", "日历邀请与提醒");
            let docs = make_task(conn, "整理项目文档", None, 2, Some("acc-c"), "把散落的文档归档");
            make_sub(conn, &docs, "收集链接", "汇总各处文档入口");
            make_sub(conn, &docs, "写目录", "按主题建立索引");
        },
        vec![],
        vec![],
    )
    .await;
    let with_sub = actions_c.iter().filter(|a| a.subtask_ref.is_some()).count();
    log.push(format!(
        "【验收】样本 C:指向已有子任务的行动卡 {with_sub}/{}",
        actions_c.len()
    ));

    // ---- 样本 D:候选不足(1 个任务,目标 3)----
    let mut ctx = SampleCtx { conn: &conn, runtime: &runtime, today: today.clone(), failures: &mut failures, log: &mut log };
    run_sample(
        &mut ctx,
        "D 候选不足",
        "acc-d",
        None,
        3,
        Some(1),
        |conn| {
            make_tag(conn, "acc-d", "验收D");
            make_task(conn, "唯一可推进的任务", None, 2, Some("acc-d"), "范围里只有这一件事");
        },
        vec![],
        vec![],
    )
    .await;

    // ---- 样本 E:必做与排除 ----
    {
        make_tag(&conn, "acc-e", "验收E");
        let must = make_task(&conn, "必须今天完成的报销", Some(&today), 3, Some("acc-e"), "月底截止");
        let skip = make_task(&conn, "被明确排除的调研", None, 1, Some("acc-e"), "暂不推进");
        make_task(&conn, "整理收件箱", None, 1, Some("acc-e"), "清理邮件");
        make_task(&conn, "准备分享提纲", Some(&day_offset(2)), 2, Some("acc-e"), "团队内部分享");
        let mut ctx = SampleCtx { conn: &conn, runtime: &runtime, today: today.clone(), failures: &mut failures, log: &mut log };
        run_sample(&mut ctx, "E 必做/排除", "acc-e", None, 2, Some(2), |_| {}, vec![must], vec![skip]).await;
    }

    // ---- 错误路径:空范围不发请求 ----
    {
        make_tag(&conn, "acc-none", "验收空");
        let (candidates, _) = prepare(&conn, "acc-none", &today);
        let err = match generate(&runtime, &conn, &candidates, &today, None, &[], &[], 3, "acceptance-empty").await {
            Ok(_) => panic!("空范围应被拒绝"),
            Err(e) => e,
        };
        assert_eq!(err.code, AiErrorCode::Validation);
        log.push("【验收】错误路径:空范围不发请求 ✓".into());
    }

    // ---- 重启恢复:重新打开同一临时库读取当日计划 ----
    {
        let reopened = Connection::open(&db_path).unwrap();
        let plan = my_day_apply::get_my_day_plan(&reopened, &today)
            .unwrap()
            .expect("重启后当日计划丢失");
        let bad: Vec<&_> = plan.actions.iter().filter(|a| !a.can_start).collect();
        if !bad.is_empty() {
            failures.push("重启恢复:存在不可开工卡片".into());
        }
        log.push(format!("【验收】重启恢复:读取到 {} 张行动卡,状态全部可开工", plan.actions.len()));

        let cleared = my_day_apply::clear_my_day_plan(&reopened, &today, plan.revision).unwrap();
        assert!(my_day_apply::get_my_day_plan(&reopened, &today).unwrap().is_none());
        log.push(format!("【验收】清除重点:版本递增至 {cleared},计划不再展示(任务归属保留)"));
    }

    for line in &log {
        println!("{line}");
    }
    assert!(
        failures.is_empty(),
        "真实模型验收存在结构问题:\n{}",
        failures.join("\n")
    );
    println!("【验收】五组样例结构校验全部通过");
}
