//! MCP(Model Context Protocol)本地接口 + CLI 工具。
//!
//! 让 Claude Desktop / Claude Code / Cursor 等大模型 Agent 直接创建、查询、
//! 更新 TodoFlow 任务。通过 stdio transport 与 Agent 客户端通信,
//! 数据库本地直连(与 GUI 共用同一 SQLite 文件,WAL 保证并发安全)。
//!
//! 读写哪个工作区见 [`target`]:默认跟随应用当前激活的工作区,
//! `--profile <名称>` 固定到指定工作区,`--db-path` 指定任意文件。

pub mod cli;
mod handlers;
pub mod target;

pub use cli::Cli;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock};
use rmcp::{schemars, tool, tool_router, transport::stdio, ErrorData as McpError, ServiceExt};
use serde::Deserialize;

use crate::db;
use crate::error::AppError;
use target::Target;

/// MCP 工具统一返回类型。业务错误返回 `Ok(CallToolResult::error(..))`(LLM 可见),
/// 仅锁/序列化等协议级错误返回 `Err(McpError)`。
pub type ToolResult = Result<CallToolResult, McpError>;

fn ok_json(value: &serde_json::Value) -> ToolResult {
    Ok(CallToolResult::success(vec![ContentBlock::text(
        serde_json::to_string_pretty(value).unwrap_or_default(),
    )]))
}

fn err_tool(msg: impl Into<String>) -> ToolResult {
    Ok(CallToolResult::error(vec![ContentBlock::text(msg.into())]))
}

/// 当前连接及其对应的数据库文件
struct OpenConnection {
    path: PathBuf,
    conn: rusqlite::Connection,
}

#[derive(Default)]
struct ServerInner {
    open: Option<OpenConnection>,
}

fn lock(server: &TodoFlowServer) -> Result<std::sync::MutexGuard<'_, ServerInner>, McpError> {
    server
        .inner
        .lock()
        .map_err(|e| McpError::internal_error(format!("数据库锁失败: {e}"), None))
}

/// 取出此刻目标工作区的连接。跟随激活项时每次调用都重新解析:目标变了就关闭
/// 旧连接(释放它对原工作区文件的占用)再打开新的。
fn connection<'a>(
    inner: &'a mut ServerInner,
    target: &Target,
    app_data_dir: Option<&Path>,
) -> Result<&'a rusqlite::Connection, McpError> {
    let path = target
        .db_path(app_data_dir)
        .map_err(|e| McpError::invalid_params(e.to_string(), None))?;
    if inner.open.as_ref().is_none_or(|open| open.path != path) {
        inner.open = None;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| McpError::internal_error(format!("创建数据目录失败: {e}"), None))?;
        }
        let conn = db::connection::open(&path).map_err(|e| {
            McpError::internal_error(
                format!(
                    "打开数据库失败: {}",
                    crate::workspace::files::sqlite_message(&e)
                ),
                None,
            )
        })?;
        db::migrations::run(&conn)
            .map_err(|e| McpError::internal_error(format!("升级数据库结构失败: {e}"), None))?;
        inner.open = Some(OpenConnection { path, conn });
    }
    Ok(&inner.open.as_ref().expect("connection just opened").conn)
}

/// 在此刻目标工作区的连接上执行一个工具。业务错误返回给 LLM,协议级错误返回 Err。
fn run_tool(
    server: &TodoFlowServer,
    action: &str,
    work: impl FnOnce(&rusqlite::Connection) -> Result<serde_json::Value, AppError>,
) -> ToolResult {
    let result = {
        let mut inner = lock(server)?;
        match connection(&mut inner, &server.target, server.app_data_dir.as_deref()) {
            Ok(conn) => work(conn),
            Err(e) => Err(AppError::Generic(e.to_string())),
        }
    };
    match result {
        Ok(value) => ok_json(&value),
        Err(e) => err_tool(format!("{action}失败: {e}")),
    }
}

/// MCP 工具处理器:持有目标工作区的连接。
#[derive(Clone)]
pub struct TodoFlowServer {
    target: Target,
    app_data_dir: Option<PathBuf>,
    inner: Arc<Mutex<ServerInner>>,
}

// ─── 工具参数(名称 snake_case,doc 注释 = JSON Schema 描述,中文面向 LLM)───

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTaskParams {
    /// 任务标题(必填,不能为空)
    pub title: String,
    /// 任务详情,支持纯文本或 HTML(TipTap 富文本格式)
    pub description: Option<String>,
    /// 优先级:0=无 1=低 2=中 3=高 4=紧急,默认 0
    pub priority: Option<i32>,
    /// 截止时间,格式 "YYYY-MM-DD"(仅日期)或 "YYYY-MM-DD HH:mm"(含时间),无时区
    pub due_date: Option<String>,
    /// 标签名称列表;不存在的标签会自动创建(使用默认颜色)
    pub tag_names: Option<Vec<String>>,
    /// 标签 ID 列表(与 tag_names 可同时使用,取并集)
    pub tag_ids: Option<Vec<String>>,
    /// 父任务 ID(创建子任务;最多两层嵌套)
    pub parent_task_id: Option<String>,
    /// 是否加入「我的今天」列表
    pub my_day: Option<bool>,
    /// 相对截止时间的提前提醒分钟数(需提供 due_date;如 30 = 截止前 30 分钟)
    pub remind_minutes_before: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTasksParams {
    /// 按完成状态过滤
    pub completed: Option<bool>,
    /// 按标签名过滤(任务命中任一标签即返回;不存在的标签名被忽略,不会创建)
    pub tag_names: Option<Vec<String>>,
    /// 标签 ID 列表(与 tag_names 可同时使用,命中任一即返回)
    pub tag_ids: Option<Vec<String>>,
    /// 按标题/描述模糊搜索关键词
    pub search_keyword: Option<String>,
    /// 截止日期下限 "YYYY-MM-DD"
    pub due_from: Option<String>,
    /// 截止日期上限 "YYYY-MM-DD"
    pub due_to: Option<String>,
    /// 只看某父任务的子任务
    pub parent_task_id: Option<String>,
    /// true 时包含子任务(否则只返回顶层任务)
    pub include_children: Option<bool>,
    /// 返回条数上限(默认全部;count 字段始终为过滤后总数)
    pub limit: Option<i32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetTaskParams {
    /// 任务 ID(create_task 返回的 id 字段)
    pub id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTaskParams {
    /// 任务 ID
    pub id: String,
    /// 新标题
    pub title: Option<String>,
    /// 新详情
    pub description: Option<String>,
    /// 新优先级 0-4
    pub priority: Option<i32>,
    /// 新截止时间;传空字符串 "" 表示清除
    pub due_date: Option<String>,
    /// 标签名列表(与既有标签整体替换);不存在的自动创建
    pub tag_names: Option<Vec<String>>,
    /// 标签 ID 列表(与 tag_names 并集,整体替换既有标签)
    pub tag_ids: Option<Vec<String>>,
    /// 新父任务 ID;传 null 表示移出子任务(清除父级)
    pub parent_task_id: Option<Option<String>>,
    /// true=加入「我的今天」,false=移出
    pub my_day: Option<bool>,
    /// 是否完成
    pub is_completed: Option<bool>,
    /// 是否暂停
    pub is_suspended: Option<bool>,
    /// 是否搁置
    pub is_abandoned: Option<bool>,
    /// 是否置顶
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTagParams {
    /// 标签名称(必填)
    pub name: String,
    /// 颜色,形如 "#7C72F6";缺省自动从调色板选择
    pub color: Option<String>,
    /// 父标签 ID(创建二级标签)
    pub parent_tag_id: Option<String>,
}

// ─── 工具实现 ───

#[tool_router(server_handler)]
impl TodoFlowServer {
    /// 创建一个新任务(创建任务的入口工具)
    #[tool(
        description = "创建一个新任务。标签名不存在时自动创建;可设置截止时间、优先级、加入「我的今天」、相对截止时间的提醒。"
    )]
    pub fn create_task(&self, Parameters(p): Parameters<CreateTaskParams>) -> ToolResult {
        run_tool(self, "创建任务", |conn| handlers::create_task(conn, &p))
    }

    /// 列出任务(支持多种过滤)
    #[tool(description = "列出任务,可按完成状态、标签、关键词、截止日期范围过滤。")]
    pub fn list_tasks(&self, Parameters(p): Parameters<ListTasksParams>) -> ToolResult {
        run_tool(self, "查询任务", |conn| handlers::list_tasks(conn, &p))
    }

    /// 获取单个任务详情(含子任务)
    #[tool(description = "按 ID 获取任务详情,包含其子任务列表。")]
    pub fn get_task(&self, Parameters(p): Parameters<GetTaskParams>) -> ToolResult {
        run_tool(self, "获取任务", |conn| handlers::get_task(conn, &p))
    }

    /// 更新任务字段
    #[tool(
        description = "更新任务的标题、详情、优先级、截止时间、标签、父任务等字段。标签显式传入时整体替换。"
    )]
    pub fn update_task(&self, Parameters(p): Parameters<UpdateTaskParams>) -> ToolResult {
        run_tool(self, "更新任务", |conn| handlers::update_task(conn, &p))
    }

    /// 完成任务
    #[tool(description = "将任务标记为已完成。")]
    pub fn complete_task(&self, Parameters(p): Parameters<GetTaskParams>) -> ToolResult {
        run_tool(self, "完成任务", |conn| handlers::complete_task(conn, &p))
    }

    /// 重新打开任务
    #[tool(description = "将已完成的任务重新打开为未完成。")]
    pub fn reopen_task(&self, Parameters(p): Parameters<GetTaskParams>) -> ToolResult {
        run_tool(self, "重新打开任务", |conn| handlers::reopen_task(conn, &p))
    }

    /// 删除任务
    #[tool(description = "删除任务(级联删除子任务,不可恢复)。")]
    pub fn delete_task(&self, Parameters(p): Parameters<GetTaskParams>) -> ToolResult {
        run_tool(self, "删除任务", |conn| handlers::delete_task(conn, &p))
    }

    /// 列出所有标签(含颜色与嵌套结构)
    #[tool(description = "列出全部标签,包含颜色、任务数、子标签树。")]
    pub fn list_tags(&self) -> ToolResult {
        run_tool(self, "获取标签", |conn| handlers::list_tags(conn))
    }

    /// 创建标签
    #[tool(description = "创建新标签,可指定颜色与父标签。")]
    pub fn create_tag(&self, Parameters(p): Parameters<CreateTagParams>) -> ToolResult {
        run_tool(self, "创建标签", |conn| handlers::create_tag(conn, &p))
    }
}

impl TodoFlowServer {
    /// 重新确定目标。跟随激活项时,应用里切换了工作区就换到新的连接,
    /// 同时释放对原工作区文件的占用。
    fn refresh(&self) -> Result<(), McpError> {
        let mut inner = lock(self)?;
        connection(&mut inner, &self.target, self.app_data_dir.as_deref()).map(|_| ())
    }
}

/// 跟随激活项时检查目标是否变化的间隔
const FOLLOW_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(1000);

/// 启动 MCP stdio 服务。独立进程打开自己的连接,WAL 模式保证与 GUI 并发读写安全;
/// 不固定目标时每次工具调用都重新确定要读写的工作区。
pub async fn serve(target: Target, app_data_dir: Option<PathBuf>) -> Result<(), AppError> {
    let handler = TodoFlowServer {
        target,
        app_data_dir,
        inner: Arc::new(Mutex::new(ServerInner::default())),
    };
    {
        // 启动时就打开一次:目标有问题立即报错,而不是拖到第一次调用
        let mut inner = handler
            .inner
            .lock()
            .map_err(|e| AppError::Lock(e.to_string()))?;
        connection(&mut inner, &handler.target, handler.app_data_dir.as_deref())
            .map_err(|e| AppError::Generic(format!("MCP 打开工作区失败: {}", e)))?;
    }
    if matches!(handler.target, Target::Follow) {
        // 应用里切换工作区后及时跟进,而不是等到下一次工具调用:
        // 这样原工作区的文件很快就被放开,用户随后就能删除它。
        let watcher = handler.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(FOLLOW_POLL_INTERVAL);
            loop {
                tick.tick().await;
                let _ = watcher.refresh();
            }
        });
    }
    let service = handler
        .serve(stdio())
        .await
        .map_err(|e| AppError::Generic(format!("MCP serve 失败: {}", e)))?;
    service
        .waiting()
        .await
        .map_err(|e| AppError::Generic(format!("MCP 服务退出: {}", e)))?;
    Ok(())
}
