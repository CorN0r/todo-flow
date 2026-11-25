//! 工作区清单:记录有哪些工作区、当前激活的是谁。
//!
//! 清单保存在所有工作区之外(应用数据目录下的 `workspaces.json`),不进备份、
//! 不同步。数据目录一律存相对应用数据目录的相对路径;默认工作区就是应用
//! 数据目录本身,数据库与附件的位置保持升级前不变。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;

pub const REGISTRY_FILE: &str = "workspaces.json";
pub const WORKSPACES_DIR: &str = "workspaces";
pub const DEFAULT_WORKSPACE_ID: &str = "default";
pub const DEFAULT_WORKSPACE_NAME: &str = "默认工作区";
const REGISTRY_VERSION: u32 = 1;
const MAX_NAME_CHARS: usize = 80;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceEntry {
    pub id: String,
    pub name: String,
    /// 相对应用数据目录的路径;默认工作区为空串(即应用数据目录本身)
    #[serde(default)]
    pub dir: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub last_activated_at: Option<String>,
    /// 删除当前工作区时先打标记:它的数据库正被本进程占用,重启后由新进程完成删除
    #[serde(default)]
    pub pending_delete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Registry {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub active_id: String,
    #[serde(default)]
    pub workspaces: Vec<WorkspaceEntry>,
}

fn default_version() -> u32 {
    REGISTRY_VERSION
}

fn now_local() -> String {
    chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

pub fn registry_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(REGISTRY_FILE)
}

pub fn default_entry() -> WorkspaceEntry {
    WorkspaceEntry {
        id: DEFAULT_WORKSPACE_ID.to_string(),
        name: DEFAULT_WORKSPACE_NAME.to_string(),
        dir: String::new(),
        created_at: now_local(),
        last_activated_at: None,
        pending_delete: false,
    }
}

/// 是否是升级前就存在的默认工作区(数据在应用数据目录根部)
pub fn is_default(entry: &WorkspaceEntry) -> bool {
    entry.dir.is_empty()
}

/// 工作区的数据目录(数据库与附件目录所在)
pub fn data_dir_of(app_data_dir: &Path, entry: &WorkspaceEntry) -> PathBuf {
    if is_default(entry) {
        app_data_dir.to_path_buf()
    } else {
        app_data_dir.join(&entry.dir)
    }
}

pub fn db_path_of(app_data_dir: &Path, entry: &WorkspaceEntry) -> PathBuf {
    data_dir_of(app_data_dir, entry).join("todo.db")
}

/// 名称去首尾空白后不能为空,比较时不区分大小写
pub fn same_name(a: &str, b: &str) -> bool {
    a.trim().to_lowercase() == b.trim().to_lowercase()
}

pub fn normalize_name(raw: &str) -> Result<String, AppError> {
    let name = raw.trim();
    if name.is_empty() {
        return Err(AppError::Validation("名称不能为空".to_string()));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::Validation(format!(
            "名称最多 {} 个字符",
            MAX_NAME_CHARS
        )));
    }
    if name.chars().any(|c| c.is_control()) {
        return Err(AppError::Validation("名称不能包含控制字符".to_string()));
    }
    Ok(name.to_string())
}

impl Registry {
    pub fn get(&self, id: &str) -> Option<&WorkspaceEntry> {
        self.workspaces.iter().find(|w| w.id == id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut WorkspaceEntry> {
        self.workspaces.iter_mut().find(|w| w.id == id)
    }

    pub fn active(&self) -> Option<&WorkspaceEntry> {
        self.get(&self.active_id)
    }

    /// 未标记为待删除的工作区(界面与切换器只列这些)
    pub fn visible(&self) -> impl Iterator<Item = &WorkspaceEntry> {
        self.workspaces.iter().filter(|w| !w.pending_delete)
    }

    pub fn visible_count(&self) -> usize {
        self.visible().count()
    }

    pub fn find_by_name(&self, name: &str) -> Option<&WorkspaceEntry> {
        self.workspaces
            .iter()
            .find(|w| same_name(&w.name, name))
    }

    /// 除 `exclude_id` 外最近使用的工作区
    pub fn most_recent_other(&self, exclude_id: &str) -> Option<&WorkspaceEntry> {
        self.visible()
            .filter(|w| w.id != exclude_id)
            .max_by_key(|w| {
                w.last_activated_at
                    .clone()
                    .unwrap_or_else(|| w.created_at.clone())
            })
    }

    /// 设为激活项并刷新最近激活时间
    pub fn set_active(&mut self, id: &str) {
        let now = now_local();
        if let Some(entry) = self.get_mut(id) {
            entry.last_activated_at = Some(now);
        }
        self.active_id = id.to_string();
    }

    pub fn remove(&mut self, id: &str) {
        self.workspaces.retain(|w| w.id != id);
    }

    /// 清单内容是否自洽:非空、激活项存在、数据目录都是受管的相对路径
    pub fn is_valid(&self) -> bool {
        if self.workspaces.is_empty() {
            return false;
        }
        if self.active().is_none() {
            return false;
        }
        self.workspaces.iter().all(|w| {
            let path = Path::new(&w.dir);
            (w.dir.is_empty()
                || (path.is_relative()
                    && !w.dir.contains('\\')
                    && !path.components().any(|c| matches!(c, std::path::Component::ParentDir))))
                && !w.name.trim().is_empty()
                && !w.id.is_empty()
        })
    }
}

/// 依据磁盘上的已有数据重建清单:默认位置,加上 `workspaces/` 下每个含
/// `todo.db` 的目录(名称回退为目录名)。永不删除或移动任何文件。
pub fn rebuild(app_data_dir: &Path) -> Registry {
    let mut found: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(app_data_dir.join(WORKSPACES_DIR)) {
        found = entries
            .flatten()
            .map(|e| e.path())
            .filter(|path| path.is_dir() && path.join("todo.db").is_file())
            .collect();
        found.sort();
    }

    let mut workspaces = Vec::new();
    // 默认工作区只在数据库仍在原位,或磁盘上没有任何工作区(全新安装)时登记:
    // 被删除过的默认工作区不会在清单重建时"复活"成一个空库
    if app_data_dir.join("todo.db").is_file() || found.is_empty() {
        workspaces.push(default_entry());
    }
    for path in found {
        let Some(id) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if id == DEFAULT_WORKSPACE_ID {
            continue;
        }
        workspaces.push(WorkspaceEntry {
            id: id.to_string(),
            name: id.to_string(),
            dir: format!("{}/{}", WORKSPACES_DIR, id),
            created_at: now_local(),
            last_activated_at: None,
            pending_delete: false,
        });
    }
    let active_id = workspaces
        .first()
        .map(|w| w.id.clone())
        .unwrap_or_else(|| DEFAULT_WORKSPACE_ID.to_string());
    Registry {
        version: REGISTRY_VERSION,
        active_id,
        workspaces,
    }
}

/// 清单文件存在且内容自洽时返回;不创建、不重建。
pub fn load_existing(app_data_dir: &Path) -> Option<Registry> {
    let text = std::fs::read_to_string(registry_path(app_data_dir)).ok()?;
    serde_json::from_str::<Registry>(&text)
        .ok()
        .filter(|r| r.is_valid())
}

/// 读取清单。返回 `(清单, 是否刚重建)`;刚重建时由调用方决定何时保存。
/// 文件缺失、无法解析或内容不自洽都按重建处理。
pub fn load_or_init(app_data_dir: &Path) -> Result<(Registry, bool), AppError> {
    match load_existing(app_data_dir) {
        Some(registry) => Ok((registry, false)),
        None => Ok((rebuild(app_data_dir), true)),
    }
}

/// 原子写入:先写临时文件,再替换正式文件
pub fn save(app_data_dir: &Path, registry: &Registry) -> Result<(), AppError> {
    std::fs::create_dir_all(app_data_dir)?;
    let path = registry_path(app_data_dir);
    let tmp = app_data_dir.join(format!("{}.tmp", REGISTRY_FILE));
    let text = serde_json::to_string_pretty(registry)
        .map_err(|e| AppError::Generic(format!("序列化工作区清单失败: {}", e)))?;
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn missing_file_registers_default_workspace_only() {
        let dir = temp();
        let (registry, rebuilt) = load_or_init(dir.path()).unwrap();
        assert!(rebuilt);
        assert_eq!(registry.workspaces.len(), 1);
        assert_eq!(registry.active_id, DEFAULT_WORKSPACE_ID);
        assert_eq!(registry.active().unwrap().name, DEFAULT_WORKSPACE_NAME);
        assert!(is_default(registry.active().unwrap()));
        // 只在内存里重建,不落盘
        assert!(!registry_path(dir.path()).exists());
    }

    #[test]
    fn corrupted_file_is_rebuilt_without_touching_databases() {
        let dir = temp();
        let db = dir.path().join("todo.db");
        let original = b"not json at all";
        std::fs::write(registry_path(dir.path()), original).unwrap();
        std::fs::write(&db, b"sqlite-bytes").unwrap();

        let (registry, rebuilt) = load_or_init(dir.path()).unwrap();
        assert!(rebuilt);
        assert_eq!(registry.workspaces.len(), 1);
        // 损坏的清单原样保留,数据库文件未被触碰
        assert_eq!(std::fs::read(registry_path(dir.path())).unwrap(), original);
        assert_eq!(std::fs::read(&db).unwrap(), b"sqlite-bytes");
    }

    #[test]
    fn inconsistent_registry_is_rebuilt() {
        let dir = temp();
        // 激活项指向不存在的条目
        let broken = Registry {
            version: REGISTRY_VERSION,
            active_id: "ghost".to_string(),
            workspaces: vec![default_entry()],
        };
        std::fs::write(
            registry_path(dir.path()),
            serde_json::to_string(&broken).unwrap(),
        )
        .unwrap();
        let (registry, rebuilt) = load_or_init(dir.path()).unwrap();
        assert!(rebuilt);
        assert!(registry.is_valid());
    }

    #[test]
    fn rebuild_discovers_managed_workspace_directories() {
        let dir = temp();
        let ws = dir.path().join(WORKSPACES_DIR);
        std::fs::create_dir_all(ws.join("alpha")).unwrap();
        std::fs::write(ws.join("alpha").join("todo.db"), b"db").unwrap();
        // 没有 todo.db 的目录不算工作区
        std::fs::create_dir_all(ws.join("not-a-workspace")).unwrap();

        let registry = rebuild(dir.path());
        let names: Vec<&str> = registry.workspaces.iter().map(|w| w.name.as_str()).collect();
        assert_eq!(names, vec!["alpha"]);
        assert_eq!(registry.active_id, "alpha");
        assert_eq!(registry.get("alpha").unwrap().dir, "workspaces/alpha");
        assert_eq!(
            db_path_of(dir.path(), registry.get("alpha").unwrap()),
            ws.join("alpha").join("todo.db")
        );
    }

    #[test]
    fn rebuild_keeps_default_when_its_database_exists() {
        let dir = temp();
        std::fs::write(dir.path().join("todo.db"), b"db").unwrap();
        let ws = dir.path().join(WORKSPACES_DIR);
        std::fs::create_dir_all(ws.join("alpha")).unwrap();
        std::fs::write(ws.join("alpha").join("todo.db"), b"db").unwrap();

        let registry = rebuild(dir.path());
        let names: Vec<&str> = registry.workspaces.iter().map(|w| w.name.as_str()).collect();
        assert_eq!(names, vec![DEFAULT_WORKSPACE_NAME, "alpha"]);
        assert_eq!(registry.active_id, DEFAULT_WORKSPACE_ID);
    }

    #[test]
    fn load_existing_does_not_create_or_rebuild() {
        let dir = temp();
        assert!(load_existing(dir.path()).is_none());
        assert!(!registry_path(dir.path()).exists());

        std::fs::write(registry_path(dir.path()), b"{broken").unwrap();
        assert!(load_existing(dir.path()).is_none());
        assert_eq!(std::fs::read(registry_path(dir.path())).unwrap(), b"{broken");
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = temp();
        let mut registry = rebuild(dir.path());
        registry.workspaces.push(WorkspaceEntry {
            id: "work".to_string(),
            name: "工作".to_string(),
            dir: "workspaces/work".to_string(),
            created_at: "2026-11-24 10:00:00".to_string(),
            last_activated_at: None,
            pending_delete: false,
        });
        registry.set_active("work");
        save(dir.path(), &registry).unwrap();

        let (loaded, rebuilt) = load_or_init(dir.path()).unwrap();
        assert!(!rebuilt);
        assert_eq!(loaded, registry);
        assert!(loaded.active().unwrap().last_activated_at.is_some());
        // 临时文件不残留
        assert!(!dir.path().join("workspaces.json.tmp").exists());
    }

    #[test]
    fn save_creates_missing_data_directory() {
        let dir = temp();
        let nested = dir.path().join("a").join("b");
        save(&nested, &rebuild(dir.path())).unwrap();
        assert!(registry_path(&nested).is_file());
    }

    #[test]
    fn name_matching_ignores_case_and_whitespace() {
        let dir = temp();
        let mut registry = rebuild(dir.path());
        registry.workspaces.push(WorkspaceEntry {
            id: "work".to_string(),
            name: "Work".to_string(),
            dir: "workspaces/work".to_string(),
            created_at: "2026-11-24 10:00:00".to_string(),
            last_activated_at: None,
            pending_delete: false,
        });
        // 仅大小写或首尾空白不同的名称视为同一个
        assert!(registry.find_by_name("work").is_some());
        assert!(registry.find_by_name("  WORK ").is_some());
        assert!(registry.find_by_name("个人").is_none());
        assert!(same_name("Work", "work"));
        assert!(!same_name("工作", "个人"));
    }

    #[test]
    fn name_normalization_rejects_blank_and_overlong() {
        assert_eq!(normalize_name("  工作  ").unwrap(), "工作");
        assert!(normalize_name("   ").is_err());
        assert!(normalize_name(&"a".repeat(MAX_NAME_CHARS + 1)).is_err());
        assert!(normalize_name(&"a".repeat(MAX_NAME_CHARS)).is_ok());
        assert!(normalize_name("a\nb").is_err());
    }

    #[test]
    fn most_recent_other_picks_latest_activation() {
        let mut registry = rebuild(temp().path());
        registry.workspaces[0].created_at = "2026-11-01 00:00:00".to_string();
        for (id, last) in [("a", "2026-11-20 09:00:00"), ("b", "2026-11-23 18:00:00")] {
            registry.workspaces.push(WorkspaceEntry {
                id: id.to_string(),
                name: id.to_string(),
                dir: format!("workspaces/{}", id),
                created_at: "2026-11-01 00:00:00".to_string(),
                last_activated_at: Some(last.to_string()),
                pending_delete: false,
            });
        }
        registry.set_active("a");
        // 刚激活的 a 被排除;b 比从未激活过的默认工作区更近
        let other = registry.most_recent_other("a").unwrap();
        assert_eq!(other.id, "b");

        // 待删除的工作区不参与
        registry.workspaces[2].pending_delete = true;
        let other = registry.most_recent_other("a").unwrap();
        assert_eq!(other.id, DEFAULT_WORKSPACE_ID);
    }

    #[test]
    fn set_active_updates_recency() {
        let mut registry = rebuild(temp().path());
        registry.workspaces.push(WorkspaceEntry {
            id: "work".to_string(),
            name: "工作".to_string(),
            dir: "workspaces/work".to_string(),
            created_at: "2026-11-01 00:00:00".to_string(),
            last_activated_at: None,
            pending_delete: false,
        });
        registry.set_active("work");
        assert_eq!(registry.active_id, "work");
        assert!(registry.get("work").unwrap().last_activated_at.is_some());
    }

    #[test]
    fn validity_rejects_unmanaged_paths() {
        let bad_dir = Registry {
            version: REGISTRY_VERSION,
            active_id: DEFAULT_WORKSPACE_ID.to_string(),
            workspaces: vec![default_entry(), WorkspaceEntry {
                id: "x".to_string(),
                name: "x".to_string(),
                dir: "C:\\elsewhere".to_string(),
                created_at: String::new(),
                last_activated_at: None,
                pending_delete: false,
            }],
        };
        assert!(!bad_dir.is_valid());

        let traversal = Registry {
            workspaces: vec![WorkspaceEntry {
                dir: "workspaces/../..".to_string(),
                ..default_entry()
            }],
            ..bad_dir.clone()
        };
        assert!(!traversal.is_valid());
        assert!(rebuild(temp().path()).is_valid());
    }
}
