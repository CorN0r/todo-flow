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
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
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
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
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

    Ok(())
}
