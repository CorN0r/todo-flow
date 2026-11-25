//! 文件校验与复制:"添加工作区"与"从备份找回"共用。
//!
//! 全程以只读方式打开源文件——不设 WAL、不跑迁移,保证校验和读取不改动源文件。
//! 需要一份可升级的副本时,用 `VACUUM INTO` 生成一致的单文件副本:源文件带着
//! 未合并的 `-wal`(例如 MCP 进程仍在使用)时也能拿到完整内容。

use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, OpenFlags};

use crate::db;
use crate::error::AppError;

const BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const REQUIRED_TABLES: [&str; 3] = ["tasks", "tags", "settings"];

/// 取出 SQLite 自带的错误说明,拼成用户可读的提示
pub(crate) fn sqlite_message(err: &rusqlite::Error) -> String {
    match err {
        rusqlite::Error::SqliteFailure(_, Some(msg)) => msg.clone(),
        other => other.to_string(),
    }
}

/// 以只读方式打开。文件不存在时直接报错,不会创建空库。
pub fn open_read_only(path: &Path) -> Result<Connection, AppError> {
    if !path.is_file() {
        return Err(AppError::Validation(format!(
            "文件不存在: {}",
            path.display()
        )));
    }
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| AppError::Validation(format!("无法打开文件: {}", sqlite_message(&e))))?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    Ok(conn)
}

/// 校验一个数据库文件:是 TodoFlow 的数据库、通过完整性检查、结构版本不高于
/// 当前应用。通过时返回它的结构版本。全程不写源文件。
pub fn validate_source(path: &Path) -> Result<i32, AppError> {
    let conn = open_read_only(path)?;

    let quick: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|e| {
            AppError::Validation(format!(
                "不是 TodoFlow 的数据库文件,或文件已损坏: {}",
                sqlite_message(&e)
            ))
        })?;
    if quick != "ok" {
        return Err(AppError::Validation(
            "数据库完整性检查未通过,文件可能已损坏".to_string(),
        ));
    }

    let found: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('tasks', 'tags', 'settings')",
        [],
        |row| row.get(0),
    )?;
    if found != REQUIRED_TABLES.len() as i64 {
        return Err(AppError::Validation(
            "不是 TodoFlow 的数据库文件".to_string(),
        ));
    }

    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version > db::migrations::LATEST_USER_VERSION {
        return Err(AppError::Validation(format!(
            "文件由更新版本的应用创建(结构版本 {} > {}),请先升级应用",
            version,
            db::migrations::LATEST_USER_VERSION
        )));
    }
    Ok(version)
}

/// 用只读连接生成一份一致的单文件副本。目标文件不得已存在。
pub fn snapshot_into(src: &Connection, dest: &Path) -> Result<(), AppError> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if dest.exists() {
        return Err(AppError::Validation(format!(
            "目标文件已存在: {}",
            dest.display()
        )));
    }
    src.execute("VACUUM INTO ?1", [dest.to_string_lossy().to_string()])?;
    Ok(())
}

/// 校验源文件并生成一致副本;返回源文件的结构版本。
pub fn copy_snapshot(source: &Path, dest: &Path) -> Result<i32, AppError> {
    let version = validate_source(source)?;
    let conn = open_read_only(source)?;
    snapshot_into(&conn, dest)?;
    Ok(version)
}

/// 一份升级到当前结构的临时副本,读完即删。旧版本备份缺少新字段,
/// 直接读会出错,所以预览和找回都先升级副本、再读副本。
pub struct TempSnapshot {
    pub path: PathBuf,
}

impl Drop for TempSnapshot {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
        if let Some(stem) = self.path.file_stem().and_then(|s| s.to_str()) {
            if let Some(parent) = self.path.parent() {
                for suffix in ["wal", "shm"] {
                    let _ = std::fs::remove_file(parent.join(format!("{}-{}", stem, suffix)));
                }
            }
        }
    }
}

pub fn temp_snapshot(source: &Path) -> Result<TempSnapshot, AppError> {
    validate_source(source)?;
    let dest = std::env::temp_dir().join(format!(
        "todoflow-backup-{}.db",
        uuid::Uuid::new_v4()
    ));
    {
        let conn = open_read_only(source)?;
        snapshot_into(&conn, &dest)?;
    }
    let upgraded = db::connection::open(&dest)
        .map_err(|e| AppError::Generic(format!("无法打开备份副本: {}", e)))?;
    db::migrations::run(&upgraded)
        .map_err(|e| AppError::Generic(format!("升级备份副本失败: {}", e)))?;
    drop(upgraded);
    Ok(TempSnapshot { path: dest })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::task::CreateTaskRequest;

    fn make_db(path: &Path) -> Connection {
        let conn = db::connection::open(path).unwrap();
        db::migrations::run(&conn).unwrap();
        conn
    }

    fn add_task(conn: &Connection, title: &str) {
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
                source: Some("agent".to_string()),
            },
        )
        .unwrap();
    }

    /// (长度, 修改时间, 字节内容):用来证明源文件没被动过
    fn signature(path: &Path) -> (u64, std::time::SystemTime, Vec<u8>) {
        let meta = std::fs::metadata(path).unwrap();
        (
            meta.len(),
            meta.modified().unwrap(),
            std::fs::read(path).unwrap(),
        )
    }

    #[test]
    fn validates_todo_flow_database() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("todo.db");
        let conn = make_db(&path);
        add_task(&conn, "任务");
        drop(conn);
        assert_eq!(validate_source(&path).unwrap(), db::migrations::LATEST_USER_VERSION);
    }

    #[test]
    fn missing_file_is_rejected_and_not_created() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("missing.db");
        let err = open_read_only(&path).unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
        assert!(validate_source(&path).is_err());
        assert!(!path.exists());
    }

    #[test]
    fn non_database_file_is_rejected() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("notes.txt");
        std::fs::write(&path, b"hello, this is not a database").unwrap();
        let err = validate_source(&path).unwrap_err();
        assert!(matches!(err, AppError::Validation(ref msg) if msg.contains("不是 TodoFlow")));
    }

    #[test]
    fn newer_schema_version_is_rejected() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("todo.db");
        let conn = make_db(&path);
        conn.pragma_update(
            None,
            "user_version",
            db::migrations::LATEST_USER_VERSION + 1,
        )
        .unwrap();
        drop(conn);
        let err = validate_source(&path).unwrap_err();
        assert!(matches!(err, AppError::Validation(ref msg) if msg.contains("升级应用")));
    }

    #[test]
    fn corrupted_database_is_rejected() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("todo.db");
        let conn = make_db(&path);
        add_task(&conn, "任务");
        drop(conn);
        // 保留文件头,把第一页(系统表所在)的其余内容清零
        let mut bytes = std::fs::read(&path).unwrap();
        for byte in bytes.iter_mut().skip(100).take(4000) {
            *byte = 0;
        }
        std::fs::write(&path, &bytes).unwrap();
        assert!(validate_source(&path).is_err());
    }

    #[test]
    fn copy_leaves_source_untouched() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("backup.db");
        let dest = tmp.path().join("copy").join("todo.db");
        let conn = make_db(&src);
        add_task(&conn, "写周报");
        drop(conn);
        let before = signature(&src);

        let version = copy_snapshot(&src, &dest).unwrap();
        assert_eq!(version, db::migrations::LATEST_USER_VERSION);
        assert_eq!(signature(&src), before);
        assert_ne!(signature(&dest).2, before.2);

        let copied = db::connection::open(&dest).unwrap();
        let count: i64 = copied
            .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn snapshot_includes_uncheckpointed_wal() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("live.db");
        let dest = tmp.path().join("copy.db");
        // 模拟一个仍在使用该文件的进程:连接不关、WAL 不合并
        let writer = make_db(&src);
        writer
            .execute_batch("PRAGMA wal_autocheckpoint = 0;")
            .unwrap();
        add_task(&writer, "只在 WAL 里的任务");
        assert!(tmp.path().join("live.db-wal").is_file());

        copy_snapshot(&src, &dest).unwrap();

        let copied = db::connection::open(&dest).unwrap();
        let count: i64 = copied
            .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        // 源库未被改动,仍可继续使用
        add_task(&writer, "下一条");
    }

    #[test]
    fn snapshot_refuses_to_overwrite() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src.db");
        let dest = tmp.path().join("dest.db");
        drop(make_db(&src));
        std::fs::write(&dest, b"keep me").unwrap();
        assert!(copy_snapshot(&src, &dest).is_err());
        assert_eq!(std::fs::read(&dest).unwrap(), b"keep me");
    }

    #[test]
    fn temp_snapshot_upgrades_older_backup_and_cleans_up() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("old-backup.db");
        let conn = make_db(&src);
        add_task(&conn, "旧备份里的任务");
        // 模拟旧版本:没有来源标记字段,结构版本停在加这个字段之前
        conn.execute_batch(
            "ALTER TABLE tasks DROP COLUMN source;
             PRAGMA user_version = 15;",
        )
        .unwrap();
        drop(conn);

        let snapshot = temp_snapshot(&src).unwrap();
        assert!(snapshot.path.is_file());
        {
            let upgraded = db::connection::open(&snapshot.path).unwrap();
            let version: i32 = upgraded
                .pragma_query_value(None, "user_version", |r| r.get(0))
                .unwrap();
            assert_eq!(version, db::migrations::LATEST_USER_VERSION);
            let sources: i64 = upgraded
                .query_row("SELECT COUNT(source) FROM tasks", [], |r| r.get(0))
                .unwrap();
            assert_eq!(sources, 0);
            let titles: String = upgraded
                .query_row("SELECT title FROM tasks", [], |r| r.get(0))
                .unwrap();
            assert_eq!(titles, "旧备份里的任务");
        }
        // 原备份保持旧版本
        let original = db::connection::open(&src).unwrap();
        let version: i32 = original
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(version, 15);

        let path = snapshot.path.clone();
        drop(snapshot);
        assert!(!path.exists());
    }

    #[test]
    fn temp_snapshot_rejects_invalid_file() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("bad.db");
        std::fs::write(&src, b"not a db").unwrap();
        assert!(temp_snapshot(&src).is_err());
    }
}
