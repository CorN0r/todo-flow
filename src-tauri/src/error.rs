use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Lock error: {0}")]
    Lock(String),
    #[error("{0}")]
    Generic(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl AppError {
    /// 给用户看的说明:去掉错误类型的英文前缀("Validation error: " 等),只留说明本身。
    /// `Display` 保留前缀供日志和前端判别;启动提示这类直接展示给用户的场合用这个。
    pub fn user_message(&self) -> String {
        match self {
            AppError::Validation(message)
            | AppError::NotFound(message)
            | AppError::Lock(message)
            | AppError::Generic(message) => message.clone(),
            AppError::Database(err) => err.to_string(),
            AppError::Io(err) => err.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_message_drops_the_error_kind_prefix() {
        assert_eq!(AppError::Validation("名称不能为空".to_string()).user_message(), "名称不能为空");
        assert_eq!(AppError::NotFound("工作区不存在".to_string()).user_message(), "工作区不存在");
        assert_eq!(AppError::Lock("locked".to_string()).user_message(), "locked");
        assert_eq!(AppError::Generic("出错了".to_string()).user_message(), "出错了");
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        assert_eq!(AppError::Io(io_err).user_message(), "file missing");
    }

    #[test]
    fn test_database_error_display() {
        let err = AppError::Database(rusqlite::Error::InvalidParameterCount(1, 2));
        assert!(err.to_string().contains("Database error"));
    }

    #[test]
    fn test_not_found_display() {
        let err = AppError::NotFound("Task 123".to_string());
        assert_eq!(err.to_string(), "Not found: Task 123");
    }

    #[test]
    fn test_validation_display() {
        let err = AppError::Validation("Title required".to_string());
        assert_eq!(err.to_string(), "Validation error: Title required");
    }

    #[test]
    fn test_generic_display() {
        let err = AppError::Generic("Something went wrong".to_string());
        assert_eq!(err.to_string(), "Something went wrong");
    }

    #[test]
    fn test_from_rusqlite_error() {
        let result: Result<(), AppError> =
            Err(AppError::from(rusqlite::Error::InvalidParameterCount(0, 1)));
        assert!(result.is_err());
        match result {
            Err(AppError::Database(_)) => {}
            _ => panic!("expected Database variant"),
        }
    }

    #[test]
    fn test_from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let app_err: AppError = io_err.into();
        assert!(app_err.to_string().contains("IO error"));
    }

    #[test]
    fn test_serialize() {
        let err = AppError::Validation("bad".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"Validation error: bad\"");
    }
}
