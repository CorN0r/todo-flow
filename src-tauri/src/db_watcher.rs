//! 数据库外部变更检测。
//!
//! MCP/CLI 是独立进程,直接写同一个 SQLite 文件,无法触发 Tauri 的
//! `task-changed` 事件。此模块轮询 todo.db / todo.db-wal 的 mtime,
//! 检测到外部写入后 emit `task-changed`,让前端自动刷新。

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};

use rusqlite::Connection;
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_secs(2);

pub fn start_polling(app_handle: AppHandle, db_path: PathBuf, _db: Arc<Mutex<Connection>>) {
    thread::spawn(move || {
        // 启动时静默记录一次,避免刚启动就触发一次空刷新
        let mut last_mtime = max_mtime(&db_path);
        let mut last_emit_mtime: Option<SystemTime> = None;

        loop {
            thread::sleep(POLL_INTERVAL);

            let Some(mtime) = max_mtime(&db_path) else { continue };
            if last_mtime == Some(mtime) {
                continue; // 无变化
            }
            last_mtime = Some(mtime);
            if last_emit_mtime == Some(mtime) {
                continue; // 同一 mtime 只 emit 一次
            }

            // 外部写入 → 通知前端刷新。
            // GUI 自身写入造成的重复 emit 无害:invalidateQueries 幂等,
            // TanStack Query v5 结构共享在数据相同时不会触发重渲染。
            let _ = app_handle.emit("task-changed", ());
            last_emit_mtime = Some(mtime);
        }
    });
}

/// WAL 模式下数据先写 -wal 文件,取 db 与 wal 的 mtime 最大值,
/// 否则外部写入可能落在 -wal 上而漏报。
fn max_mtime(db_path: &Path) -> Option<SystemTime> {
    let mut max = std::fs::metadata(db_path).ok()?.modified().ok()?;
    let wal = db_path.with_extension("db-wal");
    if let Ok(meta) = std::fs::metadata(wal) {
        if let Ok(t) = meta.modified() {
            if t > max {
                max = t;
            }
        }
    }
    Some(max)
}
