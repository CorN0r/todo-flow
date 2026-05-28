use rusqlite::Connection;
use std::collections::HashMap;

use todo_flow_lib::db::{self, tag_repo, task_repo};
use todo_flow_lib::models::tag::CreateTagRequest;
use todo_flow_lib::models::task::{CreateTaskRequest, ReorderItem, TaskFilter, UpdateTaskRequest};

fn setup() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    db::migrations::run(&conn).unwrap();
    conn
}

fn empty_filter() -> TaskFilter {
    TaskFilter {
        tag_id: None,
        is_completed: None,
        due_date_from: None,
        due_date_to: None,
        search_query: None,
        parent_task_id: None,
        my_day_date: None,
        include_children: None,
    }
}

fn settings_set(conn: &Connection, key: &str, value: &str) {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )
    .unwrap();
}

fn settings_get(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    )
    .ok()
}

fn settings_get_all(conn: &Connection) -> HashMap<String, String> {
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .unwrap();
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0).unwrap(), row.get::<_, String>(1).unwrap())))
        .unwrap();
    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row.unwrap();
        map.insert(k, v);
    }
    map
}

// ─── Task lifecycle ─────────────────────────────────────────

#[test]
fn full_task_lifecycle() {
    let conn = setup();

    let task = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "Integration test".into(),
            description: Some("Testing full flow".into()),
            tag_id: None,
            parent_task_id: None,
            due_date: Some("2026-06-01".into()),
            priority: Some(2),
            reminder: None,
            recurrence: None,
        },
    )
    .unwrap();
    assert_eq!(task.title, "Integration test");
    assert_eq!(task.priority, 2);
    assert!(!task.is_completed);

    let task_id = task.id;

    let detail = task_repo::get_detail(&conn, &task_id)
        .unwrap()
        .expect("task should exist");
    assert_eq!(detail.task.title, "Integration test");
    assert_eq!(detail.task.description, "Testing full flow");

    let updated = task_repo::update(
        &conn,
        &task_id,
        UpdateTaskRequest {
            title: Some("Updated task".into()),
            description: None,
            is_completed: Some(true),
            priority: Some(3),
            due_date: Some("2026-07-01".into()),
            tag_id: None,
            parent_task_id: None,
            reminder: None,
            recurrence: None,
            my_day_date: None,
        },
    )
    .unwrap();
    assert_eq!(updated.title, "Updated task");
    assert_eq!(updated.priority, 3);
    assert!(updated.is_completed);

    task_repo::delete(&conn, &task_id).unwrap();
    assert!(task_repo::get_detail(&conn, &task_id).unwrap().is_none());
}

// ─── Subtask lifecycle ──────────────────────────────────────

#[test]
fn subtask_cascade_and_depth_limit() {
    let conn = setup();

    let parent = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "Parent".into(),
            description: None,
            tag_id: None,
            parent_task_id: None,
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
        },
    )
    .unwrap();

    let child = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "Child".into(),
            description: None,
            tag_id: None,
            parent_task_id: Some(parent.id.clone()),
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
        },
    )
    .unwrap();

    let detail = task_repo::get_detail(&conn, &parent.id)
        .unwrap()
        .expect("parent should exist");
    assert_eq!(detail.children.len(), 1);
    assert_eq!(detail.children[0].title, "Child");

    // 3rd level should be rejected
    let result = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "Grandchild".into(),
            description: None,
            tag_id: None,
            parent_task_id: Some(child.id.clone()),
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
        },
    );
    assert!(result.is_err());

    // Cascade delete
    task_repo::delete(&conn, &parent.id).unwrap();
    assert!(task_repo::get_detail(&conn, &child.id).unwrap().is_none());
}

// ─── Task with tag ──────────────────────────────────────────

#[test]
fn task_with_tag_integration() {
    let conn = setup();

    let tag = tag_repo::create(
        &conn,
        CreateTagRequest {
            name: "Work".into(),
            color: Some("#ff0000".into()),
            icon: None,
            parent_tag_id: None,
        },
    )
    .unwrap();

    let task = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "Work task".into(),
            description: None,
            tag_id: Some(tag.id.clone()),
            parent_task_id: None,
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
        },
    )
    .unwrap();

    let detail = task_repo::get_detail(&conn, &task.id)
        .unwrap()
        .expect("task should exist");
    assert_eq!(detail.task.tag_id, Some(tag.id.clone()));

    let results = task_repo::get_all(
        &conn,
        TaskFilter {
            tag_id: Some(tag.id.clone()),
            ..empty_filter()
        },
    )
    .unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].title, "Work task");

    // ON DELETE SET NULL
    tag_repo::delete(&conn, &tag.id).unwrap();
    let after = task_repo::get_detail(&conn, &task.id)
        .unwrap()
        .expect("task should still exist");
    assert_eq!(after.task.tag_id, None);
}

// ─── Settings ────────────────────────────────────────────────

#[test]
fn settings_read_write() {
    let conn = setup();

    settings_set(&conn, "theme", "dark");
    settings_set(&conn, "language", "en");

    assert_eq!(settings_get(&conn, "theme"), Some("dark".to_string()));

    let all = settings_get_all(&conn);
    assert_eq!(all.get("theme").map(|s| s.as_str()), Some("dark"));
    assert_eq!(all.get("language").map(|s| s.as_str()), Some("en"));

    settings_set(&conn, "theme", "light");
    assert_eq!(settings_get(&conn, "theme"), Some("light".to_string()));
}

// ─── Reorder ─────────────────────────────────────────────────

#[test]
fn task_reorder_preserves_order() {
    let conn = setup();

    let t1 = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "First".into(),
            description: None,
            tag_id: None,
            parent_task_id: None,
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
        },
    )
    .unwrap();

    let t2 = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "Second".into(),
            description: None,
            tag_id: None,
            parent_task_id: None,
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
        },
    )
    .unwrap();

    task_repo::reorder(
        &conn,
        vec![
            ReorderItem { id: t1.id.clone(), sort_order: 1, parent_task_id: None },
            ReorderItem { id: t2.id.clone(), sort_order: 0, parent_task_id: None },
        ],
    )
    .unwrap();

    let tasks = task_repo::get_all(&conn, empty_filter()).unwrap();
    assert_eq!(tasks[0].title, "Second");
    assert_eq!(tasks[1].title, "First");
}

// ─── Validation ──────────────────────────────────────────────

#[test]
fn empty_title_is_rejected() {
    let conn = setup();
    let result = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "  ".into(),
            description: None,
            tag_id: None,
            parent_task_id: None,
            due_date: None,
            priority: None,
            reminder: None,
            recurrence: None,
        },
    );
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("Title cannot be empty"));
}

// ─── Duplicate ───────────────────────────────────────────────

#[test]
fn duplicate_task_deep_copies() {
    let conn = setup();

    let original = task_repo::create(
        &conn,
        CreateTaskRequest {
            title: "Original".into(),
            description: Some("desc".into()),
            tag_id: None,
            parent_task_id: None,
            due_date: Some("2026-08-01".into()),
            priority: Some(4),
            reminder: None,
            recurrence: None,
        },
    )
    .unwrap();

    let dup = task_repo::duplicate(&conn, &original.id).unwrap();
    assert_ne!(dup.id, original.id);
    assert_eq!(dup.title, "Original (copy)");
    assert_eq!(dup.description, "desc");
    assert_eq!(dup.priority, 4);
}

// ─── Tag filtering ───────────────────────────────────────────

#[test]
fn filter_by_tag_id_only_returns_matching_tasks() {
    let conn = setup();

    let tag_a = tag_repo::create(&conn, CreateTagRequest {
        name: "Tag A".into(), color: Some("#ff0000".into()), icon: None, parent_tag_id: None,
    }).unwrap();

    let tag_b = tag_repo::create(&conn, CreateTagRequest {
        name: "Tag B".into(), color: Some("#0000ff".into()), icon: None, parent_tag_id: None,
    }).unwrap();

    task_repo::create(&conn, CreateTaskRequest {
        title: "Task A".into(), description: None,
        tag_id: Some(tag_a.id.clone()), parent_task_id: None,
        due_date: None, priority: None, reminder: None, recurrence: None,
    }).unwrap();

    task_repo::create(&conn, CreateTaskRequest {
        title: "Task B".into(), description: None,
        tag_id: Some(tag_b.id.clone()), parent_task_id: None,
        due_date: None, priority: None, reminder: None, recurrence: None,
    }).unwrap();

    // Unassigned task (no tag)
    task_repo::create(&conn, CreateTaskRequest {
        title: "Unassigned".into(), description: None,
        tag_id: None, parent_task_id: None,
        due_date: None, priority: None, reminder: None, recurrence: None,
    }).unwrap();

    let filter_a = TaskFilter { tag_id: Some(tag_a.id.clone()), ..empty_filter() };
    let results_a = task_repo::get_all(&conn, filter_a).unwrap();
    assert_eq!(results_a.len(), 1, "Tag A should have exactly 1 task");
    assert_eq!(results_a[0].title, "Task A");

    let filter_b = TaskFilter { tag_id: Some(tag_b.id.clone()), ..empty_filter() };
    let results_b = task_repo::get_all(&conn, filter_b).unwrap();
    assert_eq!(results_b.len(), 1, "Tag B should have exactly 1 task");
    assert_eq!(results_b[0].title, "Task B");
}

// ─── Date range filtering ────────────────────────────────────

#[test]
fn filter_by_date_range_only_returns_tasks_in_range() {
    let conn = setup();

    task_repo::create(&conn, CreateTaskRequest {
        title: "Past".into(), description: None,
        tag_id: None, parent_task_id: None,
        due_date: Some("2026-01-01".into()), priority: None,
        reminder: None, recurrence: None,
    }).unwrap();

    task_repo::create(&conn, CreateTaskRequest {
        title: "This week".into(), description: None,
        tag_id: None, parent_task_id: None,
        due_date: Some("2026-06-15".into()), priority: None,
        reminder: None, recurrence: None,
    }).unwrap();

    task_repo::create(&conn, CreateTaskRequest {
        title: "Future".into(), description: None,
        tag_id: None, parent_task_id: None,
        due_date: Some("2026-12-31".into()), priority: None,
        reminder: None, recurrence: None,
    }).unwrap();

    let results = task_repo::get_all(&conn, TaskFilter {
        due_date_from: Some("2026-06-01".into()),
        due_date_to: Some("2026-06-30".into()),
        ..empty_filter()
    }).unwrap();
    assert_eq!(results.len(), 1, "June range should return exactly 1 task");
    assert_eq!(results[0].title, "This week");
}
