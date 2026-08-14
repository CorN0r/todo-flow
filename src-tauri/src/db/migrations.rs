use rusqlite::Connection;

pub fn run(conn: &Connection) -> Result<(), rusqlite::Error> {
    let current_version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if current_version < 1 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS lists (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                color       TEXT NOT NULL DEFAULT '#6366f1',
                icon        TEXT NOT NULL DEFAULT 'list',
                sort_order  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id              TEXT PRIMARY KEY,
                title           TEXT NOT NULL,
                description     TEXT NOT NULL DEFAULT '',
                is_completed    INTEGER NOT NULL DEFAULT 0,
                is_archived     INTEGER NOT NULL DEFAULT 0,
                priority        INTEGER NOT NULL DEFAULT 0,
                due_date        TEXT,
                reminder        TEXT,
                list_id         TEXT,
                parent_task_id  TEXT,
                sort_order      INTEGER NOT NULL DEFAULT 0,
                recurrence      TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL,
                FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS attachments (
                id              TEXT PRIMARY KEY,
                task_id         TEXT NOT NULL,
                original_name   TEXT NOT NULL,
                storage_name    TEXT NOT NULL,
                mime_type       TEXT NOT NULL,
                file_size       INTEGER NOT NULL,
                thumbnail_name  TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_list_id        ON tasks(list_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_due_date       ON tasks(due_date);
            CREATE INDEX IF NOT EXISTS idx_tasks_is_completed   ON tasks(is_completed);
            CREATE INDEX IF NOT EXISTS idx_tasks_list_completed ON tasks(list_id, is_completed);
            CREATE INDEX IF NOT EXISTS idx_attachments_task_id  ON attachments(task_id);",
        )?;

        conn.pragma_update(None, "user_version", 1)?;
    }

    if current_version < 2 {
        conn.execute_batch(
            "ALTER TABLE tasks ADD COLUMN my_day_date TEXT;

            CREATE INDEX IF NOT EXISTS idx_tasks_my_day ON tasks(my_day_date);",
        )?;
        conn.pragma_update(None, "user_version", 2)?;
    }

    if current_version < 3 {
        conn.execute_batch(
            "ALTER TABLE tasks ADD COLUMN reminded INTEGER NOT NULL DEFAULT 0;
             CREATE INDEX IF NOT EXISTS idx_tasks_reminder ON tasks(reminder);",
        )?;
        conn.pragma_update(None, "user_version", 3)?;
    }

    if current_version < 4 {
        conn.execute_batch(
            "DROP INDEX IF EXISTS idx_tasks_list_id;
             DROP INDEX IF EXISTS idx_tasks_list_completed;
             ALTER TABLE lists RENAME TO tags;
             ALTER TABLE tasks RENAME COLUMN list_id TO tag_id;
             CREATE INDEX IF NOT EXISTS idx_tasks_tag_id        ON tasks(tag_id);
             CREATE INDEX IF NOT EXISTS idx_tasks_tag_completed ON tasks(tag_id, is_completed);",
        )?;
        conn.pragma_update(None, "user_version", 4)?;
    }

    if current_version < 5 {
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
             CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_unique ON tags(name);",
        )?;
        conn.pragma_update(None, "user_version", 5)?;
    }

    if current_version < 6 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS habits (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                color       TEXT NOT NULL DEFAULT '#7C72F6',
                icon        TEXT NOT NULL DEFAULT 'check-circle',
                frequency   TEXT NOT NULL DEFAULT 'daily',
                target_count INTEGER NOT NULL DEFAULT 1,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS habit_logs (
                id          TEXT PRIMARY KEY,
                habit_id    TEXT NOT NULL,
                log_date    TEXT NOT NULL,
                count       INTEGER NOT NULL DEFAULT 1,
                note        TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
                UNIQUE(habit_id, log_date)
            );

            CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs(habit_id);
            CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(log_date);",
        )?;
        conn.pragma_update(None, "user_version", 6)?;
    }

    if current_version < 7 {
        conn.execute_batch(
            "ALTER TABLE tags ADD COLUMN parent_tag_id TEXT REFERENCES tags(id) ON DELETE SET NULL;
             CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_tag_id);",
        )?;
        conn.pragma_update(None, "user_version", 7)?;
    }

    if current_version < 8 {
        conn.execute_batch(
            "ALTER TABLE tasks ADD COLUMN is_suspended INTEGER NOT NULL DEFAULT 0;
             ALTER TABLE tasks ADD COLUMN is_abandoned INTEGER NOT NULL DEFAULT 0;
             CREATE INDEX IF NOT EXISTS idx_tasks_is_suspended ON tasks(is_suspended);
             CREATE INDEX IF NOT EXISTS idx_tasks_is_abandoned ON tasks(is_abandoned);",
        )?;
        conn.pragma_update(None, "user_version", 8)?;
    }

    if current_version < 9 {
        conn.execute_batch(
            "ALTER TABLE tasks ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
             CREATE INDEX IF NOT EXISTS idx_tasks_is_pinned ON tasks(is_pinned);",
        )?;
        conn.pragma_update(None, "user_version", 9)?;
    }

    if current_version < 10 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS task_reminders (
                id              TEXT PRIMARY KEY,
                task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                offset          TEXT NOT NULL,
                reminder_time   TEXT NOT NULL,
                reminded        INTEGER NOT NULL DEFAULT 0,
                created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE INDEX IF NOT EXISTS idx_task_reminders_task ON task_reminders(task_id);
            CREATE INDEX IF NOT EXISTS idx_task_reminders_time ON task_reminders(reminder_time, reminded);

            INSERT INTO task_reminders (id, task_id, offset, reminder_time, reminded)
            SELECT hex(randomblob(16)),
                   id,
                   CASE
                       WHEN due_date IS NOT NULL AND reminder IS NOT NULL AND reminder = due_date || ' 09:00' THEN '0m'
                       WHEN reminder IS NOT NULL THEN 'custom:' || reminder
                       ELSE 'custom:'
                   END,
                   CASE
                       WHEN reminder IS NOT NULL AND reminder LIKE '____-__-__T__:__' THEN replace(reminder, 'T', ' ')
                       ELSE reminder
                   END,
                   reminded
            FROM tasks
            WHERE reminder IS NOT NULL AND reminder != '';",
        )?;
        conn.pragma_update(None, "user_version", 10)?;
    }

    if current_version < 11 {
        let default_shortcuts = r#"{"global-show-window":{"keys":"Ctrl+Shift+T","enabled":true},"command-palette":{"keys":"Ctrl+K","enabled":true},"toggle-sidebar":{"keys":"Ctrl+B","enabled":true},"new-task":{"keys":"N","enabled":true}}"#;
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('keyboard_shortcuts', ?1)",
            rusqlite::params![default_shortcuts],
        )?;
        conn.pragma_update(None, "user_version", 11)?;
    }

    // v12: Convert existing UTC timestamps to local time
    if current_version < 12 {
        // Convert tasks created_at and updated_at from UTC to local time
        conn.execute(
            "UPDATE tasks SET created_at = datetime(created_at, 'localtime'), updated_at = datetime(updated_at, 'localtime')",
            [],
        )?;
        // Convert tags created_at and updated_at
        conn.execute(
            "UPDATE tags SET created_at = datetime(created_at, 'localtime'), updated_at = datetime(updated_at, 'localtime')",
            [],
        )?;
        // Convert habits created_at and updated_at
        conn.execute(
            "UPDATE habits SET created_at = datetime(created_at, 'localtime'), updated_at = datetime(updated_at, 'localtime')",
            [],
        )?;
        // Convert habit_logs created_at
        conn.execute(
            "UPDATE habit_logs SET created_at = datetime(created_at, 'localtime')",
            [],
        )?;
        // Convert task_reminders created_at
        conn.execute(
            "UPDATE task_reminders SET created_at = datetime(created_at, 'localtime')",
            [],
        )?;
        // Convert attachments created_at
        conn.execute(
            "UPDATE attachments SET created_at = datetime(created_at, 'localtime')",
            [],
        )?;

        conn.pragma_update(None, "user_version", 12)?;
    }

    if current_version < 13 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sync_meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_operations (
                op_id          TEXT PRIMARY KEY,
                entity_type    TEXT NOT NULL,
                entity_id      TEXT NOT NULL,
                operation      TEXT NOT NULL,
                base_revision  INTEGER,
                payload        TEXT NOT NULL,
                client_time    TEXT NOT NULL,
                device_id      TEXT NOT NULL,
                status         TEXT NOT NULL DEFAULT 'pending',
                retry_count    INTEGER NOT NULL DEFAULT 0,
                last_error     TEXT,
                created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                CHECK(entity_type IN ('task', 'task_reminder', 'tag', 'attachment', 'habit', 'habit_log', 'setting')),
                CHECK(operation IN ('create', 'update', 'reorder', 'delete')),
                CHECK(status IN ('pending', 'syncing', 'acked', 'failed'))
            );

            CREATE TABLE IF NOT EXISTS sync_conflicts (
                id             TEXT PRIMARY KEY,
                entity_type    TEXT NOT NULL,
                entity_id      TEXT NOT NULL,
                local_payload  TEXT NOT NULL,
                remote_payload TEXT NOT NULL,
                created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                resolved_at    TEXT,
                CHECK(entity_type IN ('task', 'task_reminder', 'tag', 'attachment', 'habit', 'habit_log', 'setting'))
            );

            ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
            ALTER TABLE tasks ADD COLUMN server_revision INTEGER;
            ALTER TABLE tasks ADD COLUMN local_revision INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE tasks ADD COLUMN last_modified_device_id TEXT;
            ALTER TABLE tasks ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'clean';

            ALTER TABLE task_reminders ADD COLUMN deleted_at TEXT;
            ALTER TABLE task_reminders ADD COLUMN server_revision INTEGER;
            ALTER TABLE task_reminders ADD COLUMN local_revision INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE task_reminders ADD COLUMN last_modified_device_id TEXT;
            ALTER TABLE task_reminders ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'clean';

            ALTER TABLE tags ADD COLUMN deleted_at TEXT;
            ALTER TABLE tags ADD COLUMN server_revision INTEGER;
            ALTER TABLE tags ADD COLUMN local_revision INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE tags ADD COLUMN last_modified_device_id TEXT;
            ALTER TABLE tags ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'clean';

            ALTER TABLE attachments ADD COLUMN deleted_at TEXT;
            ALTER TABLE attachments ADD COLUMN server_revision INTEGER;
            ALTER TABLE attachments ADD COLUMN local_revision INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE attachments ADD COLUMN last_modified_device_id TEXT;
            ALTER TABLE attachments ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'clean';

            ALTER TABLE habits ADD COLUMN deleted_at TEXT;
            ALTER TABLE habits ADD COLUMN server_revision INTEGER;
            ALTER TABLE habits ADD COLUMN local_revision INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE habits ADD COLUMN last_modified_device_id TEXT;
            ALTER TABLE habits ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'clean';

            ALTER TABLE habit_logs ADD COLUMN deleted_at TEXT;
            ALTER TABLE habit_logs ADD COLUMN server_revision INTEGER;
            ALTER TABLE habit_logs ADD COLUMN local_revision INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE habit_logs ADD COLUMN last_modified_device_id TEXT;
            ALTER TABLE habit_logs ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'clean';

            ALTER TABLE settings ADD COLUMN deleted_at TEXT;
            ALTER TABLE settings ADD COLUMN server_revision INTEGER;
            ALTER TABLE settings ADD COLUMN local_revision INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE settings ADD COLUMN last_modified_device_id TEXT;
            ALTER TABLE settings ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'clean';

            CREATE INDEX IF NOT EXISTS idx_sync_operations_status ON sync_operations(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_sync_operations_entity ON sync_operations(entity_type, entity_id);
            CREATE INDEX IF NOT EXISTS idx_sync_conflicts_entity ON sync_conflicts(entity_type, entity_id, resolved_at);
            CREATE INDEX IF NOT EXISTS idx_tasks_sync_status ON tasks(sync_status);
            CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
            CREATE INDEX IF NOT EXISTS idx_task_reminders_sync_status ON task_reminders(sync_status);
            CREATE INDEX IF NOT EXISTS idx_tags_sync_status ON tags(sync_status);
            CREATE INDEX IF NOT EXISTS idx_attachments_sync_status ON attachments(sync_status);
            CREATE INDEX IF NOT EXISTS idx_habits_sync_status ON habits(sync_status);
            CREATE INDEX IF NOT EXISTS idx_habit_logs_sync_status ON habit_logs(sync_status);
            CREATE INDEX IF NOT EXISTS idx_settings_sync_status ON settings(sync_status);",
        )?;
        conn.pragma_update(None, "user_version", 13)?;
    }

    // v14: 任务多标签关联表(多对多)
    if current_version < 14 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS task_tags (
                task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (task_id, tag_id)
            );
            CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id);
            INSERT OR IGNORE INTO task_tags (task_id, tag_id)
                SELECT id, tag_id FROM tasks WHERE tag_id IS NOT NULL AND tag_id != '';",
        )?;
        conn.pragma_update(None, "user_version", 14)?;
    }

    // v15: 任务桌面便签(与任务 1:1,记录窗口位置/皮肤;不进 sync 系统)
    if current_version < 15 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS task_notes (
                task_id       TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
                x             INTEGER,
                y             INTEGER,
                width         INTEGER NOT NULL DEFAULT 280,
                height        INTEGER NOT NULL DEFAULT 300,
                always_on_top INTEGER NOT NULL DEFAULT 0,
                style         TEXT NOT NULL DEFAULT 'glass',
                collapsed     INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );",
        )?;
        conn.pragma_update(None, "user_version", 15)?;
    }

    // v16: 任务来源标记(source = 'agent' 表示由 Agent/MCP 创建,其余为 NULL)
    if current_version < 16 {
        conn.execute_batch("ALTER TABLE tasks ADD COLUMN source TEXT;")?;
        conn.pragma_update(None, "user_version", 16)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table_count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |row| {
            row.get(0)
        })
        .unwrap()
    }

    fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({})", table))
            .unwrap();
        let columns = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        columns.iter().any(|name| name == column)
    }

    fn create_v12_database(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                icon TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                parent_tag_id TEXT
            );

            CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_completed INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                priority INTEGER NOT NULL DEFAULT 0,
                due_date TEXT,
                reminder TEXT,
                tag_id TEXT,
                parent_task_id TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                recurrence TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                my_day_date TEXT,
                reminded INTEGER NOT NULL DEFAULT 0,
                is_suspended INTEGER NOT NULL DEFAULT 0,
                is_abandoned INTEGER NOT NULL DEFAULT 0,
                is_pinned INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE task_reminders (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                offset TEXT NOT NULL,
                reminder_time TEXT NOT NULL,
                reminded INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE attachments (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                original_name TEXT NOT NULL,
                storage_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                thumbnail_name TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE habits (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                icon TEXT NOT NULL,
                frequency TEXT NOT NULL,
                target_count INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE habit_logs (
                id TEXT PRIMARY KEY,
                habit_id TEXT NOT NULL,
                log_date TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 1,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            INSERT INTO tags (id, name, color, icon, created_at, updated_at)
            VALUES ('tag-1', 'Work', '#7C72F6', 'tag', '2026-07-06 00:00:00', '2026-07-06 00:00:00');
            INSERT INTO tasks (id, title, created_at, updated_at, tag_id)
            VALUES ('task-1', 'Keep me', '2026-07-06 00:00:00', '2026-07-06 00:00:00', 'tag-1');
            INSERT INTO task_reminders (id, task_id, offset, reminder_time, created_at)
            VALUES ('reminder-1', 'task-1', '0m', '2026-07-06 08:00', '2026-07-06 00:00:00');
            INSERT INTO attachments (id, task_id, original_name, storage_name, mime_type, file_size, created_at)
            VALUES ('attachment-1', 'task-1', 'a.txt', 'a.txt', 'text/plain', 1, '2026-07-06 00:00:00');
            INSERT INTO habits (id, name, color, icon, frequency, created_at, updated_at)
            VALUES ('habit-1', 'Read', '#10B981', 'book', 'daily', '2026-07-06 00:00:00', '2026-07-06 00:00:00');
            INSERT INTO habit_logs (id, habit_id, log_date, count, created_at)
            VALUES ('habit-log-1', 'habit-1', '2026-07-06', 1, '2026-07-06 00:00:00');
            INSERT INTO settings (key, value) VALUES ('theme', 'dark');

            PRAGMA user_version = 12;",
        )
        .unwrap();
    }

    #[test]
    fn upgrades_v12_database_to_sync_schema_without_losing_rows() {
        let conn = Connection::open_in_memory().unwrap();
        create_v12_database(&conn);

        run(&conn).unwrap();

        let version: i32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 16);

        assert_eq!(table_count(&conn, "task_tags"), 1);
        // 迁移:task-1 的 tag-1 已写入关联表
        let linked: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM task_tags WHERE task_id = 'task-1' AND tag_id = 'tag-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(linked, 1);

        assert_eq!(table_count(&conn, "tasks"), 1);
        assert_eq!(table_count(&conn, "task_reminders"), 1);
        assert_eq!(table_count(&conn, "tags"), 1);
        assert_eq!(table_count(&conn, "attachments"), 1);
        assert_eq!(table_count(&conn, "habits"), 1);
        assert_eq!(table_count(&conn, "habit_logs"), 1);
        assert_eq!(table_count(&conn, "settings"), 1);

        assert!(column_exists(&conn, "tasks", "sync_status"));
        assert!(column_exists(&conn, "task_reminders", "deleted_at"));
        assert!(column_exists(&conn, "tags", "local_revision"));
        assert!(column_exists(&conn, "attachments", "server_revision"));
        assert!(column_exists(&conn, "habits", "last_modified_device_id"));
        assert!(column_exists(&conn, "habit_logs", "sync_status"));
        assert!(column_exists(&conn, "settings", "sync_status"));

        assert_eq!(table_count(&conn, "sync_meta"), 0);
        assert_eq!(table_count(&conn, "sync_operations"), 0);
        assert_eq!(table_count(&conn, "sync_conflicts"), 0);

        assert!(column_exists(&conn, "task_notes", "style"));
        assert_eq!(table_count(&conn, "task_notes"), 0);

        assert!(column_exists(&conn, "tasks", "source"));
    }
}
