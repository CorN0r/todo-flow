//! 6.2 真实调用验收(一次性,手动执行):
//! cargo test --test ai_acceptance -- --ignored --nocapture
//!
//! 走应用真实代码路径:打开真实数据库、读真实系统凭证、经网关真实调用智谱、
//! 用真实事务采纳,并验证幂等/冲突/同步记录。虚构任务保留在任务列表中供人工查看,
//! 标题带【AI验收】前缀,可随时删除(采纳回执与调用摘要保留作为证据)。

use todo_flow_lib::ai::adapter::{ChatRequest, FinishReason};
use todo_flow_lib::ai::apply::{apply_breakdown_items, ApplyResult};
use todo_flow_lib::ai::breakdown::{
    build_breakdown_request, context_fingerprint, html_to_text, parse_and_validate,
    BreakdownContext, StoredProposal,
};
use todo_flow_lib::ai::config_repo;
use todo_flow_lib::ai::credentials::{CredentialStore, WindowsKeyringStore};
use todo_flow_lib::ai::diagnostics;
use todo_flow_lib::ai::error::AiError;
use todo_flow_lib::ai::gateway::AiRuntime;
use todo_flow_lib::db::{connection as db_connection, sync_repo, task_repo};
use todo_flow_lib::models::task::CreateTaskRequest;

fn step(name: &str) {
    println!("== {}", name);
}

#[tokio::test]
#[ignore = "真实端到端验收:写真实库、读真实凭证、调用真实服务;手动执行"]
async fn real_end_to_end_breakdown_and_apply() {
    // ---- 定位真实数据库与应用配置 ----
    step("打开真实数据库");
    let data_dir = todo_flow_lib::default_data_dir().expect("无法定位数据目录");
    let conn = db_connection::open(&data_dir.join("todo.db")).expect("打开真实数据库失败");

    step("读取默认模型与连接");
    let default_id = config_repo::get_default_model_id(&conn)
        .unwrap()
        .expect("尚未设置默认模型");
    let model = config_repo::get_model(&conn, &default_id).unwrap().expect("默认模型不存在");
    let connection =
        config_repo::get_connection(&conn, &model.connection_id).unwrap().expect("连接不存在");
    println!("   连接: {} | 模型: {} | 地址: {}", connection.name, model.model_id, connection.base_url);

    step("从系统凭证管理器读取凭证");
    let api_key = WindowsKeyringStore
        .get(&connection.id)
        .unwrap()
        .filter(|k| !k.trim().is_empty())
        .expect("凭证缺失");
    println!("   凭证存在(长度 {}),不回显内容", api_key.len());

    // ---- 场景11/12/10:创建虚构顶层任务(描述含 HTML 与内嵌图片,验证只发送文本) ----
    step("创建虚构验收任务(含内嵌图片描述)");
    let parent = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "【AI验收】整理季度汇报(自动测试,可删除)".into(),
            description: Some(
                "<p>准备一份<b>季度工作汇报</b>,包含进展、数据与下季度计划。</p>\
                 <p><img src=\"data:image/png;base64,AAAAAAAAAAAA\"/></p>"
                    .into(),
            ),
            tag_ids: None,
            parent_task_id: None,
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
            my_day_date: None,
            source: None,
        },
    )
    .unwrap();
    println!("   任务 {} | 描述转文本: {:?}", parent.id, html_to_text(&parent.description));
    assert!(!html_to_text(&parent.description).contains("data:image"), "内嵌图片数据未被剥离");

    // ---- 生成:同命令层逻辑(流式按验证状态选择 + JSON 降级) ----
    step("组装上下文并调用模型(流式)");
    let use_stream = config_repo::latest_verifications(&conn, &model.id)
        .unwrap()
        .iter()
        .any(|v| v.kind == "stream" && v.status == "passed");
    let ctx = BreakdownContext {
        task_title: parent.title.clone(),
        description_text: html_to_text(&parent.description),
        existing_children: vec![],
        user_note: "汇报对象是部门主管,控制在 10 分钟内。".into(),
    };
    let fingerprint = context_fingerprint(&ctx);
    let runtime = AiRuntime::new();
    let request_id = format!("acceptance-{}", uuid::Uuid::new_v4());
    let mut request: ChatRequest = build_breakdown_request(&model.model_id, &ctx, use_stream);

    let started = std::time::Instant::now();
    let (result, json_fallback) = match runtime
        .execute_chat::<tauri::Wry>(None, &request_id, &connection, &api_key, &request)
        .await
    {
        Ok(r) => (r, false),
        Err(e) if e.code == todo_flow_lib::ai::error::AiErrorCode::InvalidFormat => {
            println!("   JSON 模式被拒,降级纯文本重试");
            request.json_mode = false;
            (runtime.execute_chat::<tauri::Wry>(None, &request_id, &connection, &api_key, &request).await.unwrap(), true)
        }
        Err(e) => panic!("模型调用失败: {:?}", e),
    };
    println!(
        "   用时 {}ms | finish={:?} | 流式={} | JSON降级={} | usage={:?}",
        started.elapsed().as_millis(),
        result.finish_reason,
        use_stream,
        json_fallback,
        result.usage
    );
    assert_eq!(result.finish_reason, FinishReason::Stop, "输出未正常完成");

    let output = parse_and_validate(&result.text).expect("结构校验失败");
    println!("   假设 {:?} | 候选 {} 项: {:?}", output.assumptions, output.items.len(),
        output.items.iter().map(|i| i.title.as_str()).collect::<Vec<_>>());

    // ---- 场景13/14:真实事务采纳 ----
    step("事务采纳(前 2 项,模拟用户勾选)");
    let selected: Vec<_> = output.items.iter().take(2).cloned().collect();
    let proposal = StoredProposal {
        proposal_id: format!("acceptance-{}", uuid::Uuid::new_v4()),
        task_id: parent.id.clone(),
        context_fingerprint: fingerprint,
        model_snapshot: format!("{} ({})", connection.name, model.model_id),
        created_at: String::new(),
        output: output.clone(),
    };
    let op = format!("acceptance-op-{}", uuid::Uuid::new_v4());
    let apply_result = apply_breakdown_items(&conn, &parent.id, &proposal, &op, &selected).unwrap();
    let ApplyResult { created_task_ids, already_applied } = &apply_result;
    println!("   创建 {} 个子任务 {:?} | already={}", created_task_ids.len(), created_task_ids, already_applied);
    assert_eq!(created_task_ids.len(), selected.len());

    step("校验子任务来源与内容");
    let children = task_repo::get_children(&conn, &parent.id).unwrap();
    assert_eq!(children.len(), selected.len());
    for (child, item) in children.iter().zip(selected.iter()) {
        assert_eq!(child.source.as_deref(), Some("agent"), "来源未标记 agent");
        assert_eq!(child.title, item.title);
        assert_eq!(child.description, item.instructions);
        assert_eq!(child.due_date, None, "不应设置模型猜测的日期");
    }
    println!("   来源=agent、说明入库、无越权字段:通过");

    step("校验同步记录(若同步启用)");
    let sync_enabled = sync_repo::is_sync_enabled(&conn).unwrap();
    println!("   同步启用: {}", sync_enabled);
    if sync_enabled {
        let mut with_op = 0;
        for id in created_task_ids {
            let has = conn
                .query_row(
                    "SELECT COUNT(*) FROM sync_operations WHERE entity_type='task' AND entity_id=?1 AND operation='create'",
                    rusqlite::params![id],
                    |r| r.get::<_, i64>(0),
                )
                .unwrap();
            with_op += has;
        }
        println!("   生成同步操作记录: {}/{}", with_op, created_task_ids.len());
        assert_eq!(with_op as usize, created_task_ids.len(), "同步记录缺失");
    }

    // ---- 场景16:重复采纳保护 ----
    step("幂等:相同 operation+相同内容重放");
    let replay = apply_breakdown_items(&conn, &parent.id, &proposal, &op, &selected).unwrap();
    assert!(replay.already_applied);
    assert_eq!(replay.created_task_ids, *created_task_ids);
    println!("   返回原结果,未重复添加(children={})", task_repo::get_children(&conn, &parent.id).unwrap().len());

    step("冲突:同批次换 operation 再次采纳");
    let op2 = format!("acceptance-op2-{}", uuid::Uuid::new_v4());
    let err: AiError = apply_breakdown_items(&conn, &parent.id, &proposal, &op2, &selected).unwrap_err();
    assert_eq!(err.code, todo_flow_lib::ai::error::AiErrorCode::ApplyConflict);
    println!("   拦截: {}", err.message);

    // ---- 摘要与证据 ----
    step("写入调用摘要");
    diagnostics::record_invocation(
        &conn,
        "breakdown",
        Some(&model.id),
        &format!("{} ({})", connection.name, model.model_id),
        "success",
        None,
        Some(started.elapsed().as_millis() as i64),
        result.usage.as_ref(),
    )
    .unwrap();

    println!("\n全部通过。验收任务保留在任务列表(标题带【AI验收】,可删除);回执与摘要保留为证据。");
}

/// 6.x 真实冒烟:默认模型对虚构任务做描述润色(只验证生成链路,不写任务描述)。
#[tokio::test]
#[ignore = "真实冒烟:读真实凭证并调用真实服务;手动执行"]
async fn real_polish_smoke() {
    let data_dir = todo_flow_lib::default_data_dir().expect("无法定位数据目录");
    let conn = db_connection::open(&data_dir.join("todo.db")).unwrap();
    let default_id = config_repo::get_default_model_id(&conn).unwrap().expect("未设置默认模型");
    let model = config_repo::get_model(&conn, &default_id).unwrap().unwrap();
    let connection =
        config_repo::get_connection(&conn, &model.connection_id).unwrap().unwrap();
    let api_key = WindowsKeyringStore.get(&connection.id).unwrap().filter(|k| !k.is_empty()).expect("凭证缺失");

    // 虚构任务:空描述 → 生成模式
    let task = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "【AI润色冒烟】给客厅换个灯泡(自动测试)".into(),
            description: None,
            tag_ids: None,
            parent_task_id: None,
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
            my_day_date: None,
            source: None,
        },
    )
    .unwrap();

    let ctx = todo_flow_lib::ai::polish::context_from_parts(
        &task.title,
        &task.description,
        vec![],
        "简洁、面向执行",
    );
    let use_stream = config_repo::latest_verifications(&conn, &model.id)
        .unwrap()
        .iter()
        .any(|v| v.kind == "stream" && v.status == "passed");
    let runtime = AiRuntime::new();
    let request_id = format!("polish-smoke-{}", uuid::Uuid::new_v4());
    let request = todo_flow_lib::ai::polish::build_polish_request(&model.model_id, &ctx, use_stream);

    let started = std::time::Instant::now();
    let result = runtime
        .execute_chat::<tauri::Wry>(None, &request_id, &connection, &api_key, &request)
        .await
        .expect("润色调用失败");
    println!("用时 {}ms | finish={:?} | 流式={}", started.elapsed().as_millis(), result.finish_reason, use_stream);
    assert_eq!(result.finish_reason, FinishReason::Stop);

    let text = todo_flow_lib::ai::polish::validate_polish_text(&result.text).expect("润色结果校验失败");
    println!("生成描述({} 字):\n{}", text.chars().count(), text);

    diagnostics::record_invocation(
        &conn,
        "polish",
        Some(&model.id),
        &format!("{} ({})", connection.name, model.model_id),
        "success",
        None,
        Some(started.elapsed().as_millis() as i64),
        result.usage.as_ref(),
    )
    .unwrap();

    // 冒烟结束即清理,不留任务
    task_repo::delete(&conn, &task.id).unwrap();
    println!("冒烟通过,虚构任务已删除。");
}
