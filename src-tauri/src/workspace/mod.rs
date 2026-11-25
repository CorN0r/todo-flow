//! 工作区:同一时间只激活一个的独立数据空间(一个数据库文件 + 附件目录)。
//!
//! 清单见 [`registry`],文件校验与复制见 [`files`],新建/添加/删除见 [`store`]。
//! 本模块负责启动时的解析——读清单、打开激活工作区、不可用时回退——以及
//! "切换 = 更新清单 + 重启"所需的重启标记。`tauri dev` 下让开发会话活过重启的进程交接
//! 见 [`dev_handover`](仅 Windows)。

pub mod files;
pub mod registry;
pub mod store;
#[cfg(target_os = "windows")]
pub mod dev_handover;

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use rusqlite::Connection;

use crate::db;
use crate::error::AppError;
use registry::{Registry, WorkspaceEntry};

/// 重启标记:切换工作区时写入,新实例据此等待旧实例退出
pub const RESTART_MARKER_FILE: &str = "restart.pending";
/// 新实例等待旧实例退出的上限;超过后按普通的第二实例处理
pub const RESTART_WAIT_LIMIT: Duration = Duration::from_secs(15);
const WAIT_POLL_INTERVAL: Duration = Duration::from_millis(100);

pub struct StartupWorkspace {
    pub registry: Registry,
    pub conn: Connection,
    pub db_path: PathBuf,
    pub data_dir: PathBuf,
    /// 启动过程中需要告知用户的事(例如激活工作区打不开而回退)
    pub notice: Option<String>,
}

pub fn restart_marker_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(RESTART_MARKER_FILE)
}

pub fn set_restart_marker(app_data_dir: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(app_data_dir)?;
    std::fs::write(restart_marker_path(app_data_dir), b"restart")?;
    Ok(())
}

pub fn restart_pending(app_data_dir: &Path) -> bool {
    restart_marker_path(app_data_dir).is_file()
}

pub fn clear_restart_marker(app_data_dir: &Path) {
    let _ = std::fs::remove_file(restart_marker_path(app_data_dir));
}

/// 因切换而重启时,等待上一个实例退出。`still_running` 报告单实例锁是否仍被
/// 占用。返回 true 表示可以继续启动;false 表示等到上限仍在占用。
/// 没有重启标记(普通启动或二次启动)时不等待。
pub fn wait_for_previous_instance(
    app_data_dir: &Path,
    limit: Duration,
    mut still_running: impl FnMut() -> bool,
) -> bool {
    if !restart_pending(app_data_dir) {
        return true;
    }
    let start = Instant::now();
    while still_running() {
        if start.elapsed() >= limit {
            return false;
        }
        std::thread::sleep(WAIT_POLL_INTERVAL);
    }
    true
}

fn recency(entry: &WorkspaceEntry) -> String {
    entry
        .last_activated_at
        .clone()
        .unwrap_or_else(|| entry.created_at.clone())
}

/// 打开一个工作区的数据库并升级到当前结构。`allow_create` 为 false 时,
/// 数据库文件缺失视为不可用——不会新建一个空库冒充原工作区。
fn open_workspace(
    app_data_dir: &Path,
    entry: &WorkspaceEntry,
    allow_create: bool,
) -> Result<Connection, AppError> {
    let data_dir = registry::data_dir_of(app_data_dir, entry);
    let db_path = data_dir.join("todo.db");
    if !db_path.is_file() && !allow_create {
        return Err(AppError::Generic(format!(
            "数据库文件不存在: {}",
            db_path.display()
        )));
    }
    std::fs::create_dir_all(&data_dir)?;
    let conn = db::connection::open(&db_path)
        .map_err(|e| AppError::Generic(format!("打开数据库失败: {}", files::sqlite_message(&e))))?;
    db::migrations::run(&conn)
        .map_err(|e| AppError::Generic(format!("升级数据库结构失败: {}", e)))?;
    Ok(conn)
}

/// 待删除的工作区此刻可能还被某个常驻进程(例如跟随激活项的 MCP 服务)开着,
/// 它会在下一次检查时放开。给一小段时间再放弃,免得用户白重启一次。
const PENDING_DELETE_RETRIES: u32 = 5;
const PENDING_DELETE_RETRY_DELAY: Duration = Duration::from_millis(600);

fn is_in_use(err: &AppError) -> bool {
    matches!(err, AppError::Validation(ref message) if message.contains("正在被其他程序使用"))
}

/// 完成上次重启前登记的删除:被删除的若是当时的工作区,其数据库正被那个
/// 进程占用,只能等它退出后由本进程删除。
fn finish_pending_deletes(
    app_data_dir: &Path,
    registry: &mut Registry,
    notices: &mut Vec<String>,
    retries: u32,
    delay: Duration,
) {
    let pending: Vec<WorkspaceEntry> = registry
        .workspaces
        .iter()
        .filter(|w| w.pending_delete)
        .cloned()
        .collect();
    for entry in pending {
        let remaining: Vec<WorkspaceEntry> = registry
            .workspaces
            .iter()
            .filter(|w| w.id != entry.id)
            .cloned()
            .collect();
        let mut attempt = 0;
        let outcome = loop {
            match store::delete_files(app_data_dir, &entry, &remaining) {
                Ok(outcome) => break Ok(outcome),
                Err(e) if is_in_use(&e) && attempt < retries => {
                    attempt += 1;
                    std::thread::sleep(delay);
                }
                Err(e) => break Err(e),
            }
        };
        match outcome {
            Ok(outcome) => {
                registry.remove(&entry.id);
                if let Some(leftover) = outcome.leftover {
                    notices.push(format!("工作区“{}”已删除,但{}", entry.name, leftover));
                }
            }
            Err(e) => {
                // 仍被占用:保留条目,用户稍后可以再试
                if let Some(kept) = registry.get_mut(&entry.id) {
                    kept.pending_delete = false;
                }
                // 提示直接展示给用户:去掉错误类型的英文前缀
                notices.push(e.user_message());
            }
        }
    }
}

/// 启动时解析要打开的工作区。
///
/// 清单不存在时按升级登记处理:现有数据原地成为"默认工作区",不移动文件。
/// 激活的工作区打不开时,按最近使用顺序尝试其他工作区;全部不可用才报错。
pub fn resolve_for_startup(app_data_dir: &Path) -> Result<StartupWorkspace, AppError> {
    resolve_with(app_data_dir, PENDING_DELETE_RETRIES, PENDING_DELETE_RETRY_DELAY)
}

/// 同 `resolve_for_startup`,等待被占用的待删除工作区的次数与间隔可指定(测试用)。
fn resolve_with(
    app_data_dir: &Path,
    retries: u32,
    delay: Duration,
) -> Result<StartupWorkspace, AppError> {
    std::fs::create_dir_all(app_data_dir)?;
    let (mut registry, rebuilt) = registry::load_or_init(app_data_dir)?;
    let mut notices: Vec<String> = Vec::new();
    finish_pending_deletes(app_data_dir, &mut registry, &mut notices, retries, delay);

    let active_id = registry.active_id.clone();
    // 只有全新安装(刚重建且只有默认工作区)才允许在数据库缺失时新建
    let allow_create = rebuilt
        && registry.workspaces.len() == 1
        && registry::is_default(&registry.workspaces[0]);

    let mut candidates: Vec<WorkspaceEntry> = registry.get(&active_id).cloned().into_iter().collect();
    let mut others: Vec<WorkspaceEntry> = registry
        .workspaces
        .iter()
        .filter(|w| w.id != active_id && !w.pending_delete)
        .cloned()
        .collect();
    others.sort_by(|a, b| recency(b).cmp(&recency(a)));
    candidates.extend(others);

    let mut first_failure: Option<(String, AppError)> = None;
    let mut opened: Option<(WorkspaceEntry, Connection)> = None;
    for entry in candidates {
        match open_workspace(app_data_dir, &entry, allow_create && registry::is_default(&entry)) {
            Ok(conn) => {
                opened = Some((entry, conn));
                break;
            }
            Err(e) => {
                if first_failure.is_none() {
                    first_failure = Some((entry.name.clone(), e));
                }
            }
        }
    }
    let (entry, conn) = match opened {
        Some(opened) => opened,
        None => {
            let (name, error) = first_failure
                .unwrap_or_else(|| ("工作区".to_string(), AppError::Generic("没有可用的工作区".to_string())));
            return Err(AppError::Generic(format!(
                "无法打开工作区“{}”: {}",
                name,
                error.user_message()
            )));
        }
    };

    if entry.id != active_id {
        let failed = first_failure
            .map(|(name, _)| name)
            .unwrap_or_else(|| active_id.clone());
        notices.push(format!(
            "工作区“{}”无法打开,已切换到“{}”",
            failed, entry.name
        ));
    }

    let data_dir = registry::data_dir_of(app_data_dir, &entry);
    std::fs::create_dir_all(data_dir.join("attachments"))?;
    registry.set_active(&entry.id);
    registry::save(app_data_dir, &registry)?;

    Ok(StartupWorkspace {
        db_path: data_dir.join("todo.db"),
        data_dir,
        notice: if notices.is_empty() {
            None
        } else {
            Some(notices.join("\n"))
        },
        registry,
        conn,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::task::CreateTaskRequest;

    fn start(dir: &Path) -> StartupWorkspace {
        resolve_for_startup(dir).unwrap()
    }

    fn first_run(dir: &Path) -> StartupWorkspace {
        let started = start(dir);
        assert!(started.notice.is_none(), "{:?}", started.notice);
        started
    }

    /// 登记一个额外的空白工作区并设为激活项
    fn activate_new_workspace(dir: &Path, name: &str) -> WorkspaceEntry {
        let entry = {
            let current = start(dir);
            store::create_blank(dir, name, &current.conn).expect("create blank workspace")
        };
        let (mut registry, _) = registry::load_or_init(dir).unwrap();
        registry.workspaces.push(entry.clone());
        registry.set_active(&entry.id);
        registry::save(dir, &registry).unwrap();
        entry
    }

    #[test]
    fn first_run_registers_default_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        let started = first_run(dir);

        assert_eq!(started.registry.workspaces.len(), 1);
        assert!(registry::is_default(started.registry.active().unwrap()));
        assert_eq!(started.db_path, dir.join("todo.db"));
        assert_eq!(started.data_dir, dir.to_path_buf());
        assert!(started.db_path.is_file());
        assert!(dir.join("attachments").is_dir());

        let (saved, rebuilt) = registry::load_or_init(dir).unwrap();
        assert!(!rebuilt);
        assert_eq!(saved.workspaces.len(), 1);
        assert_eq!(saved.active_id, registry::DEFAULT_WORKSPACE_ID);
    }

    #[test]
    fn upgrade_registers_existing_data_in_place() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        // 升级前的数据目录:数据库和附件都在原位,没有清单
        let legacy_db = dir.join("todo.db");
        let id = {
            let conn = db::connection::open(&legacy_db).unwrap();
            db::migrations::run(&conn).unwrap();
            db::task_repo::create(
                &conn,
                CreateTaskRequest {
                    title: "升级前就有的任务".to_string(),
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
            .unwrap()
            .id
        };
        let attachment = dir.join("attachments").join(&id).join("a.png");
        std::fs::create_dir_all(attachment.parent().unwrap()).unwrap();
        std::fs::write(&attachment, b"png").unwrap();

        let started = first_run(dir);
        assert_eq!(started.db_path, legacy_db);
        assert_eq!(started.registry.workspaces.len(), 1);
        assert_eq!(started.registry.active().unwrap().name, registry::DEFAULT_WORKSPACE_NAME);
        let task = db::task_repo::get_by_id(&started.conn, &id).unwrap().unwrap();
        assert_eq!(task.title, "升级前就有的任务");
        assert_eq!(std::fs::read(&attachment).unwrap(), b"png");
        // 数据没有被复制到别处
        assert!(!dir.join(registry::WORKSPACES_DIR).exists());
    }

    #[test]
    fn missing_active_database_falls_back_without_creating_an_empty_one() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        first_run(dir);
        let work = activate_new_workspace(dir, "工作");
        // 在应用外移走了当前激活工作区的数据库
        std::fs::remove_file(registry::db_path_of(dir, &work)).unwrap();

        let started = start(dir);
        let notice = started.notice.expect("fallback must be announced");
        assert!(notice.contains("工作") && notice.contains(registry::DEFAULT_WORKSPACE_NAME), "{notice}");
        assert!(registry::is_default(started.registry.active().unwrap()));
        assert_eq!(started.registry.active_id, registry::DEFAULT_WORKSPACE_ID);
        // 不会新建一个空库冒充原工作区
        assert!(!registry::db_path_of(dir, &work).exists());
        let (saved, _) = registry::load_or_init(dir).unwrap();
        assert_eq!(saved.active_id, registry::DEFAULT_WORKSPACE_ID);
        assert_eq!(saved.workspaces.len(), 2);
    }

    #[test]
    fn missing_inactive_database_does_not_disturb_the_active_one() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        first_run(dir);
        activate_new_workspace(dir, "工作");
        std::fs::remove_file(dir.join("todo.db")).unwrap();

        let started = start(dir);
        assert!(started.notice.is_none(), "{:?}", started.notice);
        assert_eq!(started.registry.active().unwrap().name, "工作");
        assert!(!dir.join("todo.db").exists());
    }

    #[test]
    fn nothing_available_reports_error_and_changes_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        drop(first_run(dir));
        // 清单完好,但唯一的数据库被移走:既不新建空库,也不改清单
        std::fs::remove_file(dir.join("todo.db")).unwrap();
        let registry_before = std::fs::read(registry::registry_path(dir)).unwrap();

        let err = resolve_for_startup(dir)
            .err()
            .expect("startup must fail when nothing is available");
        assert!(err.to_string().contains("无法打开工作区"), "{err}");
        assert!(!dir.join("todo.db").exists());
        assert_eq!(
            std::fs::read(registry::registry_path(dir)).unwrap(),
            registry_before
        );
    }

    #[test]
    fn pending_delete_is_completed_on_next_start() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        first_run(dir);
        let work = activate_new_workspace(dir, "工作");
        let (mut registry, _) = registry::load_or_init(dir).unwrap();
        registry.get_mut(&work.id).unwrap().pending_delete = true;
        registry.set_active(registry::DEFAULT_WORKSPACE_ID);
        registry::save(dir, &registry).unwrap();

        let started = first_run(dir);
        assert!(started.registry.get(&work.id).is_none());
        assert!(!registry::data_dir_of(dir, &work).exists());
        assert_eq!(started.registry.workspaces.len(), 1);
    }

    #[test]
    fn pending_delete_that_is_still_in_use_keeps_the_entry_and_says_so() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        first_run(dir);
        let work = activate_new_workspace(dir, "工作");
        let (mut registry, _) = registry::load_or_init(dir).unwrap();
        registry.get_mut(&work.id).unwrap().pending_delete = true;
        registry.set_active(registry::DEFAULT_WORKSPACE_ID);
        registry::save(dir, &registry).unwrap();
        // 另一个进程(例如指定了该工作区的 MCP)仍开着它的数据库
        let holder =
            db::connection::open(&registry::db_path_of(dir, &work)).unwrap();

        let started = resolve_with(dir, 0, Duration::ZERO).unwrap();
        let notice = started.notice.expect("failure must be announced");
        assert!(notice.contains("正在被其他程序使用"), "{notice}");
        let kept = started.registry.get(&work.id).expect("entry must be kept");
        assert!(!kept.pending_delete);
        assert!(registry::db_path_of(dir, &work).is_file());
        drop(holder);
    }

    #[test]
    fn pending_delete_waits_briefly_for_a_process_that_releases_the_file() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        first_run(dir);
        let work = activate_new_workspace(dir, "工作");
        let (mut registry, _) = registry::load_or_init(dir).unwrap();
        registry.get_mut(&work.id).unwrap().pending_delete = true;
        registry.set_active(registry::DEFAULT_WORKSPACE_ID);
        registry::save(dir, &registry).unwrap();
        // 一个常驻进程(例如跟随激活项的 MCP 服务)还开着它,但很快会放开
        let path = registry::db_path_of(dir, &work);
        std::thread::spawn(move || {
            let holder = db::connection::open(&path).unwrap();
            std::thread::sleep(Duration::from_millis(900));
            drop(holder);
        });

        let started = resolve_with(dir, 5, Duration::from_millis(600)).unwrap();

        assert!(started.notice.is_none(), "{:?}", started.notice);
        assert!(started.registry.get(&work.id).is_none());
        assert!(!registry::data_dir_of(dir, &work).exists());
    }

    #[test]
    fn restart_marker_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        assert!(!restart_pending(dir));
        set_restart_marker(dir).unwrap();
        assert!(restart_pending(dir));
        clear_restart_marker(dir);
        assert!(!restart_pending(dir));
    }

    #[test]
    fn waits_for_previous_instance_only_when_restarting() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();

        // 没有重启标记:不等待,即使锁被占用
        let polls = std::cell::Cell::new(0);
        let go = wait_for_previous_instance(dir, Duration::from_millis(500), || {
            polls.set(polls.get() + 1);
            true
        });
        assert!(go);
        assert_eq!(polls.get(), 0);

        // 有重启标记:等到旧实例退出为止
        set_restart_marker(dir).unwrap();
        let remaining = std::cell::Cell::new(3);
        let go = wait_for_previous_instance(dir, Duration::from_secs(5), || {
            if remaining.get() == 0 {
                false
            } else {
                remaining.set(remaining.get() - 1);
                true
            }
        });
        assert!(go);
        assert_eq!(remaining.get(), 0);

        // 等到上限旧实例仍未退出:放弃等待
        let go = wait_for_previous_instance(dir, Duration::from_millis(50), || true);
        assert!(!go);
    }
}
