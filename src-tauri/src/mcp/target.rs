//! MCP／CLI 的目标解析:读写哪个工作区。
//!
//! 解析次序:`--db-path` → `--profile <名称>` → 清单里的激活项 → 现有默认路径
//! (没有清单时)。前两者是固定目标,不随应用中的切换改变;不指定时跟随
//! 应用当前激活的工作区。

use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::workspace::registry;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    /// 作用于指定文件(显式路径,或按名称指定的工作区)
    Fixed(PathBuf),
    /// 跟随应用当前激活的工作区
    Follow,
}

impl Target {
    /// 此刻应读写的数据库路径。
    pub fn db_path(&self, app_data_dir: Option<&Path>) -> Result<PathBuf, AppError> {
        match self {
            Target::Fixed(path) => Ok(path.clone()),
            Target::Follow => active_db_path(app_data_dir),
        }
    }
}

/// 清单存在就读取;不存在或已损坏时按磁盘上的数据在内存里重建,不落盘。
fn read_registry(app_data_dir: &Path) -> registry::Registry {
    registry::load_existing(app_data_dir).unwrap_or_else(|| registry::rebuild(app_data_dir))
}

/// 应用当前激活工作区的数据库路径。没有清单时回退到现有默认路径,
/// 旧配置无需修改即可继续使用。
pub fn active_db_path(app_data_dir: Option<&Path>) -> Result<PathBuf, AppError> {
    let Some(dir) = app_data_dir else {
        return Err(AppError::Generic(
            "无法确定数据目录,请用 --db-path 指定数据库文件".to_string(),
        ));
    };
    let current = read_registry(dir);
    match current.active() {
        Some(active) => Ok(registry::db_path_of(dir, active)),
        None => Ok(dir.join("todo.db")),
    }
}

/// 按名称查找工作区的数据库路径。名称去首尾空白且不区分大小写;
/// 找不到时报错并列出可用名称,不会创建工作区。
pub fn profile_db_path(app_data_dir: &Path, name: &str) -> Result<PathBuf, AppError> {
    let current = read_registry(app_data_dir);
    match current.find_by_name(name) {
        Some(entry) => Ok(registry::db_path_of(app_data_dir, entry)),
        None => {
            let names: Vec<String> = current
                .visible()
                .map(|w| w.name.clone())
                .collect();
            let available = if names.is_empty() {
                "（目前没有工作区）".to_string()
            } else {
                names.join("、")
            };
            Err(AppError::Validation(format!(
                "没有名为“{}”的工作区。可用的工作区: {}",
                name.trim(),
                available
            )))
        }
    }
}

/// 按解析次序确定目标。`--db-path` 与 `--profile` 互斥由命令行参数层保证。
pub fn resolve_target(
    db_path: Option<&Path>,
    profile: Option<&str>,
    app_data_dir: Option<&Path>,
) -> Result<Target, AppError> {
    if let Some(path) = db_path {
        return Ok(Target::Fixed(path.to_path_buf()));
    }
    let dir = app_data_dir.ok_or_else(|| {
        AppError::Generic("无法确定数据目录,请用 --db-path 指定数据库文件".to_string())
    })?;
    if let Some(name) = profile {
        return Ok(Target::Fixed(profile_db_path(dir, name)?));
    }
    Ok(Target::Follow)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::{self, registry::WorkspaceEntry, store};

    /// 一个带"默认工作区 + Work"的数据目录,默认工作区为激活项
    fn app_with_work_workspace() -> (tempfile::TempDir, WorkspaceEntry) {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        let started = workspace::resolve_for_startup(dir).unwrap();
        let work = store::create_blank(dir, "Work", &started.conn).unwrap();
        let (mut current, _) = registry::load_or_init(dir).unwrap();
        current.workspaces.push(work.clone());
        registry::save(dir, &current).unwrap();
        (tmp, work)
    }

    fn switch_active(dir: &Path, id: &str) {
        let (mut current, _) = registry::load_or_init(dir).unwrap();
        current.set_active(id);
        registry::save(dir, &current).unwrap();
    }

    #[test]
    fn follows_the_active_workspace() {
        let (tmp, work) = app_with_work_workspace();
        let dir = tmp.path();
        let follow = resolve_target(None, None, Some(dir)).unwrap();
        assert_eq!(follow, Target::Follow);

        assert_eq!(
            follow.db_path(Some(dir)).unwrap(),
            dir.join("todo.db"),
            "默认工作区是激活项"
        );
        switch_active(dir, &work.id);
        assert_eq!(
            follow.db_path(Some(dir)).unwrap(),
            registry::db_path_of(dir, &work),
            "切换后指向新的激活项"
        );
    }

    #[test]
    fn falls_back_to_default_path_without_a_registry() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        assert_eq!(resolve_target(None, None, Some(dir)).unwrap(), Target::Follow);
        assert_eq!(follow_db_path(dir), dir.join("todo.db"));
        // 只解析,不创建清单或数据库
        assert!(!registry::registry_path(dir).exists());
        assert!(!dir.join("todo.db").exists());

        // 清单损坏时同样回退,而不是报错
        std::fs::write(registry::registry_path(dir), b"{broken").unwrap();
        assert_eq!(follow_db_path(dir), dir.join("todo.db"));
    }

    fn follow_db_path(dir: &Path) -> PathBuf {
        resolve_target(None, None, Some(dir))
            .unwrap()
            .db_path(Some(dir))
            .unwrap()
    }

    #[test]
    fn explicit_path_wins_and_is_not_registered_as_a_workspace() {
        let (tmp, _) = app_with_work_workspace();
        let dir = tmp.path();
        let registry_before = std::fs::read(registry::registry_path(dir)).unwrap();
        let explicit = dir.join("elsewhere.db");
        assert_eq!(
            resolve_target(Some(&explicit), Some("Work"), Some(dir)).unwrap(),
            Target::Fixed(explicit.clone())
        );
        assert_eq!(Target::Fixed(explicit.clone()).db_path(None).unwrap(), explicit);
        // `--db-path` 指定的文件不被登记为工作区
        assert_eq!(
            std::fs::read(registry::registry_path(dir)).unwrap(),
            registry_before
        );
    }

    #[test]
    fn profile_matches_name_ignoring_case_and_whitespace() {
        let (tmp, work) = app_with_work_workspace();
        let dir = tmp.path();
        for name in ["Work", "work", "  WORK "] {
            let target = resolve_target(None, Some(name), Some(dir)).unwrap();
            assert_eq!(target, Target::Fixed(registry::db_path_of(dir, &work)), "{name}");
        }
        // 默认工作区也能按名称指定
        let default = resolve_target(None, Some("默认工作区"), Some(dir)).unwrap();
        assert_eq!(default, Target::Fixed(dir.join("todo.db")));
    }

    #[test]
    fn unknown_profile_lists_available_names_and_creates_nothing() {
        let (tmp, _) = app_with_work_workspace();
        let dir = tmp.path();
        let before = std::fs::read(registry::registry_path(dir)).unwrap();
        let err = resolve_target(None, Some("ghost"), Some(dir)).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("没有名为“ghost”的工作区"), "{msg}");
        assert!(msg.contains("Work") && msg.contains("默认工作区"), "{msg}");
        assert_eq!(std::fs::read(registry::registry_path(dir)).unwrap(), before);
    }

    #[test]
    fn missing_data_directory_is_reported() {
        let err = resolve_target(None, None, None).unwrap_err();
        assert!(err.to_string().contains("--db-path"));
        assert!(Target::Follow.db_path(None).is_err());
    }
}
