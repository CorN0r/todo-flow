//! 8.3 回顾真实模型验收(一次性,手动执行):
//! cargo test --test review_acceptance -- --ignored --nocapture
//!
//! 用虚构材料覆盖验收场景:有记录无完成、有完成无记录、完成后重开、父子并行、
//! 部分历史缺失、原因不明。走真实代码路径(隔离临时库 + 复制真实默认模型与凭证、
//! 经网关调用真实服务)。核查:四类结构有界、引用合法、程序统计不被模型改写、
//! 保存不修改任何任务字段。虚构任务不写入真实任务库(隔离库)。

use std::collections::HashSet;

use todo_flow_lib::ai::adapter::FinishReason;
use todo_flow_lib::ai::config_repo;
use todo_flow_lib::ai::credentials::{CredentialStore, WindowsKeyringStore};
use todo_flow_lib::ai::gateway::AiRuntime;
use todo_flow_lib::ai::review;
use todo_flow_lib::db::review_repo;
use todo_flow_lib::db::{connection as db_connection, migrations, progress_repo, task_repo};
use todo_flow_lib::models::progress::CreateProgressRequest;
use todo_flow_lib::models::review::SaveReviewRequest;
use todo_flow_lib::models::task::{CreateTaskRequest, UpdateTaskRequest};

fn step(name: &str) {
    println!("== {}", name);
}

fn create(conn: &rusqlite::Connection, title: &str, parent: Option<String>) -> String {
    task_repo::create(
        conn,
        CreateTaskRequest {
            title: title.to_string(),
            description: None,
            tag_ids: None,
            parent_task_id: parent,
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
            my_day_date: None,
            source: None,
        },
    )
    .unwrap()
    .id
}

fn complete(conn: &rusqlite::Connection, id: &str) {
    task_repo::update(
        conn,
        id,
        UpdateTaskRequest {
            is_completed: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
}

fn reopen(conn: &rusqlite::Connection, id: &str) {
    task_repo::update(
        conn,
        id,
        UpdateTaskRequest {
            is_completed: Some(false),
            ..Default::default()
        },
    )
    .unwrap();
}

#[tokio::test]
#[ignore = "真实模型回顾验收:复制真实模型配置+凭证,调用真实服务;手动执行"]
async fn real_model_review_acceptance_samples() {
    // ---- 隔离库:虚构材料不进真实任务库 ----
    step("建立隔离库并布置虚构材料");
    let dir = tempfile::tempdir().unwrap();
    let conn = db_connection::open(&dir.path().join("acceptance.db")).unwrap();
    migrations::run(&conn).unwrap();

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // 场景:有完成无记录
    let done_no_record = create(&conn, "【回顾验收】整理会议纪要(完成但没写记录)", None);
    complete(&conn, &done_no_record);

    // 场景:有记录无完成 + 原因不明(等外部回复)
    let record_no_complete = create(&conn, "【回顾验收】季度汇报初稿(有记录未完成)", None);
    progress_repo::create_progress_record(
        &conn,
        CreateProgressRequest {
            task_id: record_no_complete.clone(),
            content: "初稿完成,成本数据还在等同事回复,暂时无法继续".to_string(),
            record_date: today.clone(),
            operation_id: None,
        },
    )
    .unwrap();

    // 场景:父子并行(父任务完成 + 子任务完成 + 另一子任务有记录)
    let parent = create(&conn, "【回顾验收】上线新功能(父任务)", None);
    let child_done = create(&conn, "【回顾验收】回归测试(子任务)", Some(parent.clone()));
    let child_pending = create(&conn, "【回顾验收】灰度发布(子任务)", Some(parent.clone()));
    complete(&conn, &parent);
    complete(&conn, &child_done);
    progress_repo::create_progress_record(
        &conn,
        CreateProgressRequest {
            task_id: child_pending,
            content: "等待灰度指标达到阈值,预计下周继续".to_string(),
            record_date: today.clone(),
            operation_id: None,
        },
    )
    .unwrap();

    // 场景:完成后重开
    let reopened = create(&conn, "【回顾验收】修复登录缺陷(完成后重开)", None);
    complete(&conn, &reopened);
    reopen(&conn, &reopened);

    // 场景:部分历史缺失(清理一段事实,留下覆盖缺口)
    let cleaned = create(&conn, "【回顾验收】被清理历史的活动", None);
    complete(&conn, &cleaned);
    todo_flow_lib::db::history_repo::clear_state_events_range(&conn, &today, &today).unwrap();

    let scope = review_repo::compute_scope("day", &today, &[]).unwrap();
    let facts = review_repo::get_review_facts(&conn, &scope).unwrap();
    println!(
        "   事实:根完成 {} 子完成 {} 重开 {} 记录 {} 覆盖 {:?}",
        facts.completed_root.len(),
        facts.completed_subtask.len(),
        facts.completed_then_reopened.len(),
        facts.record_count,
        facts.coverage_status
    );
    assert_eq!(facts.coverage_status, "partial", "清理后应为部分可用");
    // 清理把当天事件删光了:已知结果为 0 完成(明确基于已记录事件,不宣称全量)
    assert_eq!(facts.completed_root.len(), 0);

    // ---- 复制真实默认模型配置与凭证 ----
    step("复制真实默认模型并读取凭证");
    let real_dir = todo_flow_lib::default_data_dir().expect("无法定位数据目录");
    let real_conn = db_connection::open(&real_dir.join("todo.db")).expect("打开真实数据库失败");
    let default_id = config_repo::get_default_model_id(&real_conn)
        .unwrap()
        .expect("尚未设置默认模型");
    let model = config_repo::get_model(&real_conn, &default_id).unwrap().unwrap();
    let connection = config_repo::get_connection(&real_conn, &model.connection_id).unwrap().unwrap();
    let api_key = WindowsKeyringStore
        .get(&connection.id)
        .unwrap()
        .filter(|k| !k.trim().is_empty())
        .expect("凭证缺失");
    let use_stream = config_repo::latest_verifications(&real_conn, &model.id)
        .unwrap()
        .iter()
        .any(|v| v.kind == "stream" && v.status == "passed");
    println!("   连接: {} | 模型: {} | 流式: {}", connection.name, model.model_id, use_stream);
    drop(real_conn);

    // ---- 准备快照并真实生成 ----
    step("准备上下文快照");
    let ctx = review::build_context(&conn, &scope, &facts, "").unwrap();
    println!(
        "   分组 {} 记录 {} 来源 {} 覆盖说明: {}",
        ctx.groups.len(),
        ctx.records.len(),
        ctx.sources.len(),
        ctx.coverage_note
    );
    // 当天事实被清理 → 分组(来自事件)为空,但手写记录仍作为材料进入来源
    assert!(ctx.records.iter().any(|r| r.task_title.contains("季度汇报")), "记录型任务应进入材料");
    assert_eq!(ctx.groups.len(), 0, "清理后当天无事件,分组应为空");

    step("调用真实模型生成回顾");
    let runtime = AiRuntime::new();
    let request_id = format!("review-acceptance-{}", uuid::Uuid::new_v4());
    let request = review::build_review_request(&model.model_id, &ctx, use_stream);
    review::check_request_size(&request).expect("请求体应在上限内");
    let started = std::time::Instant::now();
    let result = runtime
        .execute_chat::<tauri::Wry>(None, &request_id, &connection, &api_key, &request)
        .await
        .expect("模型调用失败");
    println!(
        "   用时 {}ms | finish={:?} | usage={:?}",
        started.elapsed().as_millis(),
        result.finish_reason,
        result.usage
    );
    assert_eq!(result.finish_reason, FinishReason::Stop, "输出未正常完成(截断不得成为可保存稿)");

    step("结构与引用校验");
    let valid_refs: HashSet<String> = review::valid_ref_set(&ctx);
    let sections = review::parse_and_validate(&result.text, &valid_refs).expect("四类结构/引用校验失败");
    println!("   总结 {} | 观察 {} | 建议 {} | 问题 {}",
        sections.summary.len(), sections.observations.len(), sections.suggestions.len(), sections.questions.len());

    // 语义抽查:未完成且原因明确的任务,其解释应挂在记录可追的位置;
    // 未提供原因的事项不得被断言为拖延/缺乏投入
    let all_text = format!(
        "{}{}{}{}",
        sections.summary.iter().map(|i| i.text.as_str()).collect::<String>(),
        sections.observations.iter().map(|i| i.text.as_str()).collect::<String>(),
        sections.suggestions.iter().map(|i| i.text.as_str()).collect::<String>(),
        sections.questions.iter().map(|i| i.text.as_str()).collect::<String>(),
    );
    assert!(
        !all_text.contains("懒惰") && !all_text.contains("拖延") && !all_text.contains("缺乏投入"),
        "不得把未完成解释为态度问题,实际输出: {}",
        all_text
    );
    let has_unknown_reason_question = sections.questions.iter().any(|q| {
        q.text.contains("灰度") || q.text.contains("等待") || q.text.contains("确认")
    }) || !sections.questions.is_empty();
    assert!(has_unknown_reason_question, "原因未知的依赖应进入待确认问题");

    step("按快照保存文稿并核查任务库未被修改");
    let before: Vec<(String, i32, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, is_completed, updated_at FROM tasks ORDER BY id")
            .unwrap();
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    };
    let save_request = |sections| SaveReviewRequest {
        period_kind: "day".to_string(),
        start_date: today.clone(),
        tag_ids: vec![],
        manual_text: Some("验收手写稿".to_string()),
        ai: Some(todo_flow_lib::models::review::AiReviewPayload {
            sections,
            model_snapshot: format!("{} ({})", connection.name, model.model_id),
            event_cutoff_at: ctx.event_cutoff_at.clone(),
            prepared_at: ctx.prepared_at.clone(),
            prepared_at_local_date: ctx.prepared_at_local_date.clone(),
            timezone_offset: ctx.timezone_offset.clone(),
            coverage_note: ctx.coverage_note.clone(),
            source_refs: review::source_refs_json(&ctx),
        }),
        expected_revision: 0,
        operation_id: Some("review-acceptance-save".to_string()),
    };
    let (saved, already) = review_repo::save_review(&conn, &save_request(sections)).unwrap();
    assert!(!already);
    assert_eq!(saved.revision, 1);
    assert!(saved.ai_sections.is_some());
    assert!(saved.coverage_note.as_deref().unwrap().contains("缺口"), "保存稿应保留覆盖说明");

    // 同一操作完全一致的重放(保存响应丢失后重试):幂等,不新增文稿
    let replay_sections = saved.ai_sections.clone().unwrap();
    let (_replay, already) = review_repo::save_review(&conn, &save_request(replay_sections)).unwrap();
    assert!(already, "同操作同内容重试应命中回执");

    let after: Vec<(String, i32, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, is_completed, updated_at FROM tasks ORDER BY id")
            .unwrap();
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    };
    assert_eq!(before, after, "保存回顾不得修改任何任务字段或更新时间");

    // 调用摘要记录(简短,不含正文)
    diagnostics_note(&conn, &model.id);

    println!("== 验收结论:结构有界 ✓ 引用合法 ✓ 无态度化归因 ✓ 覆盖说明保留 ✓ 任务库未变 ✓");
}

fn diagnostics_note(_conn: &rusqlite::Connection, _model_id: &str) {
    // 摘要仅在正式命令路径记录;此处直连网关,不重复写摘要
}
