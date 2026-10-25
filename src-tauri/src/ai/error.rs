use serde::Serialize;

/// 模型接入模块的机器可读错误码。前端按 `code` 分类展示,
/// 不依赖字符串匹配(现有 AppError 序列化为纯字符串,不适合承载分类)。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AiErrorCode {
    /// 连接或模型配置缺失/不完整
    ConfigMissing,
    /// 凭证未配置或本机凭证存储中查不到(需重新填写 Key)
    CredentialUnavailable,
    /// 服务返回鉴权失败(401/403)
    AuthFailed,
    /// 模型不存在或不可用(404,也可能是地址错误)
    ModelNotFound,
    /// 网络连接失败(DNS/拒连/5xx)
    ConnectionFailed,
    /// 触发服务限流(429)
    RateLimited,
    /// 超过总超时
    Timeout,
    /// 用户取消
    Cancelled,
    /// 配置/服务不支持所请求的能力
    Unsupported,
    /// 输出被截断,不能作为完整结果
    OutputTruncated,
    /// 返回内容结构不合法
    InvalidFormat,
    /// 生成后任务上下文已变化,建议重新生成
    ContextChanged,
    /// 重复采纳冲突(批次已采纳/操作内容不一致)
    ApplyConflict,
    /// 输入参数校验失败
    Validation,
    /// 内部错误(不应出现,兜底)
    Internal,
}

/// AI 命令统一错误。序列化为 `{ code, message, detail? }` 对象。
#[derive(Debug, Clone, Serialize)]
pub struct AiError {
    pub code: AiErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl AiError {
    pub fn new(code: AiErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

impl std::fmt::Display for AiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)?;
        if let Some(ref d) = self.detail {
            write!(f, " ({})", d)?;
        }
        Ok(())
    }
}

impl std::error::Error for AiError {}

impl From<crate::error::AppError> for AiError {
    fn from(e: crate::error::AppError) -> Self {
        match e {
            crate::error::AppError::Validation(msg) => {
                AiError::new(AiErrorCode::Validation, msg)
            }
            crate::error::AppError::NotFound(msg) => {
                AiError::new(AiErrorCode::ConfigMissing, msg)
            }
            other => AiError::new(AiErrorCode::Internal, other.to_string()),
        }
    }
}

impl From<rusqlite::Error> for AiError {
    fn from(e: rusqlite::Error) -> Self {
        AiError::new(AiErrorCode::Internal, format!("数据库错误: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_message() {
        let err = AiError::new(AiErrorCode::AuthFailed, "鉴权失败");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "auth_failed");
        assert_eq!(json["message"], "鉴权失败");
        assert!(json.get("detail").is_none() || json["detail"].is_null());
    }

    #[test]
    fn serializes_detail_when_present() {
        let err = AiError::new(AiErrorCode::Timeout, "请求超时").with_detail("120s");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "timeout");
        assert_eq!(json["detail"], "120s");
    }

    #[test]
    fn covers_all_documented_categories() {
        let codes = [
            AiErrorCode::ConfigMissing,
            AiErrorCode::CredentialUnavailable,
            AiErrorCode::AuthFailed,
            AiErrorCode::ModelNotFound,
            AiErrorCode::ConnectionFailed,
            AiErrorCode::RateLimited,
            AiErrorCode::Timeout,
            AiErrorCode::Cancelled,
            AiErrorCode::Unsupported,
            AiErrorCode::OutputTruncated,
            AiErrorCode::InvalidFormat,
            AiErrorCode::ContextChanged,
            AiErrorCode::ApplyConflict,
        ];
        for code in codes {
            let json = serde_json::to_value(AiError::new(code, "x")).unwrap();
            assert!(json["code"].is_string());
        }
    }

    #[test]
    fn converts_validation_app_error() {
        let err: AiError = crate::error::AppError::Validation("地址不合法".into()).into();
        assert_eq!(err.code, AiErrorCode::Validation);
    }
}
