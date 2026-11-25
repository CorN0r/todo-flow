//! todoflow-mcp 二进制的命令行入口分发。
//!
//! 无子命令(或 `serve`)时启动 MCP stdio 服务;其余子命令与 MCP 工具
//! 共享同一套 handlers,输出 pretty JSON。

use std::path::PathBuf;

use clap::{Parser, Subcommand};
use serde_json::Value;

use crate::db;
use crate::error::AppError;

#[derive(Parser)]
#[command(
    name = "todoflow-mcp",
    about = "TodoFlow 本地接口:AI Agent 的 MCP 服务 + 命令行工具",
    version
)]
pub struct Cli {
    /// SQLite 数据库文件路径。与 --profile 互斥
    #[arg(long, global = true, conflicts_with = "profile")]
    pub db_path: Option<PathBuf>,

    /// 工作区名称(不区分大小写)。不指定时跟随应用当前激活的工作区
    #[arg(long, global = true, conflicts_with = "db_path")]
    pub profile: Option<String>,

    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Subcommand)]
pub enum Command {
    /// 启动 MCP stdio 服务(不带子命令时也是默认行为)
    Serve,
    /// 创建任务,如: todoflow-mcp add "写周报" --priority 3 --due "2026-08-14" --tag work
    Add(AddArgs),
    /// 列出任务
    List(ListArgs),
    /// 获取任务详情
    Get { id: String },
    /// 更新任务字段
    Update(UpdateArgs),
    /// 标记完成
    Done { id: String },
    /// 重新打开(已完成 → 未完成)
    Reopen { id: String },
    /// 删除任务
    Delete { id: String },
    /// 列出标签
    Tags,
    /// 创建标签
    CreateTag(CreateTagArgs),
}

#[derive(clap::Args)]
pub struct AddArgs {
    /// 任务标题(位置参数)
    pub title: String,
    /// 任务详情
    #[arg(long)]
    pub description: Option<String>,
    /// 优先级 0-4(0 无 1 低 2 中 3 高 4 紧急)
    #[arg(long)]
    pub priority: Option<i32>,
    /// 截止时间 "YYYY-MM-DD" 或 "YYYY-MM-DD HH:mm"
    #[arg(long)]
    pub due: Option<String>,
    /// 标签名(可多次或逗号分隔)
    #[arg(long, value_delimiter = ',')]
    pub tag: Vec<String>,
    /// 父任务 ID
    #[arg(long)]
    pub parent_id: Option<String>,
    /// 加入「我的今天」
    #[arg(long)]
    pub my_day: bool,
    /// 截止前 N 分钟提醒(需 --due)
    #[arg(long)]
    pub remind_minutes_before: Option<i64>,
}

#[derive(clap::Args)]
pub struct ListArgs {
    /// 只看已完成
    #[arg(long)]
    pub completed: bool,
    /// 按标签名过滤(逗号分隔,命中任一即返回)
    #[arg(long, value_delimiter = ',')]
    pub tag: Vec<String>,
    /// 关键词搜索
    #[arg(long)]
    pub search: Option<String>,
    /// 截止日期下限 "YYYY-MM-DD"
    #[arg(long)]
    pub due_from: Option<String>,
    /// 截止日期上限 "YYYY-MM-DD"
    #[arg(long)]
    pub due_to: Option<String>,
    /// 包含子任务(否则只返回顶层任务)
    #[arg(long)]
    pub include_children: bool,
    /// 返回条数上限
    #[arg(long)]
    pub limit: Option<i32>,
}

#[derive(clap::Args)]
pub struct UpdateArgs {
    /// 任务 ID
    pub id: String,
    /// 新标题
    #[arg(long)]
    pub title: Option<String>,
    /// 新详情
    #[arg(long)]
    pub description: Option<String>,
    /// 新优先级 0-4
    #[arg(long)]
    pub priority: Option<i32>,
    /// 新截止时间;传空字符串 "" 表示清除
    #[arg(long)]
    pub due: Option<String>,
    /// 标签名(整体替换;不存在的自动创建)
    #[arg(long, value_delimiter = ',')]
    pub tag: Vec<String>,
    /// 加入/移出「我的今天」
    #[arg(long)]
    pub my_day: Option<bool>,
    /// true=完成,false=未完成
    #[arg(long)]
    pub done: Option<bool>,
}

#[derive(clap::Args)]
pub struct CreateTagArgs {
    /// 标签名称
    pub name: String,
    /// 颜色,形如 "#7C72F6";缺省自动选择
    #[arg(long)]
    pub color: Option<String>,
    /// 父标签 ID(创建二级标签)
    #[arg(long)]
    pub parent_tag_id: Option<String>,
}

/// 确定读写目标:`--db-path` > `--profile <名称>` > 跟随当前激活的工作区
/// (没有工作区清单时为现有默认路径)。
pub fn resolve_target(cli: &Cli) -> Result<super::target::Target, AppError> {
    super::target::resolve_target(
        cli.db_path.as_deref(),
        cli.profile.as_deref(),
        crate::default_data_dir().as_deref(),
    )
}

fn open_conn(db_path: &std::path::Path) -> Result<rusqlite::Connection, AppError> {
    let conn = db::connection::open(db_path)?;
    db::migrations::run(&conn)?;
    Ok(conn)
}

/// 执行 CLI;非 serve 子命令返回要打印的 JSON。
pub fn run(cli: Cli) -> Result<Option<Value>, AppError> {
    let target = resolve_target(&cli)?;
    // 一次性子命令只读写此刻解析出的目标;父目录不存在时创建
    let db_path = target.db_path(crate::default_data_dir().as_deref())?;
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    match cli.command {
        None | Some(Command::Serve) => {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()?;
            rt.block_on(crate::mcp::serve(target, crate::default_data_dir()))?;
            Ok(None)
        }
        Some(Command::Add(a)) => {
            let conn = open_conn(&db_path)?;
            super::handlers::create_task(
                &conn,
                &super::CreateTaskParams {
                    title: a.title,
                    description: a.description,
                    priority: a.priority,
                    due_date: a.due,
                    tag_names: if a.tag.is_empty() { None } else { Some(a.tag) },
                    tag_ids: None,
                    parent_task_id: a.parent_id,
                    my_day: if a.my_day { Some(true) } else { None },
                    remind_minutes_before: a.remind_minutes_before,
                },
            )
            .map(Some)
        }
        Some(Command::List(a)) => {
            let conn = open_conn(&db_path)?;
            super::handlers::list_tasks(
                &conn,
                &super::ListTasksParams {
                    completed: if a.completed { Some(true) } else { None },
                    tag_names: if a.tag.is_empty() { None } else { Some(a.tag) },
                    tag_ids: None,
                    search_keyword: a.search,
                    due_from: a.due_from,
                    due_to: a.due_to,
                    parent_task_id: None,
                    include_children: if a.include_children { Some(true) } else { None },
                    limit: a.limit,
                },
            )
            .map(Some)
        }
        Some(Command::Get { id }) => {
            let conn = open_conn(&db_path)?;
            super::handlers::get_task(&conn, &super::GetTaskParams { id }).map(Some)
        }
        Some(Command::Done { id }) => {
            let conn = open_conn(&db_path)?;
            super::handlers::complete_task(&conn, &super::GetTaskParams { id }).map(Some)
        }
        Some(Command::Reopen { id }) => {
            let conn = open_conn(&db_path)?;
            super::handlers::reopen_task(&conn, &super::GetTaskParams { id }).map(Some)
        }
        Some(Command::Delete { id }) => {
            let conn = open_conn(&db_path)?;
            super::handlers::delete_task(&conn, &super::GetTaskParams { id }).map(Some)
        }
        Some(Command::Tags) => {
            let conn = open_conn(&db_path)?;
            super::handlers::list_tags(&conn).map(Some)
        }
        Some(Command::CreateTag(c)) => {
            let conn = open_conn(&db_path)?;
            super::handlers::create_tag(
                &conn,
                &super::CreateTagParams {
                    name: c.name,
                    color: c.color,
                    parent_tag_id: c.parent_tag_id,
                },
            )
            .map(Some)
        }
        Some(Command::Update(u)) => {
            let conn = open_conn(&db_path)?;
            super::handlers::update_task(
                &conn,
                &super::UpdateTaskParams {
                    id: u.id,
                    title: u.title,
                    description: u.description,
                    priority: u.priority,
                    due_date: u.due,
                    tag_names: if u.tag.is_empty() { None } else { Some(u.tag) },
                    tag_ids: None,
                    parent_task_id: None,
                    my_day: u.my_day,
                    is_completed: u.done,
                    is_suspended: None,
                    is_abandoned: None,
                    is_pinned: None,
                },
            )
            .map(Some)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cli_with_db(db_path: PathBuf, command: Command) -> Cli {
        Cli {
            db_path: Some(db_path),
            profile: None,
            command: Some(command),
        }
    }

    #[test]
    fn test_cli_add_list_done() {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("todo.db");

        let v = run(cli_with_db(
            db_path.clone(),
            Command::Add(AddArgs {
                title: "CLI 任务".to_string(),
                description: None,
                priority: Some(3),
                due: Some("2026-08-14".to_string()),
                tag: vec!["工作".to_string()],
                parent_id: None,
                my_day: true,
                remind_minutes_before: None,
            }),
        ))
        .unwrap()
        .unwrap();
        assert_eq!(v["title"], "CLI 任务");
        assert_eq!(v["priority"], 3);
        let id = v["id"].as_str().unwrap().to_string();

        // list 按标签过滤
        let list = run(cli_with_db(
            db_path.clone(),
            Command::List(ListArgs {
                completed: false,
                tag: vec!["工作".to_string()],
                search: None,
                due_from: None,
                due_to: None,
                include_children: false,
                limit: None,
            }),
        ))
        .unwrap()
        .unwrap();
        assert_eq!(list["count"], 1);
        assert_eq!(list["tasks"][0]["id"].as_str().unwrap(), id);

        // done
        let done = run(cli_with_db(
            db_path.clone(),
            Command::Done { id: id.clone() },
        ))
        .unwrap()
        .unwrap();
        assert_eq!(done["is_completed"], true);

        // tags(自动创建的标签)
        let tags = run(cli_with_db(db_path.clone(), Command::Tags))
            .unwrap()
            .unwrap();
        assert_eq!(tags.as_array().unwrap().len(), 1);
        assert_eq!(tags[0]["name"], "工作");

        // delete
        let del = run(cli_with_db(db_path, Command::Delete { id }))
            .unwrap()
            .unwrap();
        assert_eq!(del["deleted"], true);
    }

    #[test]
    fn test_cli_get_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("todo.db");
        let result = run(cli_with_db(db_path, Command::Get { id: "nope".into() }));
        assert!(result.is_err());
    }

    #[test]
    fn test_cli_create_tag() {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("todo.db");
        let v = run(cli_with_db(
            db_path,
            Command::CreateTag(CreateTagArgs {
                name: "读书".to_string(),
                color: Some("#10B981".to_string()),
                parent_tag_id: None,
            }),
        ))
        .unwrap()
        .unwrap();
        assert_eq!(v["name"], "读书");
        assert_eq!(v["color"], "#10B981");
    }
}
