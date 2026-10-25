use crate::ai::error::{AiError, AiErrorCode};

/// 凭证存储抽象。Windows 用系统凭据管理器;Android 后续以同一 trait 适配本机存储。
/// 前端永远拿不到原始 Key:读取接口只存在于后端调用链内部,不暴露 tauri 命令。
pub trait CredentialStore: Send + Sync {
    /// 写入(新建或整体替换)指定连接的 Key。
    fn set(&self, connection_id: &str, api_key: &str) -> Result<(), AiError>;
    /// 删除。条目本就不存在时视为成功(清理路径幂等)。
    fn remove(&self, connection_id: &str) -> Result<(), AiError>;
    /// 是否已配置。false 表示需要(重新)填写 Key。
    fn exists(&self, connection_id: &str) -> Result<bool, AiError>;
    /// 读取原始 Key。仅后端发起模型请求时使用,不暴露为 tauri 命令。
    fn get(&self, connection_id: &str) -> Result<Option<String>, AiError>;
}

pub const KEYRING_SERVICE: &str = "com.todoflow.desktop/ai";

fn entry(connection_id: &str) -> Result<keyring::Entry, AiError> {
    // 连接 id 是软件生成的 UUID,不含路径分隔符;仍做白名单校验防御异常数据
    if connection_id.is_empty()
        || !connection_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(AiError::new(
            AiErrorCode::Validation,
            "连接标识不合法,无法定位凭证",
        ));
    }
    keyring::Entry::new(KEYRING_SERVICE, connection_id).map_err(|e| {
        AiError::new(
            AiErrorCode::CredentialUnavailable,
            "无法访问系统凭证存储",
        )
        .with_detail(e.to_string())
    })
}

/// Windows 凭据管理器实现(keyring windows-native 后端,即 CredWrite/CredRead)。
pub struct WindowsKeyringStore;

impl CredentialStore for WindowsKeyringStore {
    fn set(&self, connection_id: &str, api_key: &str) -> Result<(), AiError> {
        entry(connection_id)?
            .set_password(api_key)
            .map_err(|e| {
                AiError::new(AiErrorCode::CredentialUnavailable, "保存 API Key 失败")
                    .with_detail(e.to_string())
            })
    }

    fn remove(&self, connection_id: &str) -> Result<(), AiError> {
        match entry(connection_id)?.delete_credential() {
            Ok(()) => Ok(()),
            // 条目不存在:清理旧引用的幂等路径
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AiError::new(
                AiErrorCode::CredentialUnavailable,
                "删除 API Key 失败",
            )
            .with_detail(e.to_string())),
        }
    }

    fn exists(&self, connection_id: &str) -> Result<bool, AiError> {
        Ok(self.get(connection_id)?.is_some())
    }

    fn get(&self, connection_id: &str) -> Result<Option<String>, AiError> {
        match entry(connection_id)?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AiError::new(
                AiErrorCode::CredentialUnavailable,
                "无法查询凭证状态",
            )
            .with_detail(e.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// keyring 依赖验证(spike):真实凭据管理器写入/查询/删除往返。
    /// 在 Windows CI 无交互会话时 keyring 可能失败,标 ignore 由本地验收跑;
    /// 常规 CI 跑纯逻辑用例(非法 id)。
    #[test]
    fn rejects_invalid_connection_id() {
        let store = WindowsKeyringStore;
        assert_eq!(
            store.set("../evil", "k").unwrap_err().code,
            AiErrorCode::Validation
        );
        assert_eq!(
            store.exists("").unwrap_err().code,
            AiErrorCode::Validation
        );
    }

    #[test]
    #[ignore = "真实系统凭证存储往返,本地 Windows 验收时执行: cargo test -- --ignored"]
    fn roundtrip_windows_credential_manager() {
        let store = WindowsKeyringStore;
        let id = format!("spike-{}", uuid::Uuid::new_v4());
        store.set(&id, "test-key-123").unwrap();
        assert!(store.exists(&id).unwrap());
        store.set(&id, "test-key-456").unwrap(); // 替换
        store.remove(&id).unwrap();
        assert!(!store.exists(&id).unwrap());
        store.remove(&id).unwrap(); // 幂等删除
    }
}
