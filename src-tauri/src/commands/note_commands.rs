use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::task_note_repo;
use crate::error::AppError;
use crate::models::task_note::TaskNote;
use crate::AppState;

pub const MAX_NOTES: i64 = 8;
const NOTE_STYLES: [&str; 3] = ["glass", "paper", "minimal"];
/// 折叠态迷你条尺寸(逻辑像素)
const COLLAPSED_WIDTH: f64 = 280.0;
const COLLAPSED_HEIGHT: f64 = 36.0;

fn note_label(task_id: &str) -> String {
    format!("note-{}", task_id)
}

struct BoundsTracker {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    last_write: Instant,
    flush_scheduled: bool,
}

fn write_bounds(db: &Arc<Mutex<Connection>>, task_id: &str, t: &BoundsTracker) {
    if let Ok(conn) = db.lock() {
        // 折叠态窗口高被压成 36px:此时只写位置,保留库里的展开态宽高供恢复。
        // set_note_collapsed 先落库再 set_size,随后的 Resized 写库一定能读到 collapsed=1。
        let collapsed = task_note_repo::get(&conn, task_id)
            .ok()
            .flatten()
            .map(|n| n.collapsed)
            .unwrap_or(false);
        if collapsed {
            let _ = task_note_repo::update_position(&conn, task_id, t.x, t.y);
        } else {
            let _ = task_note_repo::update_bounds(&conn, task_id, t.x, t.y, t.width, t.height);
        }
    }
}

/// 节流写库:距上次写入 <800ms 则跳过,并安排一次延迟补写(保证拖动结束后的最终位置落库)。
fn on_bounds_changed(db: &Arc<Mutex<Connection>>, task_id: &str, tracker: &Arc<Mutex<BoundsTracker>>) {
    let should_write = {
        match tracker.lock() {
            Ok(mut t) => {
                if t.last_write.elapsed() >= Duration::from_millis(800) {
                    t.last_write = Instant::now();
                    true
                } else if !t.flush_scheduled {
                    t.flush_scheduled = true;
                    let tracker = Arc::clone(tracker);
                    let db = Arc::clone(db);
                    let task_id = task_id.to_string();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(800));
                        if let Ok(mut t) = tracker.lock() {
                            t.flush_scheduled = false;
                            t.last_write = Instant::now();
                            write_bounds(&db, &task_id, &t);
                        }
                    });
                    false
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    };
    if should_write {
        if let Ok(t) = tracker.lock() {
            write_bounds(db, task_id, &t);
        }
    }
}

/// 为便签找一个不与其它可见便签重叠的落点(返回物理像素坐标)。
/// width/height 是逻辑像素,内部按主屏 scale 换算;preferred 为已存/当前坐标,
/// 不与任何可见便签相交时原样返回(尊重原位置)。
fn find_free_position(
    app: &AppHandle,
    width: i32,
    height: i32,
    preferred: Option<(i32, i32)>,
) -> tauri::PhysicalPosition<i32> {
    // 可见便签窗口的外矩形 (x, y, right, bottom),物理像素。隐藏的僵尸窗口不占位。
    let mut occupied: Vec<(i32, i32, i32, i32)> = Vec::new();
    for (label, win) in app.webview_windows() {
        if !label.starts_with("note-") || !win.is_visible().unwrap_or(false) {
            continue;
        }
        if let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) {
            occupied.push((
                pos.x,
                pos.y,
                pos.x + size.width as i32,
                pos.y + size.height as i32,
            ));
        }
    }

    let (work_x, work_y, work_w, work_h, scale) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let area = m.work_area();
            (
                area.position.x,
                area.position.y,
                area.size.width as i32,
                area.size.height as i32,
                m.scale_factor(),
            )
        })
        .unwrap_or((0, 0, 1920, 1080, 1.0));

    let w = (width as f64 * scale).round() as i32;
    let h = (height as f64 * scale).round() as i32;
    let margin = (16.0 * scale).round() as i32;
    let gap = (12.0 * scale).round() as i32;

    // 默认落点:主屏工作区右上角(右缘/顶各留 16)
    let (mut x, mut y) = preferred.unwrap_or((work_x + work_w - margin - w, work_y + margin));

    // AABB:与任一可见便签相交就把 y 压到所有相交便签的最低下缘 + 12,直到不相交;
    // 压出工作区下缘则另起一列(x 左移 w+12,y 回顶)重新找。上限 64 轮兜底。
    for _ in 0..64 {
        let mut lowest: Option<i32> = None;
        for r in &occupied {
            let hit = x < r.2 && r.0 < x + w && y < r.3 && r.1 < y + h;
            if hit {
                lowest = Some(lowest.map_or(r.3, |b| b.max(r.3)));
            }
        }
        match lowest {
            None => break,
            Some(bottom) => y = bottom + gap,
        }
        if y + h > work_y + work_h {
            x -= w + gap;
            y = work_y + margin;
            if x < work_x {
                break; // 屏幕摆不下了,放弃避让
            }
        }
    }

    tauri::PhysicalPosition::new(x, y)
}

/// 创建便签窗口(label = note-<taskId>),并挂位置/尺寸持久化与销毁清理。
/// 启动重建(open_task_note / setup)共用。
pub(crate) fn build_note_window(
    app: &AppHandle,
    db: Arc<Mutex<Connection>>,
    note: &TaskNote,
) -> Result<(), AppError> {
    let label = note_label(&note.task_id);
    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }

    // 折叠态按迷你条尺寸直接建窗;展开态恢复持久化尺寸
    let (init_w, init_h) = if note.collapsed {
        (COLLAPSED_WIDTH, COLLAPSED_HEIGHT)
    } else {
        (note.width as f64, note.height as f64)
    };

    let win = tauri::WebviewWindowBuilder::new(
        app,
        &label,
        tauri::WebviewUrl::App(format!("/?note={}", note.task_id).into()),
    )
    .title("任务便签")
    .inner_size(init_w, init_h)
    .decorations(false)
    .always_on_top(note.always_on_top)
    .skip_taskbar(true)
    .resizable(false)
    .visible(false)
    .transparent(true)
    .shadow(false)
    .build()
    .map_err(|e| AppError::Generic(format!("创建便签窗口失败: {}", e)))?;

    // 位置:已有坐标直接恢复;否则由 find_free_position 找不与可见便签重叠的空位。
    // 注意:必须在挂事件监听之前完成初始定位——建窗时 Moved(0,0) 等噪声事件
    // 不应落库(实测程序式 set_position 不触发 Moved,但建窗瞬间的 (0,0) 会)。
    let initial_pos = match (note.x, note.y) {
        (Some(x), Some(y)) => Some(tauri::PhysicalPosition::new(x, y)),
        _ => Some(find_free_position(
            app,
            init_w as i32,
            init_h as i32,
            None,
        )),
    };
    if let Some(pos) = initial_pos {
        let _ = win.set_position(pos);
    }

    let tracker = Arc::new(Mutex::new(BoundsTracker {
        x: note.x.unwrap_or(0),
        y: note.y.unwrap_or(0),
        width: note.width,
        height: note.height,
        last_write: Instant::now() - Duration::from_millis(800),
        flush_scheduled: false,
    }));

    {
        let db = Arc::clone(&db);
        let tracker = Arc::clone(&tracker);
        let task_id = note.task_id.clone();
        let win_event = win.clone();
        let app_handle = app.clone();
        win.on_window_event(move |event| match event {
            tauri::WindowEvent::Moved(pos) => {
                if let Ok(mut t) = tracker.lock() {
                    t.x = pos.x;
                    t.y = pos.y;
                }
                on_bounds_changed(&db, &task_id, &tracker);
            }
            tauri::WindowEvent::Resized(size) => {
                // 事件载荷是物理像素,换算回逻辑像素,与 inner_size 保持一致
                let scale = win_event.scale_factor().unwrap_or(1.0);
                if let Ok(mut t) = tracker.lock() {
                    t.width = (size.width as f64 / scale).round() as i32;
                    t.height = (size.height as f64 / scale).round() as i32;
                }
                on_bounds_changed(&db, &task_id, &tracker);
            }
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // 关键:本进程内一旦 destroy 任何窗口,后续 WebviewWindowBuilder::build()
                // 必死锁(实测于 tauri 2.11 / Windows WebView2)。因此便签窗口只隐藏不销毁,
                // 系统级关闭(Alt+F4 等)一律拦截转为"取消固定并隐藏"。
                api.prevent_close();
                let w = win_event.clone();
                let _ = w.hide();
                if let Ok(conn) = db.lock() {
                    let _ = task_note_repo::delete(&conn, &task_id);
                }
                let _ = app_handle.emit("task-notes-changed", ());
            }
            tauri::WindowEvent::Destroyed => {
                // 理论上不会到达(见 CloseRequested 注释);保留为兜底清理。
                if let Ok(conn) = db.lock() {
                    let _ = task_note_repo::delete(&conn, &task_id);
                }
                let _ = app_handle.emit("task-notes-changed", ());
            }
            _ => {}
        });
    }

    let _ = win.show();
    // 启动早期 set_position 在隐藏窗口上可能不生效,show 后再落一次
    if let Some(pos) = initial_pos {
        let _ = win.set_position(pos);
    }
    Ok(())
}

// 必须 async:同步 command 跑在主线程,主 STA 线程上同步创建 WebView2 控制器
// 会重入死锁(wry#583 / wry#1665,Windows 必现);async command 在线程池执行,
// build() 通过事件循环代理创建窗口,规避死锁。
#[tauri::command(rename_all = "snake_case")]
pub async fn open_task_note(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), AppError> {
    let note = {
        let conn = state.db()?;
        let count = task_note_repo::count(&conn)?;
        let existing = task_note_repo::get(&conn, &task_id)?;
        if existing.is_none() && count >= MAX_NOTES {
            return Err(AppError::Generic("便签数量已达上限（8 个）".to_string()));
        }
        // 新建便签的皮肤用设置页的"默认皮肤"(默认便签纸);已有便签保留其皮肤
        let default_style: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'note_default_style'",
                rusqlite::params![],
                |row| row.get(0),
            )
            .ok()
            .filter(|s: &String| NOTE_STYLES.contains(&s.as_str()))
            .unwrap_or_else(|| "paper".to_string());
        task_note_repo::upsert(&conn, &task_id, &default_style)?
    };

    // 窗口已存在(之前被"关闭"只是隐藏) → 直接复用:按行重放标志后显示。
    // 绝不销毁重建——本进程内 destroy 后再 build 必死锁。
    if let Some(win) = app.get_webview_window(&note_label(&task_id)) {
        let _ = win.set_always_on_top(note.always_on_top);
        let (w, h) = if note.collapsed {
            (COLLAPSED_WIDTH, COLLAPSED_HEIGHT)
        } else {
            (note.width as f64, note.height as f64)
        };
        // 隐藏的窗口重新显示前,若会与其它可见便签重叠则挪到空位。
        // 窗口自身处于隐藏状态,不参与 find_free_position 的占位收集,无需排除。
        if !win.is_visible().unwrap_or(false) {
            let preferred = match (note.x, note.y) {
                (Some(x), Some(y)) => Some((x, y)),
                _ => win.outer_position().ok().map(|p| (p.x, p.y)),
            };
            let pos = find_free_position(&app, w as i32, h as i32, preferred);
            let _ = win.set_position(pos);
        }
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("task-notes-changed", ());
        return Ok(());
    }

    build_note_window(&app, Arc::clone(&state.db), &note)?;
    let _ = app.emit("task-notes-changed", ());
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn close_task_note(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
) -> Result<(), AppError> {
    {
        let conn = state.db()?;
        task_note_repo::delete(&conn, &task_id)?;
    }
    // 只隐藏不销毁:destroy 后任何 build() 都会死锁(见 build_note_window 注释)
    if let Some(win) = app.get_webview_window(&note_label(&task_id)) {
        let _ = win.hide();
    }
    let _ = app.emit("task-notes-changed", ());
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_task_note(
    state: State<AppState>,
    task_id: String,
) -> Result<Option<TaskNote>, AppError> {
    let conn = state.db()?;
    task_note_repo::get(&conn, &task_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_all_task_notes(state: State<AppState>) -> Result<Vec<TaskNote>, AppError> {
    let conn = state.db()?;
    task_note_repo::get_all(&conn)
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_note_always_on_top(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    on: bool,
) -> Result<(), AppError> {
    {
        let conn = state.db()?;
        task_note_repo::update_always_on_top(&conn, &task_id, on)?;
    }
    if let Some(win) = app.get_webview_window(&note_label(&task_id)) {
        let _ = win.set_always_on_top(on);
    }
    let _ = app.emit("task-notes-changed", ());
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_note_style(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    style: String,
) -> Result<(), AppError> {
    if !NOTE_STYLES.contains(&style.as_str()) {
        return Err(AppError::Validation(format!("无效的便签皮肤: {}", style)));
    }
    {
        let conn = state.db()?;
        task_note_repo::update_style(&conn, &task_id, &style)?;
    }
    let _ = app.emit_to(note_label(&task_id), "note-style-changed", style);
    let _ = app.emit("task-notes-changed", ());
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_note_collapsed(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    collapsed: bool,
) -> Result<(), AppError> {
    // 先落库再调窗口尺寸:set_size 触发的 Resized 事件节流写库时,
    // write_bounds 读到 collapsed=1 就只写位置,不会用 36px 覆盖展开态宽高。
    let note = {
        let conn = state.db()?;
        task_note_repo::update_collapsed(&conn, &task_id, collapsed)?;
        task_note_repo::get(&conn, &task_id)?
    };
    if let (Some(win), Some(note)) = (app.get_webview_window(&note_label(&task_id)), note) {
        let (w, h) = if collapsed {
            (COLLAPSED_WIDTH, COLLAPSED_HEIGHT)
        } else {
            (note.width as f64, note.height as f64)
        };
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));
    }
    let _ = app.emit("task-notes-changed", ());
    Ok(())
}
