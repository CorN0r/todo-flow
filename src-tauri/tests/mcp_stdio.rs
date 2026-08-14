//! MCP stdio 端到端测试:以子进程方式运行真实的 todoflow-mcp 二进制,
//! 用 rmcp 客户端完成 initialize 握手、tools/list、tools/call 全链路,
//! 验证 `#[tool_router]` 宏生成层与数据库落库。

use rmcp::model::{CallToolRequestParams, ContentBlock};
use rmcp::transport::TokioChildProcess;
use rmcp::ServiceExt;
use serde_json::json;

#[tokio::test]
async fn stdio_handshake_and_create_task() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("todo.db");
    let bin = env!("CARGO_BIN_EXE_todoflow-mcp");

    let mut cmd = tokio::process::Command::new(bin);
    cmd.args(["--db-path", db_path.to_str().unwrap(), "serve"]);
    let client = ()
        .serve(TokioChildProcess::new(cmd).unwrap())
        .await
        .unwrap();

    // tools/list:应包含全部工具
    let tools = client.list_all_tools().await.unwrap();
    let names: Vec<String> = tools.iter().map(|t| t.name.to_string()).collect();
    for expected in [
        "create_task",
        "list_tasks",
        "get_task",
        "update_task",
        "complete_task",
        "reopen_task",
        "delete_task",
        "list_tags",
        "create_tag",
    ] {
        assert!(names.iter().any(|n| n == expected), "missing tool {expected}: {names:?}");
    }

    // tools/call:创建带自动标签的任务
    let result = client
        .call_tool(
            CallToolRequestParams::new("create_task")
                .with_arguments(
                    json!({
                        "title": "Agent 创建的任务",
                        "priority": 3,
                        "due_date": "2026-08-15",
                        "tag_names": ["自动标签"],
                        "my_day": true,
                    })
                    .as_object()
                    .unwrap()
                    .clone(),
                ),
        )
        .await
        .unwrap();
    assert!(!result.is_error.unwrap_or(false), "{result:?}");
    let text = result
        .content
        .iter()
        .find_map(|c| match c {
            ContentBlock::Text(t) => Some(t.text.clone()),
            _ => None,
        })
        .unwrap_or_default();
    let created: serde_json::Value = serde_json::from_str(&text).unwrap();
    let task_id = created["id"].as_str().expect("create_task must return task id");
    assert_eq!(created["title"], "Agent 创建的任务");

    // 再次调用:按标签名列出
    let result = client
        .call_tool(
            CallToolRequestParams::new("list_tasks")
                .with_arguments(
                    json!({ "tag_names": ["自动标签"] })
                        .as_object()
                        .unwrap()
                        .clone(),
                ),
        )
        .await
        .unwrap();
    assert!(!result.is_error.unwrap_or(false), "{result:?}");

    drop(client);

    // 直接打开同一 db 验证落库(任务 + 自动创建的标签 + 关联)
    let conn = todo_flow_lib::db::connection::open(&db_path).unwrap();
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
    let tag_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tags", [], |r| r.get(0))
        .unwrap();
    assert_eq!(tag_count, 1);
    let link_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM task_tags", [], |r| r.get(0))
        .unwrap();
    assert_eq!(link_count, 1);
    let found: String = conn
        .query_row("SELECT id FROM tasks WHERE id = ?1", [task_id], |r| r.get(0))
        .unwrap();
    assert_eq!(found, task_id);
}

#[tokio::test]
async fn stdio_unknown_tool_errors() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("todo.db");
    let bin = env!("CARGO_BIN_EXE_todoflow-mcp");

    let mut cmd = tokio::process::Command::new(bin);
    cmd.args(["--db-path", db_path.to_str().unwrap(), "serve"]);
    let client = ()
        .serve(TokioChildProcess::new(cmd).unwrap())
        .await
        .unwrap();

    let result = client
        .call_tool(CallToolRequestParams::new("no_such_tool"))
        .await;
    assert!(result.is_err(), "unknown tool should fail: {result:?}");

    drop(client);
}
