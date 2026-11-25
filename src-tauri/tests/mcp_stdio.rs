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
    let client = ().serve(TokioChildProcess::new(cmd).unwrap()).await.unwrap();

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
        assert!(
            names.iter().any(|n| n == expected),
            "missing tool {expected}: {names:?}"
        );
    }

    // tools/call:创建带自动标签的任务
    let result = client
        .call_tool(
            CallToolRequestParams::new("create_task").with_arguments(
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
    let task_id = created["id"]
        .as_str()
        .expect("create_task must return task id");
    assert_eq!(created["title"], "Agent 创建的任务");

    // 再次调用:按标签名列出
    let result = client
        .call_tool(
            CallToolRequestParams::new("list_tasks").with_arguments(
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
        .query_row("SELECT id FROM tasks WHERE id = ?1", [task_id], |r| {
            r.get(0)
        })
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
    let client = ().serve(TokioChildProcess::new(cmd).unwrap()).await.unwrap();

    let result = client
        .call_tool(CallToolRequestParams::new("no_such_tool"))
        .await;
    assert!(result.is_err(), "unknown tool should fail: {result:?}");

    drop(client);
}

// ─── 工作区目标:跟随激活项、--profile 固定、与 --db-path 的关系 ───

use std::path::{Path, PathBuf};
use todo_flow_lib::workspace::{registry, store};

/// 调用一个工具并解析它返回的 JSON
macro_rules! call_tool {
    ($client:expr, $tool:literal, $args:expr) => {{
        let result = $client
            .call_tool(
                CallToolRequestParams::new($tool)
                    .with_arguments($args.as_object().unwrap().clone()),
            )
            .await
            .unwrap();
        assert!(!result.is_error.unwrap_or(false), "{result:?}");
        let text = result.content
            .iter()
            .find_map(|c| match c {
                ContentBlock::Text(t) => Some(t.text.clone()),
                _ => None,
            })
            .unwrap_or_default();
        serde_json::from_str::<serde_json::Value>(&text).unwrap()
    }};
}

/// 一个带"默认工作区 + Work"的数据目录,默认工作区是激活项。
/// 返回 (临时目录, 应用数据目录, Work 的 ID)。二进制通过 %APPDATA% 找到它。
fn app_data_with_work() -> (tempfile::TempDir, PathBuf, String) {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("com.todoflow.desktop");
    let started = todo_flow_lib::workspace::resolve_for_startup(&dir).unwrap();
    let work = store::create_blank(&dir, "Work", &started.conn).unwrap();
    let (mut current, _) = registry::load_or_init(&dir).unwrap();
    current.workspaces.push(work.clone());
    registry::save(&dir, &current).unwrap();
    drop(started);
    (tmp, dir, work.id)
}

fn entry(dir: &Path, id: &str) -> registry::WorkspaceEntry {
    registry::load_or_init(dir).unwrap().0.get(id).unwrap().clone()
}

fn db_of(dir: &Path, id: &str) -> PathBuf {
    registry::db_path_of(dir, &entry(dir, id))
}

fn task_titles(db_path: &Path) -> Vec<String> {
    let conn = todo_flow_lib::db::connection::open(db_path).unwrap();
    let mut stmt = conn
        .prepare("SELECT title FROM tasks ORDER BY title")
        .unwrap();
    let rows = stmt.query_map([], |row| row.get(0)).unwrap();
    rows.flatten().collect()
}

/// 模拟用户在应用里切换工作区
fn activate(dir: &Path, id: &str) {
    let (mut current, _) = registry::load_or_init(dir).unwrap();
    current.set_active(id);
    registry::save(dir, &current).unwrap();
}

#[tokio::test]
async fn follows_the_active_workspace_after_a_switch() {
    let (tmp, dir, work_id) = app_data_with_work();
    let bin = PathBuf::from(env!("CARGO_BIN_EXE_todoflow-mcp"));
    let mut cmd = tokio::process::Command::new(&bin);
    // 不带 --profile:跟随应用当前激活的工作区(这里是默认工作区)
    cmd.arg("serve").env("APPDATA", tmp.path());
    let client = ().serve(TokioChildProcess::new(cmd).unwrap()).await.unwrap();

    call_tool!(client, "create_task", json!({ "title": "默认工作区里的任务" }));
    assert_eq!(task_titles(&db_of(&dir, "default")), vec!["默认工作区里的任务"]);

    // 应用里切换到 Work。这期间 Agent 没有发起任何调用:常驻的 MCP 进程也要
    // 自己跟上,并放开刚才那个工作区的文件,用户随后才能删除它
    activate(&dir, &work_id);
    tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
    let default_entry = entry(&dir, "default");
    let work_entry = entry(&dir, &work_id);
    let outcome = store::delete_files(&dir, &default_entry, &[work_entry]).unwrap();
    assert!(outcome.leftover.is_none());
    assert!(!db_of(&dir, "default").exists());

    // 之后同一个常驻进程写的是新的激活工作区
    call_tool!(client, "create_task", json!({ "title": "Work 里的任务" }));
    assert_eq!(task_titles(&db_of(&dir, &work_id)), vec!["Work 里的任务"]);

    // 读取也跟着切换
    let listed = call_tool!(client, "list_tasks", json!({}));
    assert_eq!(listed["count"], 1);
    assert_eq!(listed["tasks"][0]["title"], "Work 里的任务");

    drop(client);
}

#[tokio::test]
async fn profile_pins_the_workspace_across_switches() {
    let (tmp, dir, work_id) = app_data_with_work();
    let bin = PathBuf::from(env!("CARGO_BIN_EXE_todoflow-mcp"));
    let mut cmd = tokio::process::Command::new(&bin);
    // 名称不区分大小写
    cmd.args(["--profile", "work", "serve"]).env("APPDATA", tmp.path());
    let client = ().serve(TokioChildProcess::new(cmd).unwrap()).await.unwrap();

    call_tool!(client, "create_task", json!({ "title": "第一条" }));
    // 应用里切回默认工作区:固定的目标不变
    activate(&dir, "default");
    call_tool!(client, "create_task", json!({ "title": "第二条" }));

    assert_eq!(task_titles(&db_of(&dir, &work_id)), vec!["第一条", "第二条"]);
    assert!(task_titles(&db_of(&dir, "default")).is_empty());

    drop(client);
}

/// 一次性命令行:目标是调用那一刻的激活工作区
#[test]
fn one_shot_commands_follow_the_active_workspace() {
    let (tmp, dir, work_id) = app_data_with_work();
    let bin = PathBuf::from(env!("CARGO_BIN_EXE_todoflow-mcp"));

    let out = std::process::Command::new(&bin)
        .args(["add", "默认里的任务"])
        .env("APPDATA", tmp.path())
        .output()
        .unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));

    activate(&dir, &work_id);
    let out = std::process::Command::new(&bin)
        .args(["--profile", "Work", "add", "Work 里的任务"])
        .env("APPDATA", tmp.path())
        .output()
        .unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));

    assert_eq!(task_titles(&db_of(&dir, "default")), vec!["默认里的任务"]);
    assert_eq!(task_titles(&db_of(&dir, &work_id)), vec!["Work 里的任务"]);
}

#[test]
fn db_path_and_profile_cannot_be_combined() {
    let (tmp, _, _) = app_data_with_work();
    let bin = PathBuf::from(env!("CARGO_BIN_EXE_todoflow-mcp"));
    let out = std::process::Command::new(&bin)
        .args(["--db-path", "elsewhere.db", "--profile", "Work", "list"])
        .env("APPDATA", tmp.path())
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(!tmp.path().join("elsewhere.db").exists());
}

#[test]
fn unknown_profile_lists_available_names_and_changes_nothing() {
    let (tmp, dir, _) = app_data_with_work();
    let bin = PathBuf::from(env!("CARGO_BIN_EXE_todoflow-mcp"));
    let registry_before = std::fs::read(registry::registry_path(&dir)).unwrap();

    let out = std::process::Command::new(&bin)
        .args(["--profile", "ghost", "list"])
        .env("APPDATA", tmp.path())
        .output()
        .unwrap();
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("ghost") && stderr.contains("Work") && stderr.contains("默认工作区"), "{stderr}");
    assert_eq!(std::fs::read(registry::registry_path(&dir)).unwrap(), registry_before);
}

#[test]
fn without_a_registry_the_default_database_is_used() {
    let tmp = tempfile::tempdir().unwrap();
    let bin = PathBuf::from(env!("CARGO_BIN_EXE_todoflow-mcp"));
    // 旧配置:不带任何参数,数据目录里还没有工作区清单
    let out = std::process::Command::new(&bin)
        .args(["add", "旧配置创建的任务"])
        .env("APPDATA", tmp.path())
        .output()
        .unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));

    let data_dir = tmp.path().join("com.todoflow.desktop");
    assert_eq!(task_titles(&data_dir.join("todo.db")), vec!["旧配置创建的任务"]);
    // 解析目标不会顺手创建清单
    assert!(!registry::registry_path(&data_dir).exists());
}

#[test]
fn explicit_db_path_is_not_registered_as_a_workspace() {
    let (tmp, dir, _) = app_data_with_work();
    let bin = PathBuf::from(env!("CARGO_BIN_EXE_todoflow-mcp"));
    let loose = tmp.path().join("loose.db");
    let registry_before = std::fs::read(registry::registry_path(&dir)).unwrap();

    let out = std::process::Command::new(&bin)
        .args(["--db-path", loose.to_str().unwrap(), "add", "临时文件里的任务"])
        .env("APPDATA", tmp.path())
        .output()
        .unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    assert_eq!(task_titles(&loose), vec!["临时文件里的任务"]);
    assert_eq!(std::fs::read(registry::registry_path(&dir)).unwrap(), registry_before);
}
