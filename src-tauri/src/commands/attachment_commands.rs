use std::fs;
use std::path::PathBuf;

use image::GenericImageView;
use tauri::State;

use crate::db::attachment_repo;
use crate::error::AppError;
use crate::models::attachment::Attachment;
use crate::AppState;

fn is_image(ext: &str) -> bool {
    matches!(ext.to_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp")
}

#[tauri::command]
pub fn upload_attachment(
    state: State<AppState>,
    task_id: String,
    source_path: String,
) -> Result<Attachment, AppError> {
    let source = PathBuf::from(&source_path);

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if !is_image(ext) {
        return Err(AppError::Validation(format!(
            "Unsupported file type: {}",
            ext
        )));
    }

    let original_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let uuid_part = uuid::Uuid::new_v4().to_string();
    let storage_name = format!("{}_{}", uuid_part, original_name);
    let thumb_name = format!("thumb_{}", storage_name);

    let task_attachments_dir = state.data_dir.join("attachments").join(&task_id);
    fs::create_dir_all(&task_attachments_dir)?;

    // Read original
    let img_bytes = fs::read(&source)?;
    let file_size = img_bytes.len() as i64;

    // Get mime type
    let mime_type = mime_guess::from_path(&source)
        .first_or_octet_stream()
        .to_string();

    // Generate thumbnail
    let img = image::load_from_memory(&img_bytes)
        .map_err(|e| AppError::Validation(format!("Failed to decode image: {}", e)))?;
    let (w, h) = img.dimensions();
    let thumb = if w > 256 || h > 256 {
        img.thumbnail(256, 256)
    } else {
        img
    };
    let thumb_path = task_attachments_dir.join(&thumb_name);
    thumb
        .save(&thumb_path)
        .map_err(|e| AppError::Generic(format!("Failed to save thumbnail: {}", e)))?;

    // Copy original
    let dest_path = task_attachments_dir.join(&storage_name);
    fs::write(&dest_path, img_bytes)?;

    let conn = state.db.lock().unwrap();
    attachment_repo::create(
        &conn,
        &task_id,
        &original_name,
        &storage_name,
        &mime_type,
        file_size,
        Some(&thumb_name),
    )
}

#[tauri::command]
pub fn upload_attachments_bulk(
    state: State<AppState>,
    task_id: String,
    source_paths: Vec<String>,
) -> Result<Vec<Attachment>, AppError> {
    let mut results = Vec::new();
    for path in source_paths {
        let attachment = upload_attachment(state.clone(), task_id.clone(), path)?;
        results.push(attachment);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_attachments(
    state: State<AppState>,
    task_id: String,
) -> Result<Vec<Attachment>, AppError> {
    let conn = state.db.lock().unwrap();
    attachment_repo::get_by_task(&conn, &task_id)
}

#[tauri::command]
pub fn delete_attachment(state: State<AppState>, id: String) -> Result<(), AppError> {
    let conn = state.db.lock().unwrap();
    let attachment = attachment_repo::delete(&conn, &id)?;

    let task_dir = state.data_dir.join("attachments").join(&attachment.task_id);

    // Delete original
    let orig_path = task_dir.join(&attachment.storage_name);
    if orig_path.exists() {
        fs::remove_file(&orig_path)?;
    }

    // Delete thumbnail
    if let Some(ref thumb_name) = attachment.thumbnail_name {
        let thumb_path = task_dir.join(thumb_name);
        if thumb_path.exists() {
            fs::remove_file(&thumb_path)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_attachment_file_path(
    state: State<AppState>,
    attachment_id: String,
) -> Result<String, AppError> {
    let conn = state.db.lock().unwrap();
    attachment_repo::get_file_path(&conn, &attachment_id, &state.data_dir)
}
