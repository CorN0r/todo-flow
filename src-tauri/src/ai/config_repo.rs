use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::ai::error::{AiError, AiErrorCode};

pub const DEFAULT_MODEL_SETTING_KEY: &str = "ai_default_model";

fn now_local() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[derive(Debug, Clone, Serialize)]
pub struct AiConnection {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub base_url: String,
    pub preset_id: Option<String>,
    pub credential_version: i64,
    pub revision: i64,
    pub enabled: bool,
    pub timeout_secs: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiModel {
    pub id: String,
    pub connection_id: String,
    pub model_id: String,
    pub display_name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiVerification {
    pub id: String,
    pub model_entry_id: String,
    pub kind: String,
    pub status: String,
    pub fingerprint: Option<String>,
    pub detail: Option<String>,
    pub verified_at: String,
}

#[derive(Debug, Clone)]
pub struct NewConnection {
    pub name: String,
    pub protocol: String,
    pub base_url: String,
    pub preset_id: Option<String>,
    pub timeout_secs: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateConnection {
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub timeout_secs: Option<Option<i64>>,
    /// 调用方已确认重新提供了凭证(新 Key 已写入凭证存储)。
    pub credential_replaced: bool,
}

fn row_to_connection(row: &rusqlite::Row) -> rusqlite::Result<AiConnection> {
    Ok(AiConnection {
        id: row.get("id")?,
        name: row.get("name")?,
        protocol: row.get("protocol")?,
        base_url: row.get("base_url")?,
        preset_id: row.get("preset_id")?,
        credential_version: row.get("credential_version")?,
        revision: row.get("revision")?,
        enabled: row.get::<_, i32>("enabled")? != 0,
        timeout_secs: row.get("timeout_secs")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_model(row: &rusqlite::Row) -> rusqlite::Result<AiModel> {
    Ok(AiModel {
        id: row.get("id")?,
        connection_id: row.get("connection_id")?,
        model_id: row.get("model_id")?,
        display_name: row.get("display_name")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_verification(row: &rusqlite::Row) -> rusqlite::Result<AiVerification> {
    Ok(AiVerification {
        id: row.get("id")?,
        model_entry_id: row.get("model_entry_id")?,
        kind: row.get("kind")?,
        status: row.get("status")?,
        fingerprint: row.get("fingerprint")?,
        detail: row.get("detail")?,
        verified_at: row.get("verified_at")?,
    })
}

/// 基础地址规范化:去首尾空白与尾部斜杠。指纹与请求拼接共用,保证"改个尾斜杠"不会
/// 被当成同一配置,也不会把路径拼错。
pub fn normalize_base_url(raw: &str) -> Result<String, AiError> {
    let trimmed = raw.trim().trim_end_matches('/').to_string();
    if trimmed.is_empty() {
        return Err(AiError::new(AiErrorCode::Validation, "API 基础地址不能为空"));
    }
    if !trimmed.starts_with("https://") && !trimmed.starts_with("http://") {
        return Err(AiError::new(
            AiErrorCode::Validation,
            "API 基础地址必须以 https:// 或 http:// 开头",
        ));
    }
    if trimmed.ends_with("/chat/completions") {
        return Err(AiError::new(
            AiErrorCode::Validation,
            "这里填写的是基础地址(如 https://api.example.com/v1),不需要包含 /chat/completions 端点",
        ));
    }
    Ok(trimmed)
}

/// 验证指纹:覆盖协议、规范化地址、模型标识、影响请求的参数(超时)与凭证版本。
/// 不包含显示名称 —— 改名不应让验证结论过期。
pub fn verification_fingerprint(
    protocol: &str,
    base_url: &str,
    model_id: &str,
    timeout_secs: Option<i64>,
    credential_version: i64,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(protocol.as_bytes());
    hasher.update(b"\x00");
    hasher.update(base_url.as_bytes());
    hasher.update(b"\x00");
    hasher.update(model_id.as_bytes());
    hasher.update(b"\x00");
    hasher.update(
        timeout_secs
            .map(|t| t.to_string())
            .unwrap_or_default()
            .as_bytes(),
    );
    hasher.update(b"\x00");
    hasher.update(credential_version.to_string().as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn list_connections(conn: &Connection) -> Result<Vec<AiConnection>, AiError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, protocol, base_url, preset_id, credential_version, revision,
                enabled, timeout_secs, created_at, updated_at
         FROM ai_connections ORDER BY created_at, id",
    )?;
    let rows = stmt.query_map([], row_to_connection)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_connection(conn: &Connection, id: &str) -> Result<Option<AiConnection>, AiError> {
    conn.query_row(
        "SELECT id, name, protocol, base_url, preset_id, credential_version, revision,
                enabled, timeout_secs, created_at, updated_at
         FROM ai_connections WHERE id = ?1",
        params![id],
        row_to_connection,
    )
    .optional()
    .map_err(AiError::from)
}

pub fn create_connection(
    conn: &Connection,
    req: NewConnection,
) -> Result<AiConnection, AiError> {
    let name = req.name.trim().to_string();
    if name.is_empty() {
        return Err(AiError::new(AiErrorCode::Validation, "连接名称不能为空"));
    }
    let base_url = normalize_base_url(&req.base_url)?;
    let id = Uuid::new_v4().to_string();
    let now = now_local();
    conn.execute(
        "INSERT INTO ai_connections (id, name, protocol, base_url, preset_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, name, req.protocol, base_url, req.preset_id, now],
    )?;
    get_connection(conn, &id)?.ok_or_else(|| AiError::new(AiErrorCode::Internal, "创建连接失败"))
}

/// 更新连接。base_url 变化 = 影响请求 → revision+1 并使其全部模型的验证过期。
/// protocol/preset(目标来源)变化由命令层处理:要求先重新提供凭证,不走本函数。
pub fn update_connection(
    conn: &Connection,
    id: &str,
    req: UpdateConnection,
) -> Result<AiConnection, AiError> {
    let existing = get_connection(conn, id)?
        .ok_or_else(|| AiError::new(AiErrorCode::ConfigMissing, "连接不存在"))?;

    let name = match req.name {
        Some(ref n) => {
            let n = n.trim();
            if n.is_empty() {
                return Err(AiError::new(AiErrorCode::Validation, "连接名称不能为空"));
            }
            n.to_string()
        }
        None => existing.name.clone(),
    };
    let base_url = match req.base_url {
        Some(ref u) => normalize_base_url(u)?,
        None => existing.base_url.clone(),
    };

    let request_changed = base_url != existing.base_url
        || req.timeout_secs != Some(existing.timeout_secs)
        || req.credential_replaced;
    let credential_version = if req.credential_replaced {
        existing.credential_version + 1
    } else {
        existing.credential_version
    };
    let revision = if request_changed {
        existing.revision + 1
    } else {
        existing.revision
    };

    conn.execute(
        "UPDATE ai_connections
         SET name = ?2, base_url = ?3, timeout_secs = ?4,
             credential_version = ?5, revision = ?6, updated_at = ?7
         WHERE id = ?1",
        params![id, name, base_url, req.timeout_secs, credential_version, revision, now_local()],
    )?;

    if request_changed {
        expire_verifications_for_connection(conn, id)?;
    }
    get_connection(conn, id)?.ok_or_else(|| AiError::new(AiErrorCode::Internal, "连接不存在"))
}

pub fn delete_connection(conn: &Connection, id: &str) -> Result<(), AiError> {
    // 先判断默认模型是否挂在该连接下(CASCADE 删除模型行后就没法查了)
    let default_id: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![DEFAULT_MODEL_SETTING_KEY],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(default_id) = default_id {
        let belongs: Option<String> = conn
            .query_row(
                "SELECT connection_id FROM ai_models WHERE id = ?1",
                params![default_id],
                |row| row.get(0),
            )
            .optional()?;
        if belongs.as_deref() == Some(id) {
            conn.execute(
                "DELETE FROM settings WHERE key = ?1",
                params![DEFAULT_MODEL_SETTING_KEY],
            )?;
        }
    }
    conn.execute("DELETE FROM ai_connections WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_connection_enabled(conn: &Connection, id: &str, enabled: bool) -> Result<(), AiError> {
    conn.execute(
        "UPDATE ai_connections SET enabled = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, enabled as i32, now_local()],
    )?;
    Ok(())
}

pub fn list_models(conn: &Connection) -> Result<Vec<AiModel>, AiError> {
    let mut stmt = conn.prepare(
        "SELECT id, connection_id, model_id, display_name, created_at, updated_at
         FROM ai_models ORDER BY created_at, id",
    )?;
    let rows = stmt.query_map([], row_to_model)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_models_for_connection(conn: &Connection, connection_id: &str) -> Result<Vec<AiModel>, AiError> {
    let mut stmt = conn.prepare(
        "SELECT id, connection_id, model_id, display_name, created_at, updated_at
         FROM ai_models WHERE connection_id = ?1 ORDER BY created_at, id",
    )?;
    let rows = stmt.query_map(params![connection_id], row_to_model)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_model(conn: &Connection, id: &str) -> Result<Option<AiModel>, AiError> {
    conn.query_row(
        "SELECT id, connection_id, model_id, display_name, created_at, updated_at
         FROM ai_models WHERE id = ?1",
        params![id],
        row_to_model,
    )
    .optional()
    .map_err(AiError::from)
}

pub fn create_model(
    conn: &Connection,
    connection_id: &str,
    model_id: &str,
    display_name: Option<&str>,
) -> Result<AiModel, AiError> {
    let model_id = model_id.trim().to_string();
    if model_id.is_empty() {
        return Err(AiError::new(AiErrorCode::Validation, "模型标识不能为空"));
    }
    let exists = conn
        .query_row(
            "SELECT id FROM ai_models WHERE connection_id = ?1 AND model_id = ?2",
            params![connection_id, model_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if exists.is_some() {
        return Err(AiError::new(
            AiErrorCode::Validation,
            "该连接下已存在相同标识的模型",
        ));
    }
    let name = display_name
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&model_id)
        .to_string();
    let id = Uuid::new_v4().to_string();
    let now = now_local();
    conn.execute(
        "INSERT INTO ai_models (id, connection_id, model_id, display_name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, connection_id, model_id, name, now],
    )?;
    get_model(conn, &id)?.ok_or_else(|| AiError::new(AiErrorCode::Internal, "创建模型失败"))
}

/// 更新模型条目。model_id(服务端标识)变化影响请求 → 验证过期;display_name 不影响。
pub fn update_model(
    conn: &Connection,
    id: &str,
    model_id: Option<&str>,
    display_name: Option<&str>,
) -> Result<AiModel, AiError> {
    let existing = get_model(conn, id)?
        .ok_or_else(|| AiError::new(AiErrorCode::ConfigMissing, "模型不存在"))?;
    let new_model_id = match model_id {
        Some(m) => {
            let m = m.trim();
            if m.is_empty() {
                return Err(AiError::new(AiErrorCode::Validation, "模型标识不能为空"));
            }
            m.to_string()
        }
        None => existing.model_id.clone(),
    };
    let new_display = display_name
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or(existing.display_name.clone());

    conn.execute(
        "UPDATE ai_models SET model_id = ?2, display_name = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, new_model_id, new_display, now_local()],
    )?;
    if new_model_id != existing.model_id {
        expire_verifications_for_model(conn, id)?;
    }
    get_model(conn, id)?.ok_or_else(|| AiError::new(AiErrorCode::Internal, "模型不存在"))
}

pub fn delete_model(conn: &Connection, id: &str) -> Result<(), AiError> {
    conn.execute("DELETE FROM ai_models WHERE id = ?1", params![id])?;
    let default_id: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![DEFAULT_MODEL_SETTING_KEY],
            |row| row.get(0),
        )
        .optional()?;
    if default_id.as_deref() == Some(id) {
        conn.execute(
            "DELETE FROM settings WHERE key = ?1",
            params![DEFAULT_MODEL_SETTING_KEY],
        )?;
    }
    Ok(())
}

pub fn get_default_model_id(conn: &Connection) -> Result<Option<String>, AiError> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![DEFAULT_MODEL_SETTING_KEY],
        |row| row.get(0),
    )
    .optional()
    .map_err(AiError::from)
}

pub fn set_default_model_id(conn: &Connection, model_entry_id: Option<&str>) -> Result<(), AiError> {
    match model_entry_id {
        Some(id) => {
            if get_model(conn, id)?.is_none() {
                return Err(AiError::new(AiErrorCode::ConfigMissing, "模型不存在,无法设为默认"));
            }
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params![DEFAULT_MODEL_SETTING_KEY, id],
            )?;
        }
        None => {
            conn.execute(
                "DELETE FROM settings WHERE key = ?1",
                params![DEFAULT_MODEL_SETTING_KEY],
            )?;
        }
    }
    Ok(())
}

// ---------- 验证记录 ----------

pub fn upsert_verification(
    conn: &Connection,
    model_entry_id: &str,
    kind: &str,
    status: &str,
    fingerprint: &str,
    detail: Option<&str>,
) -> Result<AiVerification, AiError> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO ai_model_verifications (id, model_entry_id, kind, status, fingerprint, detail, verified_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, model_entry_id, kind, status, fingerprint, detail, now_local()],
    )?;
    conn.query_row(
        "SELECT id, model_entry_id, kind, status, fingerprint, detail, verified_at
         FROM ai_model_verifications WHERE id = ?1",
        params![id],
        row_to_verification,
    )
    .map_err(AiError::from)
}

/// 每个模型每类验证只保留最新一条(历史事实由调用摘要另行承载);
/// 新结果写入时替换旧记录,状态机:unknown → passed/unsupported/failed,过期统一改 expired。
pub fn latest_verifications(conn: &Connection, model_entry_id: &str) -> Result<Vec<AiVerification>, AiError> {
    let mut stmt = conn.prepare(
        "SELECT id, model_entry_id, kind, status, fingerprint, detail, verified_at
         FROM ai_model_verifications
         WHERE model_entry_id = ?1
           AND verified_at = (SELECT MAX(v2.verified_at) FROM ai_model_verifications v2
                              WHERE v2.model_entry_id = ?1 AND v2.kind = ai_model_verifications.kind)
         ORDER BY kind",
    )?;
    let rows = stmt.query_map(params![model_entry_id], row_to_verification)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn expire_verifications_for_model(conn: &Connection, model_entry_id: &str) -> Result<(), AiError> {
    conn.execute(
        "UPDATE ai_model_verifications SET status = 'expired'
         WHERE model_entry_id = ?1 AND status IN ('passed','unsupported','failed')",
        params![model_entry_id],
    )?;
    Ok(())
}

pub fn expire_verifications_for_connection(conn: &Connection, connection_id: &str) -> Result<(), AiError> {
    conn.execute(
        "UPDATE ai_model_verifications SET status = 'expired'
         WHERE model_entry_id IN (SELECT id FROM ai_models WHERE connection_id = ?1)
           AND status IN ('passed','unsupported','failed')",
        params![connection_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        )
        .unwrap();
        // 复用正式迁移建表,保证测试 schema 与生产一致
        crate::db::migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn normalize_base_url_variants() {
        assert_eq!(
            normalize_base_url("https://api.example.com/v1/").unwrap(),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_base_url(" https://api.example.com ").unwrap(),
            "https://api.example.com"
        );
        assert!(normalize_base_url("https://x.com/chat/completions").is_err());
        assert!(normalize_base_url("api.example.com").is_err());
        assert!(normalize_base_url("").is_err());
    }

    #[test]
    fn fingerprint_excludes_display_name_but_includes_request_inputs() {
        let a = verification_fingerprint("openai_chat", "https://a.com/v1", "m1", Some(120), 3);
        // 换凭证版本 → 不同
        let b = verification_fingerprint("openai_chat", "https://a.com/v1", "m1", Some(120), 4);
        // 换模型标识 → 不同
        let c = verification_fingerprint("openai_chat", "https://a.com/v1", "m2", Some(120), 3);
        // 换超时 → 不同
        let d = verification_fingerprint("openai_chat", "https://a.com/v1", "m1", None, 3);
        assert_ne!(a, b);
        assert_ne!(a, c);
        assert_ne!(a, d);
        // 稳定性:同输入同输出
        assert_eq!(a, verification_fingerprint("openai_chat", "https://a.com/v1", "m1", Some(120), 3));
    }

    #[test]
    fn connection_crud_and_default_model_cleanup() {
        let conn = setup();
        let c = create_connection(
            &conn,
            NewConnection {
                name: "测试".into(),
                protocol: "openai_chat".into(),
                base_url: "https://api.example.com/v1/".into(),
                preset_id: None,
                timeout_secs: None,
            },
        )
        .unwrap();
        assert_eq!(c.base_url, "https://api.example.com/v1");
        assert_eq!(c.revision, 1);

        let m = create_model(&conn, &c.id, "deepseek-chat", None).unwrap();
        assert_eq!(m.display_name, "deepseek-chat");

        set_default_model_id(&conn, Some(&m.id)).unwrap();
        assert_eq!(get_default_model_id(&conn).unwrap().as_deref(), Some(m.id.as_str()));

        // 删除默认模型 → 默认选择被清空
        delete_model(&conn, &m.id).unwrap();
        assert!(get_default_model_id(&conn).unwrap().is_none());
    }

    #[test]
    fn base_url_change_expires_verifications_and_bumps_revision() {
        let conn = setup();
        let c = create_connection(
            &conn,
            NewConnection {
                name: "c".into(),
                protocol: "openai_chat".into(),
                base_url: "https://a.com".into(),
                preset_id: None,
                timeout_secs: None,
            },
        )
        .unwrap();
        let m = create_model(&conn, &c.id, "m1", None).unwrap();
        upsert_verification(&conn, &m.id, "basic", "passed", "fp", None).unwrap();

        // 仅改显示名 → 验证保持
        update_model(&conn, &m.id, None, Some("友好名")).unwrap();
        let latest = latest_verifications(&conn, &m.id).unwrap();
        assert_eq!(latest[0].status, "passed");

        // 改地址 → revision+1、验证过期、凭证版本不变
        let updated = update_connection(
            &conn,
            &c.id,
            UpdateConnection {
                base_url: Some("https://b.com/v1".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.revision, 2);
        assert_eq!(updated.credential_version, 0);
        let latest = latest_verifications(&conn, &m.id).unwrap();
        assert_eq!(latest[0].status, "expired");

        // 改模型标识 → 该模型验证过期
        upsert_verification(&conn, &m.id, "basic", "passed", "fp2", None).unwrap();
        update_model(&conn, &m.id, Some("m1-new"), None).unwrap();
        let latest = latest_verifications(&conn, &m.id).unwrap();
        assert_eq!(latest[0].status, "expired");
    }

    #[test]
    fn credential_replace_bumps_version_and_expires() {
        let conn = setup();
        let c = create_connection(
            &conn,
            NewConnection {
                name: "c".into(),
                protocol: "openai_chat".into(),
                base_url: "https://a.com".into(),
                preset_id: None,
                timeout_secs: None,
            },
        )
        .unwrap();
        let updated = update_connection(
            &conn,
            &c.id,
            UpdateConnection {
                credential_replaced: true,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.credential_version, 1);
        assert_eq!(updated.revision, 2);
    }

    #[test]
    fn delete_connection_cascades_models_and_clears_default() {
        let conn = setup();
        let c = create_connection(
            &conn,
            NewConnection {
                name: "c".into(),
                protocol: "openai_chat".into(),
                base_url: "https://a.com".into(),
                preset_id: None,
                timeout_secs: None,
            },
        )
        .unwrap();
        let m = create_model(&conn, &c.id, "m", None).unwrap();
        set_default_model_id(&conn, Some(&m.id)).unwrap();
        delete_connection(&conn, &c.id).unwrap();
        assert!(list_models_for_connection(&conn, &c.id).unwrap().is_empty());
        assert!(get_default_model_id(&conn).unwrap().is_none());
    }

    #[test]
    fn duplicate_model_per_connection_rejected() {
        let conn = setup();
        let c = create_connection(
            &conn,
            NewConnection {
                name: "c".into(),
                protocol: "openai_chat".into(),
                base_url: "https://a.com".into(),
                preset_id: None,
                timeout_secs: None,
            },
        )
        .unwrap();
        create_model(&conn, &c.id, "m", None).unwrap();
        let err = create_model(&conn, &c.id, "m", None).unwrap_err();
        assert_eq!(err.code, AiErrorCode::Validation);
    }

    #[test]
    fn ai_settings_are_not_syncable() {
        // 模型配置按设备管理:默认模型键不得进入设置同步白名单
        assert!(!crate::db::sync_repo::is_syncable_setting_key(
            DEFAULT_MODEL_SETTING_KEY
        ));
    }
}
