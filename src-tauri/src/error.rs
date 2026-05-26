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

#[cfg(test)]
mod tests {
    use super::*;

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
            Err(rusqlite::Error::InvalidParameterCount(0, 1)).map_err(AppError::from);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Database(_) => {},
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
