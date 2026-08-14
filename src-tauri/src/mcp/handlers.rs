//! MCP 工具与 CLI 共享的纯函数业务层。
//!
//! 所有函数只依赖 `&rusqlite::Connection`,可直接在内存库上单测,
//! 与 Tauri / MCP 协议完全解耦。

use chrono::Local;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::db::{reminder_repo, tag_repo, task_repo};
use crate::error::AppError;
use crate::models::task_reminder::CreateReminderRequest;
use crate::models::tag::CreateTagRequest;
use crate::models::task::{CreateTaskRequest, TaskFilter, UpdateTaskRequest};

use super::{CreateTagParams, CreateTaskParams, GetTaskParams, ListTasksParams, UpdateTaskParams};

/// 标签名 → id;不存在则自动创建(默认颜色)。写路径专用。
pub fn resolve_tag_id(conn: &Connection, name: &str) -> Result<String, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("标签名不能为空".to_string()));
    }
    if let Some(tag) = tag_repo::get_by_name(conn, trimmed)? {
        return Ok(tag.id);
    }
    let tag = tag_repo::create(
        conn,
        CreateTagRequest {
            name: trimmed.to_string(),
            color: None, // None = 自动调色板取色
            icon: None,
            parent_tag_id: None,
        },
    )?;
    Ok(tag.id)
}

/// 由 due_date + 提前分钟数 → "custom:YYYY-MM-DD HH:mm" offset。
/// 仅日期时按 09:00 计算,含时间时按该时间计算(与 GUI 预设语义一致)。
fn reminder_offset_from_due(due_date: &str, minutes_before: i64) -> Result<String, AppError> {
    use chrono::{NaiveDate, NaiveDateTime};
    let base = if due_date.len() > 10 {
        NaiveDateTime::parse_from_str(due_date, "%Y-%m-%d %H:%M")
            .map_err(|_| AppError::Validation(format!("due_date 格式不正确: {due_date}")))?
    } else {
        let date = NaiveDate::parse_from_str(due_date, "%Y-%m-%d")
            .map_err(|_| AppError::Validation(format!("due_date 格式不正确: {due_date}")))?;
        date.and_hms_opt(9, 0, 0).unwrap()
    };
    let rem = base - chrono::Duration::minutes(minutes_before.max(0));
    Ok(format!("custom:{}", rem.format("%Y-%m-%d %H:%M")))
}

pub fn create_task(conn: &Connection, p: &CreateTaskParams) -> Result<Value, AppError> {
    if p.title.trim().is_empty() {
        return Err(AppError::Validation("标题不能为空".to_string()));
    }
    let mut tag_ids = p.tag_ids.clone().unwrap_or_default();
    if let Some(names) = &p.tag_names {
        for name in names {
            let id = resolve_tag_id(conn, name)?;
            if !tag_ids.contains(&id) {
                tag_ids.push(id);
            }
        }
    }
    let my_day_date = match p.my_day {
        Some(true) => Some(Local::now().format("%Y-%m-%d").to_string()),
        _ => None,
    };
    let task = task_repo::create(
        conn,
        CreateTaskRequest {
            title: p.title.clone(),
            description: p.description.clone(),
            tag_ids: if tag_ids.is_empty() { None } else { Some(tag_ids) },
            parent_task_id: p.parent_task_id.clone(),
            due_date: p.due_date.clone(),
            priority: p.priority,
            reminder: None,
            recurrence: None,
            my_day_date,
            source: Some("agent".to_string()),
        },
    )?;
    if let (Some(minutes), Some(due)) = (p.remind_minutes_before, &p.due_date) {
        if minutes > 0 {
            let offset = reminder_offset_from_due(due, minutes)?;
            reminder_repo::create_reminder(
                conn,
                CreateReminderRequest {
                    task_id: task.id.clone(),
                    offset,
                    due_date: Some(due.clone()),
                },
            )?;
        }
    }
    serde_json::to_value(&task).map_err(|e| AppError::Generic(format!("序列化失败: {e}")))
}

pub fn list_tasks(conn: &Connection, p: &ListTasksParams) -> Result<Value, AppError> {
    let mut tag_ids = p.tag_ids.clone().unwrap_or_default();
    if let Some(names) = &p.tag_names {
        for name in names {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                continue;
            }
            // 未知标签名:静默忽略(查询工具不产生副作用)
            if let Some(tag) = tag_repo::get_by_name(conn, trimmed)? {
                if !tag_ids.contains(&tag.id) {
                    tag_ids.push(tag.id);
                }
            }
        }
    }
    let filter = TaskFilter {
        tag_ids: if tag_ids.is_empty() { None } else { Some(tag_ids) },
        is_completed: p.completed,
        due_date_from: p.due_from.clone(),
        due_date_to: p.due_to.clone(),
        search_query: p.search_keyword.clone(),
        parent_task_id: p.parent_task_id.clone(),
        my_day_date: None,
        priority: None,
        is_suspended: None,
        is_abandoned: None,
        include_children: p.include_children,
        include_archived: Some(false),
    };
    let tasks = task_repo::get_all(conn, filter)?;
    let total = tasks.len();
    let shown = match p.limit {
        Some(n) if n > 0 => tasks.into_iter().take(n as usize).collect::<Vec<_>>(),
        _ => tasks,
    };
    Ok(json!({ "count": total, "tasks": shown }))
}

pub fn get_task(conn: &Connection, p: &GetTaskParams) -> Result<Value, AppError> {
    let detail = task_repo::get_detail(conn, &p.id)?
        .ok_or_else(|| AppError::NotFound(format!("任务 {} 不存在", p.id)))?;
    Ok(json!({ "task": detail.task, "children": detail.children }))
}

pub fn update_task(conn: &Connection, p: &UpdateTaskParams) -> Result<Value, AppError> {
    let tag_ids = match (&p.tag_ids, &p.tag_names) {
        (None, None) => None,
        _ => {
            let mut ids = p.tag_ids.clone().unwrap_or_default();
            if let Some(names) = &p.tag_names {
                for name in names {
                    let id = resolve_tag_id(conn, name)?;
                    if !ids.contains(&id) {
                        ids.push(id);
                    }
                }
            }
            Some(ids) // 显式传入 → 整体替换既有标签(repo 语义)
        }
    };
    let my_day_date = match p.my_day {
        None => None,
        Some(true) => Some(Some(Local::now().format("%Y-%m-%d").to_string())),
        Some(false) => Some(None),
    };
    let task = task_repo::update(
        conn,
        &p.id,
        UpdateTaskRequest {
            title: p.title.clone(),
            description: p.description.clone(),
            is_completed: p.is_completed,
            priority: p.priority,
            due_date: p.due_date.clone(),
            tag_ids,
            parent_task_id: p.parent_task_id.clone(), // Option<Option<String>>:null = 清除父级
            reminder: None,
            recurrence: None,
            my_day_date,
            is_suspended: p.is_suspended,
            is_abandoned: p.is_abandoned,
            is_pinned: p.is_pinned,
        },
    )?;
    serde_json::to_value(&task).map_err(|e| AppError::Generic(format!("序列化失败: {e}")))
}

fn complete_inner(conn: &Connection, id: &str, completed: bool) -> Result<Value, AppError> {
    let task = task_repo::update(
        conn,
        id,
        UpdateTaskRequest {
            title: None,
            description: None,
            is_completed: Some(completed),
            priority: None,
            due_date: None,
            tag_ids: None,
            parent_task_id: None,
            reminder: None,
            recurrence: None,
            my_day_date: None,
            is_suspended: None,
            is_abandoned: None,
            is_pinned: None,
        },
    )?;
    serde_json::to_value(&task).map_err(|e| AppError::Generic(format!("序列化失败: {e}")))
}

pub fn complete_task(conn: &Connection, p: &GetTaskParams) -> Result<Value, AppError> {
    complete_inner(conn, &p.id, true)
}

pub fn reopen_task(conn: &Connection, p: &GetTaskParams) -> Result<Value, AppError> {
    complete_inner(conn, &p.id, false)
}

pub fn delete_task(conn: &Connection, p: &GetTaskParams) -> Result<Value, AppError> {
    task_repo::delete(conn, &p.id)?;
    Ok(json!({ "deleted": true, "id": p.id }))
}

pub fn list_tags(conn: &Connection) -> Result<Value, AppError> {
    let tags = tag_repo::get_all_with_counts(conn)?;
    serde_json::to_value(&tags).map_err(|e| AppError::Generic(format!("序列化失败: {e}")))
}

pub fn create_tag(conn: &Connection, p: &CreateTagParams) -> Result<Value, AppError> {
    let tag = tag_repo::create(
        conn,
        CreateTagRequest {
            name: p.name.clone(),
            color: p.color.clone(),
            icon: None,
            parent_tag_id: p.parent_tag_id.clone(),
        },
    )?;
    serde_json::to_value(&tag).map_err(|e| AppError::Generic(format!("序列化失败: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    fn create_params(title: &str) -> CreateTaskParams {
        CreateTaskParams {
            title: title.to_string(),
            description: None,
            priority: None,
            due_date: None,
            tag_names: None,
            tag_ids: None,
            parent_task_id: None,
            my_day: None,
            remind_minutes_before: None,
        }
    }

    #[test]
    fn test_resolve_tag_id_auto_creates() {
        let conn = setup();
        let id = resolve_tag_id(&conn, "工作").unwrap();
        let again = resolve_tag_id(&conn, "工作").unwrap();
        assert_eq!(id, again); // 幂等
        assert!(tag_repo::get_by_name(&conn, "工作").unwrap().is_some());
    }

    #[test]
    fn test_resolve_tag_id_empty_name() {
        let conn = setup();
        assert!(resolve_tag_id(&conn, "  ").is_err());
    }

    #[test]
    fn test_create_task_full_fields() {
        let conn = setup();
        let value = create_task(
            &conn,
            &CreateTaskParams {
                title: "写周报".to_string(),
                description: Some("<p>本周总结</p>".to_string()),
                priority: Some(3),
                due_date: Some("2026-08-14".to_string()),
                tag_names: Some(vec!["工作".to_string(), "日常".to_string()]),
                my_day: Some(true),
                remind_minutes_before: Some(30),
                ..create_params("")
            },
        )
        .unwrap();
        let task: crate::models::task::Task = serde_json::from_value(value).unwrap();
        assert_eq!(task.title, "写周报");
        assert_eq!(task.priority, 3);
        assert_eq!(task.due_date.as_deref(), Some("2026-08-14"));
        assert_eq!(task.tag_ids.len(), 2);
        assert!(task.my_day_date.is_some());
        assert_eq!(task.source.as_deref(), Some("agent"));
        // 提醒已写入 task_reminders
        let reminders = reminder_repo::get_reminders_for_task(&conn, &task.id).unwrap();
        assert_eq!(reminders.len(), 1);
        assert_eq!(reminders[0].offset, "custom:2026-08-14 08:30"); // 09:00 - 30min
    }

    #[test]
    fn test_create_task_empty_title() {
        let conn = setup();
        assert!(create_task(&conn, &create_params("   ")).is_err());
    }

    #[test]
    fn test_list_tasks_filters() {
        let conn = setup();
        create_task(
            &conn,
            &CreateTaskParams {
                title: "A".to_string(),
                priority: Some(4),
                due_date: Some("2026-08-10".to_string()),
                tag_names: Some(vec!["工作".to_string()]),
                ..create_params("")
            },
        )
        .unwrap();
        create_task(
            &conn,
            &CreateTaskParams {
                title: "B".to_string(),
                due_date: Some("2026-08-20".to_string()),
                tag_names: Some(vec!["生活".to_string()]),
                ..create_params("")
            },
        )
        .unwrap();

        // 按标签名过滤
        let v = list_tasks(
            &conn,
            &ListTasksParams {
                completed: None,
                tag_names: Some(vec!["工作".to_string()]),
                tag_ids: None,
                search_keyword: None,
                due_from: None,
                due_to: None,
                parent_task_id: None,
                include_children: None,
                limit: None,
            },
        )
        .unwrap();
        assert_eq!(v["count"], 1);
        assert_eq!(v["tasks"][0]["title"], "A");

        // 未知标签名静默忽略 → 返回全部
        let v = list_tasks(
            &conn,
            &ListTasksParams {
                tag_names: Some(vec!["不存在的标签".to_string()]),
                ..list_default()
            },
        )
        .unwrap();
        assert_eq!(v["count"], 2);

        // 日期范围
        let v = list_tasks(
            &conn,
            &ListTasksParams {
                due_from: Some("2026-08-15".to_string()),
                ..list_default()
            },
        )
        .unwrap();
        assert_eq!(v["count"], 1);
        assert_eq!(v["tasks"][0]["title"], "B");

        // limit 截断且 count 为全量
        let v = list_tasks(&conn, &ListTasksParams { limit: Some(1), ..list_default() }).unwrap();
        assert_eq!(v["count"], 2);
        assert_eq!(v["tasks"].as_array().unwrap().len(), 1);
    }

    fn list_default() -> ListTasksParams {
        ListTasksParams {
            completed: None,
            tag_names: None,
            tag_ids: None,
            search_keyword: None,
            due_from: None,
            due_to: None,
            parent_task_id: None,
            include_children: None,
            limit: None,
        }
    }

    #[test]
    fn test_update_task_clear_parent_and_due() {
        let conn = setup();
        let parent = create_task(&conn, &create_params("父任务")).unwrap();
        let parent_id = parent["id"].as_str().unwrap().to_string();
        let child = create_task(
            &conn,
            &CreateTaskParams {
                title: "子任务".to_string(),
                due_date: Some("2026-08-10".to_string()),
                parent_task_id: Some(parent_id.clone()),
                ..create_params("")
            },
        )
        .unwrap();
        let child_id = child["id"].as_str().unwrap().to_string();

        // 清除父级 + 清除截止时间
        let updated = update_task(
            &conn,
            &UpdateTaskParams {
                id: child_id.clone(),
                title: None,
                description: None,
                priority: None,
                due_date: Some(String::new()),
                tag_names: None,
                tag_ids: None,
                parent_task_id: Some(None),
                my_day: None,
                is_completed: None,
                is_suspended: None,
                is_abandoned: None,
                is_pinned: None,
            },
        )
        .unwrap();
        assert!(updated["parent_task_id"].is_null());
        assert!(updated["due_date"].is_null());

        // tag 整体替换
        let updated = update_task(
            &conn,
            &UpdateTaskParams {
                id: child_id,
                tag_names: Some(vec!["新标签".to_string()]),
                ..update_default()
            },
        )
        .unwrap();
        let tags: Vec<String> = updated["tag_ids"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect();
        assert_eq!(tags.len(), 1);
    }

    fn update_default() -> UpdateTaskParams {
        UpdateTaskParams {
            id: String::new(),
            title: None,
            description: None,
            priority: None,
            due_date: None,
            tag_names: None,
            tag_ids: None,
            parent_task_id: None,
            my_day: None,
            is_completed: None,
            is_suspended: None,
            is_abandoned: None,
            is_pinned: None,
        }
    }

    #[test]
    fn test_complete_reopen_delete() {
        let conn = setup();
        let v = create_task(&conn, &create_params("任务")).unwrap();
        let id = v["id"].as_str().unwrap().to_string();

        let done = complete_task(&conn, &GetTaskParams { id: id.clone() }).unwrap();
        assert_eq!(done["is_completed"], true);
        let reopened = reopen_task(&conn, &GetTaskParams { id: id.clone() }).unwrap();
        assert_eq!(reopened["is_completed"], false);

        let del = delete_task(&conn, &GetTaskParams { id: id.clone() }).unwrap();
        assert_eq!(del["deleted"], true);
        assert!(get_task(&conn, &GetTaskParams { id }).is_err());
    }

    #[test]
    fn test_get_task_not_found() {
        let conn = setup();
        assert!(get_task(&conn, &GetTaskParams { id: "nope".into() }).is_err());
    }

    #[test]
    fn test_create_tag_and_list_tags() {
        let conn = setup();
        let v = create_tag(
            &conn,
            &CreateTagParams {
                name: "读书".to_string(),
                color: None,
                parent_tag_id: None,
            },
        )
        .unwrap();
        assert_eq!(v["name"], "读书");
        let tags = list_tags(&conn).unwrap();
        assert_eq!(tags.as_array().unwrap().len(), 1);
    }
}
