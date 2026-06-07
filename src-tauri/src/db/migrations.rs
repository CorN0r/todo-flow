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
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS habit_logs (
                id          TEXT PRIMARY KEY,
                habit_id    TEXT NOT NULL,
                log_date    TEXT NOT NULL,
                count       INTEGER NOT NULL DEFAULT 1,
                note        TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
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
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
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

    Ok(())
}
