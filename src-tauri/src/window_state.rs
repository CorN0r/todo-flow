//! 主窗口位置与尺寸的保存与恢复。
//!
//! 切换工作区会重启应用;不保存的话,主窗口每次都会回到居中的默认尺寸。
//! 这份状态属于应用而不是某个工作区,存在应用数据目录下的 `window-state.json`。

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition};

use crate::error::AppError;

const STATE_FILE: &str = "window-state.json";
/// 落盘间隔:拖动和缩放期间事件很密,按秒合并写入
const FLUSH_INTERVAL: Duration = Duration::from_secs(1);
/// 窗口至少要在某个显示器上露出这么大,才认为保存的位置仍然可用
const MIN_VISIBLE_PX: i32 = 80;
/// 最小化的窗口会上报很小的尺寸,低于这个值的不保存
const MIN_LOGICAL_SIZE: f64 = 100.0;

/// 位置用物理像素,尺寸用逻辑像素(换到缩放比例不同的显示器上时保持观感)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
}

pub struct WindowStateTracker {
    app_data_dir: PathBuf,
    latest: Arc<Mutex<Option<WindowBounds>>>,
    dirty: Arc<AtomicBool>,
}

fn state_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(STATE_FILE)
}

fn is_sane(bounds: &WindowBounds) -> bool {
    bounds.width.is_finite()
        && bounds.height.is_finite()
        && bounds.width >= MIN_LOGICAL_SIZE
        && bounds.height >= MIN_LOGICAL_SIZE
}

fn load(app_data_dir: &Path) -> Option<WindowBounds> {
    let text = std::fs::read_to_string(state_path(app_data_dir)).ok()?;
    serde_json::from_str::<WindowBounds>(&text)
        .ok()
        .filter(is_sane)
}

/// 原子写入:先写临时文件,再替换正式文件
fn save(app_data_dir: &Path, bounds: WindowBounds) -> Result<(), AppError> {
    std::fs::create_dir_all(app_data_dir)?;
    let text = serde_json::to_string(&bounds)
        .map_err(|e| AppError::Generic(format!("序列化窗口状态失败: {}", e)))?;
    let tmp = app_data_dir.join(format!("{}.tmp", STATE_FILE));
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, state_path(app_data_dir))?;
    Ok(())
}

/// 以 (x, y) 为左上角、宽高为 (width, height) 的矩形,是否与显示器有足够的重叠
fn overlaps_enough(x: i32, y: i32, width: i32, height: i32, monitor: ((i32, i32), (i32, i32))) -> bool {
    let ((origin_x, origin_y), (size_x, size_y)) = monitor;
    let overlap_x = (x + width).min(origin_x + size_x) - x.max(origin_x);
    let overlap_y = (y + height).min(origin_y + size_y) - y.max(origin_y);
    overlap_x >= MIN_VISIBLE_PX && overlap_y >= MIN_VISIBLE_PX
}

/// 保存的位置是否仍落在某个可用显示器上
fn intersects_any_monitor(window: &tauri::WebviewWindow, bounds: &WindowBounds) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return false;
    };
    // 位置是物理像素;尺寸按目标显示器之外也能接受的当前缩放比例换算
    let scale = window.scale_factor().unwrap_or(1.0);
    let (width, height) = (
        (bounds.width * scale) as i32,
        (bounds.height * scale) as i32,
    );
    monitors.iter().any(|monitor| {
        let origin = monitor.position();
        let size = monitor.size();
        overlaps_enough(
            bounds.x,
            bounds.y,
            width,
            height,
            ((origin.x, origin.y), (size.width as i32, size.height as i32)),
        )
    })
}

/// 窗口此刻的位置与尺寸;最小化或隐藏时返回 None
fn current_bounds(window: &tauri::WebviewWindow) -> Option<WindowBounds> {
    if window.is_minimized().unwrap_or(false) || !window.is_visible().unwrap_or(true) {
        return None;
    }
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    let scale = window.scale_factor().ok()?;
    if scale <= 0.0 {
        return None;
    }
    Some(WindowBounds {
        x: position.x,
        y: position.y,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    })
    .filter(is_sane)
}

fn persist(app_data_dir: &Path, latest: &Mutex<Option<WindowBounds>>) {
    let bounds = latest.lock().ok().and_then(|guard| *guard);
    if let Some(bounds) = bounds {
        if let Err(e) = save(app_data_dir, bounds) {
            eprintln!("[window-state] 保存主窗口位置失败: {}", e);
        }
    }
}

/// 启动时恢复主窗口的位置与尺寸,返回实际恢复的状态。
/// 保存的位置不在任何可用显示器上时保持原样(居中的默认尺寸)。
pub fn restore(window: &tauri::WebviewWindow, app_data_dir: &Path) -> Option<WindowBounds> {
    let bounds = load(app_data_dir)?;
    if !intersects_any_monitor(window, &bounds) {
        return None;
    }
    let _ = window.set_size(tauri::LogicalSize::new(bounds.width, bounds.height));
    let _ = window.set_position(PhysicalPosition::new(bounds.x, bounds.y));
    Some(bounds)
}

/// 开始跟踪主窗口的移动与缩放。之后每秒把最新状态落盘一次,退出时再落盘一次。
pub fn track(
    window: &tauri::WebviewWindow,
    app_data_dir: &Path,
    initial: Option<WindowBounds>,
) -> WindowStateTracker {
    let tracker = WindowStateTracker {
        app_data_dir: app_data_dir.to_path_buf(),
        latest: Arc::new(Mutex::new(initial)),
        dirty: Arc::new(AtomicBool::new(initial.is_some())),
    };
    {
        let latest = tracker.latest.clone();
        let dirty = tracker.dirty.clone();
        let watched = window.clone();
        window.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {}
                _ => return,
            }
            if let Some(bounds) = current_bounds(&watched) {
                if let Ok(mut latest) = latest.lock() {
                    *latest = Some(bounds);
                }
                dirty.store(true, Ordering::Relaxed);
            }
        });
    }
    // 常驻的落盘线程:每秒检查一次,有变化才写
    let dir = tracker.app_data_dir.clone();
    let latest = tracker.latest.clone();
    let dirty = tracker.dirty.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(FLUSH_INTERVAL);
        if dirty.swap(false, Ordering::Relaxed) {
            persist(&dir, &latest);
        }
    });
    tracker
}

/// 退出前把最新状态落盘;切换工作区引起的重启也走这里。
pub fn flush(handle: &AppHandle) {
    let Some(tracker) = handle.try_state::<WindowStateTracker>() else {
        return;
    };
    persist(&tracker.app_data_dir, &tracker.latest);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn saved_bounds_survive_a_restart() {
        let dir = temp();
        assert_eq!(load(dir.path()), None);
        let bounds = WindowBounds { x: 1920, y: 40, width: 1100.5, height: 760.0 };
        save(dir.path(), bounds).unwrap();
        assert_eq!(load(dir.path()), Some(bounds));
        assert!(!dir.path().join("window-state.json.tmp").exists());
    }

    #[test]
    fn unreadable_or_unsane_state_is_ignored() {
        let dir = temp();
        std::fs::write(state_path(dir.path()), b"{not json").unwrap();
        assert_eq!(load(dir.path()), None);

        for (width, height) in [(0.0, 800.0), (1200.0, 40.0), (f64::NAN, 800.0)] {
            save(dir.path(), WindowBounds { x: 0, y: 0, width, height }).unwrap();
            assert_eq!(load(dir.path()), None, "{}x{}", width, height);
        }
    }

    #[test]
    fn a_position_on_a_disconnected_monitor_is_rejected() {
        let primary = ((0, 0), (1920, 1080));
        let secondary = ((1920, 0), (2560, 1440));
        let on_secondary = (2500, 300, 1200, 800);
        assert!(overlaps_enough(2500, 300, 1200, 800, secondary));
        assert!(!overlaps_enough(on_secondary.0, on_secondary.1, on_secondary.2, on_secondary.3, primary));
        // 跨在两块屏幕之间:在主屏上露出足够大,也算可用
        assert!(overlaps_enough(1700, 100, 1200, 800, primary));
        // 只露出一条边:不算
        assert!(!overlaps_enough(1890, 100, 1200, 800, primary));
        // 部分在屏幕外但主体可见:可用
        assert!(overlaps_enough(-600, 100, 1200, 800, primary));
    }

    #[test]
    fn save_creates_a_missing_data_directory() {
        let dir = temp();
        let nested = dir.path().join("a").join("b");
        save(&nested, WindowBounds { x: 0, y: 0, width: 800.0, height: 600.0 }).unwrap();
        assert_eq!(load(&nested).map(|b| b.width), Some(800.0));
    }
}
