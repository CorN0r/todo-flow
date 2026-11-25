//! 工作区管理命令:列出、新建、从文件添加、重命名、删除、切换。
//!
//! 这些命令只操作清单和文件,不改动当前打开的连接。切换工作区和删除当前
//! 工作区都通过"更新清单 + 重启"完成——当前工作区的数据库正被本进程占用。

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::workspace::{self, registry, store};
use crate::AppState;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WorkspaceInfo {
    pub id: String,
    pub name: String,
    pub is_active: bool,
    /// "全部任务"页面标题上的数量(顶层任务,不含已归档和已删除的)
    pub task_count: i64,
    pub created_at: String,
    pub last_activated_at: Option<String>,
}

/// 启动过程中需要告知用户的事,例如激活的工作区打不开而回退。读取一次即清空。
#[derive(Default)]
pub struct StartupNotice(pub Mutex<Option<String>>);

fn describe(
    app_data_dir: &Path,
    registry: &registry::Registry,
    entry: &registry::WorkspaceEntry,
) -> WorkspaceInfo {
    WorkspaceInfo {
        id: entry.id.clone(),
        name: entry.name.clone(),
        is_active: entry.id == registry.active_id,
        task_count: store::task_count(app_data_dir, entry),
        created_at: entry.created_at.clone(),
        last_activated_at: entry.last_activated_at.clone(),
    }
}

fn name_taken(name: &str) -> AppError {
    AppError::Validation(format!("已有名为“{}”的工作区", name))
}

fn not_found() -> AppError {
    AppError::NotFound("工作区不存在".to_string())
}

/// 写入重启标记并重启应用;重启后新实例打开清单里的激活项。
fn restart(app: &AppHandle, app_data_dir: &Path) {
    if let Err(e) = workspace::set_restart_marker(app_data_dir) {
        eprintln!("[workspace] 无法写入重启标记: {}", e);
    }
    // `tauri dev` 下由 dev_handover 交接进程,开发会话不中断;其余构建就是 Tauri 的重启
    #[cfg(target_os = "windows")]
    workspace::dev_handover::restart(app);
    #[cfg(not(target_os = "windows"))]
    app.request_restart();
}

/// 把 `id` 设为激活项并重启。清单已保存后才重启,新实例读到的就是新的激活项。
fn activate(
    app: &AppHandle,
    app_data_dir: &Path,
    current: &mut registry::Registry,
    id: &str,
) -> Result<(), AppError> {
    if current.active_id == id {
        return Ok(());
    }
    if current.get(id).is_none_or(|entry| entry.pending_delete) {
        return Err(not_found());
    }
    current.set_active(id);
    registry::save(app_data_dir, current)?;
    restart(app, app_data_dir);
    Ok(())
}

#[tauri::command]
pub fn list_workspaces(state: State<AppState>) -> Result<Vec<WorkspaceInfo>, AppError> {
    let (current, _) = registry::load_or_init(&state.app_data_dir)?;
    Ok(current
        .visible()
        .map(|entry| describe(&state.app_data_dir, &current, entry))
        .collect())
}

/// 新建空白工作区。偏好从当前工作区复制;`switch_after` 为真时建完切换过去。
#[tauri::command(rename_all = "snake_case")]
pub fn create_workspace(
    app: AppHandle,
    state: State<AppState>,
    name: String,
    switch_after: bool,
) -> Result<WorkspaceInfo, AppError> {
    let name = registry::normalize_name(&name)?;
    let (mut current, _) = registry::load_or_init(&state.app_data_dir)?;
    if current.find_by_name(&name).is_some() {
        return Err(name_taken(&name));
    }
    let entry = {
        let conn = state.db()?;
        store::create_blank(&state.app_data_dir, &name, &conn)?
    };
    current.workspaces.push(entry.clone());
    registry::save(&state.app_data_dir, &current)?;
    if switch_after {
        activate(&app, &state.app_data_dir, &mut current, &entry.id)?;
    }
    Ok(describe(&state.app_data_dir, &current, &entry))
}

/// 把一个数据库文件添加为新工作区:复制成副本,原文件不动。
/// `name` 为空时取文件名。`switch_after` 为真时添加后切换过去。
#[tauri::command(rename_all = "snake_case")]
pub fn add_workspace_from_file(
    app: AppHandle,
    state: State<AppState>,
    source: String,
    name: Option<String>,
    switch_after: bool,
) -> Result<WorkspaceInfo, AppError> {
    let source = PathBuf::from(&source);
    let name = match name.as_deref().map(str::trim).filter(|n| !n.is_empty()) {
        Some(name) => registry::normalize_name(name)?,
        None => source
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
            .filter(|stem| !stem.is_empty())
            .unwrap_or_else(|| "工作区".to_string()),
    };
    let (mut current, _) = registry::load_or_init(&state.app_data_dir)?;
    if current.find_by_name(&name).is_some() {
        return Err(name_taken(&name));
    }
    let entry = store::add_from_file(&state.app_data_dir, &source, &name)?;
    current.workspaces.push(entry.clone());
    registry::save(&state.app_data_dir, &current)?;
    if switch_after {
        activate(&app, &state.app_data_dir, &mut current, &entry.id)?;
    }
    Ok(describe(&state.app_data_dir, &current, &entry))
}

#[tauri::command(rename_all = "snake_case")]
pub fn rename_workspace(
    state: State<AppState>,
    id: String,
    name: String,
) -> Result<WorkspaceInfo, AppError> {
    let name = registry::normalize_name(&name)?;
    let (mut current, _) = registry::load_or_init(&state.app_data_dir)?;
    if let Some(other) = current.find_by_name(&name) {
        if other.id != id {
            return Err(name_taken(&name));
        }
    }
    if current.get_mut(&id).is_none() {
        return Err(not_found());
    }
    current.get_mut(&id).expect("checked above").name = name;
    registry::save(&state.app_data_dir, &current)?;
    let entry = current.get(&id).expect("checked above");
    Ok(describe(&state.app_data_dir, &current, entry))
}

/// 切换到另一个工作区:记为激活项后重启应用。
#[tauri::command]
pub fn activate_workspace(app: AppHandle, state: State<AppState>, id: String) -> Result<(), AppError> {
    let (mut current, _) = registry::load_or_init(&state.app_data_dir)?;
    activate(&app, &state.app_data_dir, &mut current, &id)
}

/// 删除工作区。返回未能清理的文件说明(如果有)。
///
/// 删除当前激活的工作区时,它的数据库正被本进程占用,无法原地删除:先登记并
/// 切换激活项,重启后由新进程完成删除;若那时仍被别的程序占用,条目会保留下来
/// 并在启动时提示。
#[tauri::command]
pub fn delete_workspace(
    app: AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<Option<String>, AppError> {
    let app_data_dir = state.app_data_dir.clone();
    let (mut current, _) = registry::load_or_init(&app_data_dir)?;
    let Some(target) = current
        .get(&id)
        .filter(|entry| !entry.pending_delete)
        .cloned()
    else {
        return Err(not_found());
    };
    let remaining: Vec<registry::WorkspaceEntry> = current
        .visible()
        .filter(|entry| entry.id != id)
        .cloned()
        .collect();
    if remaining.is_empty() {
        return Err(AppError::Validation(
            "至少保留一个工作区,不能删除最后一个工作区".to_string(),
        ));
    }

    if target.id == current.active_id {
        let next = current
            .most_recent_other(&id)
            .map(|entry| entry.id.clone())
            .expect("remaining is not empty");
        if let Some(entry) = current.get_mut(&id) {
            entry.pending_delete = true;
        }
        current.set_active(&next);
        registry::save(&app_data_dir, &current)?;
        restart(&app, &app_data_dir);
        return Ok(None);
    }

    let outcome = store::delete_files(&app_data_dir, &target, &remaining)?;
    current.remove(&id);
    registry::save(&app_data_dir, &current)?;
    Ok(outcome.leftover)
}

#[tauri::command]
pub fn get_startup_notice(notice: State<StartupNotice>) -> Result<Option<String>, AppError> {
    let mut notice = notice
        .0
        .lock()
        .map_err(|e| AppError::Lock(e.to_string()))?;
    Ok(notice.take())
}
