//! 工作区的文件操作:新建、从文件添加、统计,以及删除(含凭证清理)。
//! 这些函数只操作清单和文件,不触碰当前打开的连接。

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use super::files;
use super::registry::{self, WorkspaceEntry};
use crate::ai::credentials::{CredentialStore, WindowsKeyringStore};
use crate::db;
use crate::error::AppError;

/// 新建空白工作区时从当前工作区复制的库内偏好。不含模型配置,也不含
/// 任何引用工作区内数据的键(例如默认模型)。
pub const PREFERENCE_KEYS: [&str; 12] = [
    "language",
    "keyboard_shortcuts",
    "shortcuts_enabled",
    "widget_enabled",
    "widget_x",
    "widget_y",
    "widget_size",
    "widget_bubble_color",
    "pomodoro_x",
    "pomodoro_y",
    "note_default_style",
    "reminder_system_notify",
];

fn now_local() -> String {
    chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

fn new_entry(name: &str) -> WorkspaceEntry {
    let id = uuid::Uuid::new_v4().to_string();
    WorkspaceEntry {
        dir: format!("{}/{}", registry::WORKSPACES_DIR, id),
        id,
        name: name.to_string(),
        created_at: now_local(),
        last_activated_at: None,
        pending_delete: false,
    }
}

fn open_and_migrate(db_path: &Path) -> Result<Connection, AppError> {
    let conn = db::connection::open(db_path)
        .map_err(|e| AppError::Generic(format!("无法打开数据库: {}", files::sqlite_message(&e))))?;
    db::migrations::run(&conn)
        .map_err(|e| AppError::Generic(format!("升级数据库结构失败: {}", e)))?;
    Ok(conn)
}

/// 新建空白工作区,并从 `from` 复制库内偏好。不登记到清单,由调用方登记。
pub fn create_blank(
    app_data_dir: &Path,
    name: &str,
    from: &Connection,
) -> Result<WorkspaceEntry, AppError> {
    let entry = new_entry(&registry::normalize_name(name)?);
    let dir = registry::data_dir_of(app_data_dir, &entry);
    std::fs::create_dir_all(dir.join("attachments"))?;
    let conn = open_and_migrate(&registry::db_path_of(app_data_dir, &entry))?;
    copy_preferences(from, &conn)?;
    Ok(entry)
}

pub fn copy_preferences(from: &Connection, to: &Connection) -> Result<(), AppError> {
    for key in PREFERENCE_KEYS {
        let value: Option<String> = from
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .ok();
        if let Some(value) = value {
            to.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                [key, value.as_str()],
            )?;
        }
    }
    Ok(())
}

/// 从文件添加:校验后复制成一致副本,再升级副本。原文件不被修改。
pub fn add_from_file(
    app_data_dir: &Path,
    source: &Path,
    name: &str,
) -> Result<WorkspaceEntry, AppError> {
    let entry = new_entry(&registry::normalize_name(name)?);
    let dir = registry::data_dir_of(app_data_dir, &entry);
    std::fs::create_dir_all(dir.join("attachments"))?;
    let db_path = registry::db_path_of(app_data_dir, &entry);
    let prepared = files::copy_snapshot(source, &db_path).and_then(|_| {
        open_and_migrate(&db_path)?;
        Ok(())
    });
    if let Err(e) = prepared {
        // 校验或升级失败:不留下半成品目录
        let _ = std::fs::remove_dir_all(&dir);
        return Err(e);
    }
    Ok(entry)
}

/// "全部任务"页面标题上的任务数量:不含已归档和已删除的,也只算顶层任务
/// (页面默认折叠子任务)。两处数字必须一致。打不开时按 0 计。
pub fn task_count(app_data_dir: &Path, entry: &WorkspaceEntry) -> i64 {
    let Ok(conn) = files::open_read_only(&registry::db_path_of(app_data_dir, entry)) else {
        return 0;
    };
    conn.query_row(
        "SELECT COUNT(*) FROM tasks
         WHERE deleted_at IS NULL AND is_archived = 0 AND parent_task_id IS NULL",
        [],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

/// 删除后仍未清理掉的文件
pub struct DeleteOutcome {
    pub leftover: Option<String>,
}

pub fn delete_files(
    app_data_dir: &Path,
    entry: &WorkspaceEntry,
    remaining: &[WorkspaceEntry],
) -> Result<DeleteOutcome, AppError> {
    delete_files_with(app_data_dir, entry, remaining, &WindowsKeyringStore)
}

/// 删除工作区的文件,并清理只有它在用的 API Key。
///
/// 先探测占用:数据库文件被其他进程打开时改名会失败,此时什么都不改并报错。
/// 改名成功之后删除即告成立,后续清理若失败只报告残留路径。
pub fn delete_files_with(
    app_data_dir: &Path,
    entry: &WorkspaceEntry,
    remaining: &[WorkspaceEntry],
    credentials: &dyn CredentialStore,
) -> Result<DeleteOutcome, AppError> {
    let dir = registry::data_dir_of(app_data_dir, entry);
    let db_path = dir.join("todo.db");
    let staged = dir.join("todo.db.deleting");
    if db_path.exists() {
        std::fs::rename(&db_path, &staged).map_err(|_| {
            AppError::Validation(format!(
                "工作区“{}”正在被其他程序使用,无法删除。请关闭占用它的程序(例如指定了该工作区的 MCP 服务)后重试",
                entry.name
            ))
        })?;
    }

    let remaining_dbs: Vec<PathBuf> = remaining
        .iter()
        .map(|other| registry::db_path_of(app_data_dir, other))
        .collect();
    cleanup_credentials(&staged, &remaining_dbs, credentials);

    let mut leftover: Vec<String> = Vec::new();
    if staged.exists() {
        if let Err(e) = std::fs::remove_file(&staged) {
            leftover.push(format!("{} ({})", staged.display(), e));
        }
    }
    // 默认工作区的目录就是应用数据目录本身:只删它的附件,不动清单和其他工作区
    let attachments = dir.join("attachments");
    if attachments.exists() {
        if let Err(e) = std::fs::remove_dir_all(&attachments) {
            leftover.push(format!("{} ({})", attachments.display(), e));
        }
    }
    if !registry::is_default(entry) && dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(&dir) {
            leftover.push(format!("{} ({})", dir.display(), e));
        }
    }
    Ok(DeleteOutcome {
        leftover: if leftover.is_empty() {
            None
        } else {
            Some(format!("部分文件未能删除: {}", leftover.join("; ")))
        },
    })
}

/// 某个数据库里登记的全部模型连接 ID。旧库没有这张表时视为没有。
pub fn connection_ids(db_path: &Path) -> Vec<String> {
    let Ok(conn) = files::open_read_only(db_path) else {
        return Vec::new();
    };
    let has_table: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'ai_connections'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if has_table == 0 {
        return Vec::new();
    }
    let Ok(mut stmt) = conn.prepare("SELECT id FROM ai_connections") else {
        return Vec::new();
    };
    let ids = stmt
        .query_map([], |row| row.get(0))
        .map(|rows| rows.flatten().collect());
    ids.unwrap_or_default()
}

/// 删除只属于目标工作区的 API Key;仍被任何剩余工作区引用的保留。
/// 返回被清除的连接 ID。清理失败不阻断删除,只记录。
pub fn cleanup_credentials(
    target_db: &Path,
    remaining_dbs: &[PathBuf],
    credentials: &dyn CredentialStore,
) -> Vec<String> {
    let target_ids = connection_ids(target_db);
    if target_ids.is_empty() {
        return Vec::new();
    }
    let still_used: HashSet<String> = remaining_dbs
        .iter()
        .flat_map(|path| connection_ids(path))
        .collect();
    let mut removed = Vec::new();
    for id in target_ids {
        if still_used.contains(&id) {
            continue;
        }
        match credentials.remove(&id) {
            Ok(()) => removed.push(id),
            Err(e) => eprintln!(
                "[workspace] 无法清除工作区模型连接 {} 的 API Key: {}",
                id, e
            ),
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::task::{CreateTaskRequest, TaskFilter};
    use std::sync::Mutex;

    fn app_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    fn add_task(conn: &Connection, title: &str) -> String {
        db::task_repo::create(
            conn,
            CreateTaskRequest {
                title: title.to_string(),
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
    }

    fn add_connection(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO ai_connections (id, name, base_url) VALUES (?1, ?2, 'https://example.test/v1')",
            [id, id],
        )
        .unwrap();
    }

    fn setting(conn: &Connection, key: &str) -> Option<String> {
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
            .ok()
    }

    #[derive(Default)]
    struct FakeStore(Mutex<Vec<String>>);

    impl CredentialStore for FakeStore {
        fn set(&self, connection_id: &str, _api_key: &str) -> Result<(), crate::ai::error::AiError> {
            self.0.lock().unwrap().push(connection_id.to_string());
            Ok(())
        }
        fn remove(&self, connection_id: &str) -> Result<(), crate::ai::error::AiError> {
            self.0
                .lock()
                .unwrap()
                .retain(|id| id != connection_id);
            Ok(())
        }
        fn exists(&self, connection_id: &str) -> Result<bool, crate::ai::error::AiError> {
            Ok(self.0.lock().unwrap().iter().any(|id| id == connection_id))
        }
        fn get(&self, _connection_id: &str) -> Result<Option<String>, crate::ai::error::AiError> {
            Ok(Some("key".to_string()))
        }
    }

    #[test]
    fn create_blank_is_empty_but_keeps_preferences() {
        let dir = app_dir();
        let source_db = dir.path().join("source.db");
        let source = db::connection::open(&source_db).unwrap();
        db::migrations::run(&source).unwrap();
        add_task(&source, "不该被复制的任务");
        source
            .execute_batch(
                "INSERT INTO settings (key, value) VALUES
                 ('language', 'en-US'),
                 ('ai_default_model', 'model-1'),
                 ('widget_x', '120');",
            )
            .unwrap();

        let entry = create_blank(dir.path(), "  试验  ", &source).unwrap();
        assert_eq!(entry.name, "试验");
        let blank = open_and_migrate(&registry::db_path_of(dir.path(), &entry)).unwrap();

        let tasks = db::task_repo::get_all(&blank, TaskFilter::default()).unwrap();
        assert!(tasks.is_empty());
        assert_eq!(setting(&blank, "language").as_deref(), Some("en-US"));
        assert_eq!(setting(&blank, "widget_x").as_deref(), Some("120"));
        // 键盘快捷键不在源库里时保持该库自己的默认值
        assert!(setting(&blank, "keyboard_shortcuts").is_some());
        // 模型配置与默认模型不属于偏好,不复制
        assert_eq!(setting(&blank, "ai_default_model"), None);
        assert!(
            registry::data_dir_of(dir.path(), &entry)
                .join("attachments")
                .is_dir()
        );
    }

    #[test]
    fn create_blank_rejects_blank_name() {
        let dir = app_dir();
        let source_db = dir.path().join("source.db");
        let source = db::connection::open(&source_db).unwrap();
        db::migrations::run(&source).unwrap();
        assert!(create_blank(dir.path(), "   ", &source).is_err());
    }

    #[test]
    fn add_from_file_copies_content_and_leaves_source_untouched() {
        let dir = app_dir();
        let source_path = dir.path().join("backup.db");
        let id = {
            let source = db::connection::open(&source_path).unwrap();
            db::migrations::run(&source).unwrap();
            add_task(&source, "备份里的任务")
        };
        let before = std::fs::read(&source_path).unwrap();

        let entry = add_from_file(dir.path(), &source_path, "工作").unwrap();
        assert_eq!(entry.name, "工作");
        let added = open_and_migrate(&registry::db_path_of(dir.path(), &entry)).unwrap();
        let task = db::task_repo::get_by_id(&added, &id).unwrap().unwrap();
        assert_eq!(task.title, "备份里的任务");
        assert_eq!(std::fs::read(&source_path).unwrap(), before);
    }

    #[test]
    fn add_from_file_rejects_invalid_file_without_leaving_a_directory() {
        let dir = app_dir();
        let bad = dir.path().join("notes.txt");
        std::fs::write(&bad, b"not a database").unwrap();
        let err = add_from_file(dir.path(), &bad, "坏文件").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
        let workspaces = dir.path().join(registry::WORKSPACES_DIR);
        let left: Vec<_> = std::fs::read_dir(&workspaces)
            .map(|entries| entries.flatten().collect())
            .unwrap_or_default();
        assert!(left.is_empty());
        assert_eq!(std::fs::read(&bad).unwrap(), b"not a database");
    }

    #[test]
    fn task_count_excludes_archived_tasks() {
        let dir = app_dir();
        let source_db = dir.path().join("source.db");
        let source = db::connection::open(&source_db).unwrap();
        db::migrations::run(&source).unwrap();
        let entry = create_blank(dir.path(), "统计", &source).unwrap();
        let conn = open_and_migrate(&registry::db_path_of(dir.path(), &entry)).unwrap();
        let first = add_task(&conn, "一");
        let second = add_task(&conn, "二");
        conn.execute("UPDATE tasks SET is_archived = 1 WHERE id = ?1", [&first])
            .unwrap();
        // 子任务默认折叠,不算在"全部任务"的数字里
        let _child = db::task_repo::create(
            &conn,
            CreateTaskRequest {
                title: "子任务".to_string(),
                description: None,
                tag_ids: None,
                parent_task_id: Some(second.clone()),
                due_date: None,
                priority: None,
                reminder: None,
                recurrence: None,
                my_day_date: None,
                source: None,
            },
        )
        .unwrap();
        assert_eq!(task_count(dir.path(), &entry), 1);
    }

    fn seed_deletion(dir: &Path, entry: &WorkspaceEntry, other: &WorkspaceEntry, ids: &[&str]) {
        for (target, list) in [(entry, ids), (other, &["shared"][..])] {
            let db_path = registry::db_path_of(dir, target);
            let conn = db::connection::open(&db_path).unwrap();
            db::migrations::run(&conn).unwrap();
            for id in list {
                add_connection(&conn, id);
            }
            let _ = std::fs::create_dir_all(
                registry::data_dir_of(dir, target).join("attachments").join("task"),
            );
        }
    }

    #[test]
    fn delete_removes_workspace_and_only_its_own_credentials() {
        let dir = app_dir();
        let source_db = dir.path().join("source.db");
        let source = db::connection::open(&source_db).unwrap();
        db::migrations::run(&source).unwrap();
        let target = create_blank(dir.path(), "试验", &source).unwrap();
        let other = create_blank(dir.path(), "默认工作区", &source).unwrap();
        seed_deletion(dir.path(), &target, &other, &["only-target", "shared"]);
        let store = FakeStore::default();
        for id in ["only-target", "shared", "unrelated"] {
            store.set(id, "key").unwrap();
        }

        let outcome = delete_files_with(dir.path(), &target, &[other.clone()], &store).unwrap();
        assert!(outcome.leftover.is_none());
        assert!(!registry::data_dir_of(dir.path(), &target).exists());
        // 只清除别的剩余工作区没在用的密钥
        assert!(!store.exists("only-target").unwrap());
        assert!(store.exists("shared").unwrap());
        assert!(store.exists("unrelated").unwrap());
        assert!(registry::db_path_of(dir.path(), &other).is_file());
    }

    #[test]
    fn delete_default_workspace_keeps_app_files() {
        let dir = app_dir();
        let default = registry::default_entry();
        let source_db = dir.path().join("source.db");
        let source = db::connection::open(&source_db).unwrap();
        db::migrations::run(&source).unwrap();
        let other = create_blank(dir.path(), "另一个", &source).unwrap();
        let target_db = dir.path().join("todo.db");
        {
            let conn = db::connection::open(&target_db).unwrap();
            db::migrations::run(&conn).unwrap();
        }
        std::fs::create_dir_all(dir.path().join("attachments").join("task")).unwrap();
        registry::save(dir.path(), &registry::rebuild(dir.path())).unwrap();

        let outcome = delete_files_with(dir.path(), &default, &[other.clone()], &FakeStore::default()).unwrap();
        assert!(outcome.leftover.is_none());
        assert!(!target_db.exists());
        assert!(!dir.path().join("attachments").exists());
        // 应用数据目录、清单和其他工作区原样保留
        assert!(registry::registry_path(dir.path()).is_file());
        assert!(registry::data_dir_of(dir.path(), &other).is_dir());
    }

    #[test]
    fn delete_refuses_while_database_is_in_use() {
        let dir = app_dir();
        let source_db = dir.path().join("source.db");
        let source = db::connection::open(&source_db).unwrap();
        db::migrations::run(&source).unwrap();
        let target = create_blank(dir.path(), "被占用", &source).unwrap();
        let other = create_blank(dir.path(), "另一个", &source).unwrap();
        seed_deletion(dir.path(), &target, &other, &["only-target"]);
        let store = FakeStore::default();
        store.set("only-target", "key").unwrap();

        // 模拟另一个进程正开着这个数据库
        let holder = db::connection::open(&registry::db_path_of(dir.path(), &target)).unwrap();
        let err = delete_files_with(dir.path(), &target, &[other.clone()], &store)
            .err()
            .expect("deletion must be refused while the database is in use");
        assert!(matches!(err, AppError::Validation(ref msg) if msg.contains("正在被其他程序使用")));
        // 没有任何改动:文件还在、密钥还在
        assert!(registry::db_path_of(dir.path(), &target).is_file());
        assert!(store.exists("only-target").unwrap());
        drop(holder);

        // 占用解除后可以删除
        delete_files_with(dir.path(), &target, &[other.clone()], &store).unwrap();
        assert!(!registry::data_dir_of(dir.path(), &target).exists());
        assert!(!store.exists("only-target").unwrap());
    }
}
