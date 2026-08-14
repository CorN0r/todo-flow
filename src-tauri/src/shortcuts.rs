#[cfg(not(mobile))]
mod desktop {
    use std::collections::HashMap;

    use rusqlite::Connection;
    use serde::Deserialize;
    use tauri::AppHandle;
    use tauri::Manager;
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

    use crate::error::AppError;

    #[derive(Debug, Clone, Deserialize)]
    struct ShortcutConfig {
        keys: String,
        enabled: bool,
    }

    /// 将规范化的快捷键字符串 (如 "Ctrl+Shift+T") 解析为 Tauri Shortcut
    pub fn parse_keys_to_shortcut(keys: &str) -> Result<Shortcut, AppError> {
        let parts: Vec<&str> = keys.split('+').map(|s| s.trim()).collect();
        if parts.is_empty() {
            return Err(AppError::Validation("快捷键不能为空".to_string()));
        }

        let mut modifiers = Modifiers::empty();
        let mut code: Option<Code> = None;

        for part in &parts {
            match *part {
                "Ctrl" | "ctrl" => modifiers |= Modifiers::CONTROL,
                "Shift" | "shift" => modifiers |= Modifiers::SHIFT,
                "Alt" | "alt" => modifiers |= Modifiers::ALT,
                "Super" | "Win" | "Meta" | "super" | "win" | "meta" => {
                    modifiers |= Modifiers::SUPER
                }
                // 主键
                other => {
                    let c = parse_code(other)?;
                    code = Some(c);
                }
            }
        }

        let code = code.ok_or_else(|| AppError::Validation("缺少有效按键".to_string()))?;

        let mods = if modifiers.is_empty() {
            None
        } else {
            Some(modifiers)
        };
        Ok(Shortcut::new(mods, code))
    }

    fn parse_code(key: &str) -> Result<Code, AppError> {
        match key {
            // 字母
            s if s.len() == 1 && s.chars().next().unwrap().is_ascii_alphabetic() => {
                let upper = s.to_uppercase();
                match upper.as_str() {
                    "A" => Ok(Code::KeyA),
                    "B" => Ok(Code::KeyB),
                    "C" => Ok(Code::KeyC),
                    "D" => Ok(Code::KeyD),
                    "E" => Ok(Code::KeyE),
                    "F" => Ok(Code::KeyF),
                    "G" => Ok(Code::KeyG),
                    "H" => Ok(Code::KeyH),
                    "I" => Ok(Code::KeyI),
                    "J" => Ok(Code::KeyJ),
                    "K" => Ok(Code::KeyK),
                    "L" => Ok(Code::KeyL),
                    "M" => Ok(Code::KeyM),
                    "N" => Ok(Code::KeyN),
                    "O" => Ok(Code::KeyO),
                    "P" => Ok(Code::KeyP),
                    "Q" => Ok(Code::KeyQ),
                    "R" => Ok(Code::KeyR),
                    "S" => Ok(Code::KeyS),
                    "T" => Ok(Code::KeyT),
                    "U" => Ok(Code::KeyU),
                    "V" => Ok(Code::KeyV),
                    "W" => Ok(Code::KeyW),
                    "X" => Ok(Code::KeyX),
                    "Y" => Ok(Code::KeyY),
                    "Z" => Ok(Code::KeyZ),
                    _ => Err(AppError::Validation(format!("无效按键: {}", key))),
                }
            }
            // 数字
            s if s.len() == 1 && s.chars().next().unwrap().is_ascii_digit() => match s {
                "0" => Ok(Code::Digit0),
                "1" => Ok(Code::Digit1),
                "2" => Ok(Code::Digit2),
                "3" => Ok(Code::Digit3),
                "4" => Ok(Code::Digit4),
                "5" => Ok(Code::Digit5),
                "6" => Ok(Code::Digit6),
                "7" => Ok(Code::Digit7),
                "8" => Ok(Code::Digit8),
                "9" => Ok(Code::Digit9),
                _ => Err(AppError::Validation(format!("无效数字键: {}", key))),
            },
            // 符号键
            "?" | "/" => Ok(Code::Slash),
            "." | ">" => Ok(Code::Period),
            "," | "<" => Ok(Code::Comma),
            ";" | ":" => Ok(Code::Semicolon),
            "'" | "\"" => Ok(Code::Quote),
            "[" | "{" => Ok(Code::BracketLeft),
            "]" | "}" => Ok(Code::BracketRight),
            "\\" | "|" => Ok(Code::Backslash),
            "-" | "_" => Ok(Code::Minus),
            "=" | "+" => Ok(Code::Equal),
            "`" | "~" => Ok(Code::Backquote),
            // 功能键
            "F1" => Ok(Code::F1),
            "F2" => Ok(Code::F2),
            "F3" => Ok(Code::F3),
            "F4" => Ok(Code::F4),
            "F5" => Ok(Code::F5),
            "F6" => Ok(Code::F6),
            "F7" => Ok(Code::F7),
            "F8" => Ok(Code::F8),
            "F9" => Ok(Code::F9),
            "F10" => Ok(Code::F10),
            "F11" => Ok(Code::F11),
            "F12" => Ok(Code::F12),
            // 导航键
            "Escape" | "Esc" => Ok(Code::Escape),
            "Enter" | "Return" => Ok(Code::Enter),
            "Tab" => Ok(Code::Tab),
            "Space" => Ok(Code::Space),
            "Backspace" => Ok(Code::Backspace),
            "Delete" | "Del" => Ok(Code::Delete),
            "Insert" => Ok(Code::Insert),
            "Home" => Ok(Code::Home),
            "End" => Ok(Code::End),
            "PageUp" => Ok(Code::PageUp),
            "PageDown" => Ok(Code::PageDown),
            "ArrowUp" => Ok(Code::ArrowUp),
            "ArrowDown" => Ok(Code::ArrowDown),
            "ArrowLeft" => Ok(Code::ArrowLeft),
            "ArrowRight" => Ok(Code::ArrowRight),
            _ => Err(AppError::Validation(format!("无法识别的按键: {}", key))),
        }
    }

    pub type GlobalShortcutMap = HashMap<Shortcut, String>;

    /// 仅属于 Rust 后端管理的全局快捷键 ID（scope=rust）
    const RUST_SCOPE_IDS: &[&str] = &["global-show-window", "global-toggle-notes"];

    /// 从 DB 加载快捷键配置并注册所有全局快捷键
    pub fn register_global_shortcuts(app: &AppHandle, conn: &Connection) -> Result<(), AppError> {
        // 快捷键总开关关闭时,不注册任何全局热键(Ctrl+Shift+T 也一并禁用)
        let enabled: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'shortcuts_enabled'",
                rusqlite::params![],
                |row| row.get(0),
            )
            .ok();
        if enabled.as_deref() == Some("0") {
            return Ok(());
        }

        let raw: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'keyboard_shortcuts'",
                rusqlite::params![],
                |row| row.get(0),
            )
            .ok();

        let shortcuts = parse_global_shortcuts(&raw)
            .map(merge_missing_defaults)
            .unwrap_or_else(get_default_global_shortcuts);

        // 构建快速查找映射
        let mut lookup: GlobalShortcutMap = HashMap::new();

        for (id, config) in &shortcuts {
            // 只注册 Rust 范围的全局快捷键，前端快捷键由前端自行处理
            if !RUST_SCOPE_IDS.contains(&id.as_str()) {
                continue;
            }
            if !config.enabled {
                continue;
            }
            let shortcut = parse_keys_to_shortcut(&config.keys)?;
            // 忽略重复注册
            if lookup.contains_key(&shortcut) {
                continue;
            }
            lookup.insert(shortcut.clone(), id.clone());

            match app.global_shortcut().register(shortcut) {
                Ok(_) => {}
                Err(e) => {
                    eprintln!(
                        "Warning: Failed to register global shortcut {} ({}): {}",
                        id, config.keys, e
                    );
                }
            }
        }

        // 将映射存入 AppState 供 handler 使用
        if let Some(state) = app.try_state::<crate::AppState>() {
            if let Ok(mut map) = state.global_shortcut_map.lock() {
                *map = lookup;
            }
        }

        Ok(())
    }

    /// 当用户修改快捷键后，重新加载全局快捷键
    pub fn reload_global_shortcuts(app: &AppHandle, conn: &Connection) -> Result<(), AppError> {
        // 先注销所有已注册的全局快捷键
        if let Some(state) = app.try_state::<crate::AppState>() {
            let to_unregister: Vec<Shortcut> = {
                state
                    .global_shortcut_map
                    .lock()
                    .map_err(|e| AppError::Lock(e.to_string()))?
                    .keys()
                    .cloned()
                    .collect()
            };
            for shortcut in to_unregister {
                let _ = app.global_shortcut().unregister(shortcut);
            }
        }

        // 重新注册
        register_global_shortcuts(app, conn)
    }

    fn parse_global_shortcuts(raw: &Option<String>) -> Option<HashMap<String, ShortcutConfig>> {
        let raw = raw.as_ref()?;
        serde_json::from_str::<HashMap<String, ShortcutConfig>>(raw).ok()
    }

    /// 老用户配置合并:DB 里的 JSON 可能缺少后加的快捷键 id,用默认值补齐缺失项。
    /// 只补缺失,不覆盖用户已有配置(含用户改键/禁用)。
    fn merge_missing_defaults(
        mut parsed: HashMap<String, ShortcutConfig>,
    ) -> HashMap<String, ShortcutConfig> {
        for (id, config) in get_default_global_shortcuts() {
            parsed.entry(id).or_insert(config);
        }
        parsed
    }

    fn get_default_global_shortcuts() -> HashMap<String, ShortcutConfig> {
        let mut map = HashMap::new();
        map.insert(
            "global-show-window".into(),
            ShortcutConfig {
                keys: "Ctrl+Shift+T".into(),
                enabled: true,
            },
        );
        map.insert(
            "global-toggle-notes".into(),
            ShortcutConfig {
                keys: "Alt+D".into(),
                enabled: true,
            },
        );
        map
    }

    /// 根据快捷键 ID 执行对应的全局操作
    pub fn handle_global_shortcut_action(app: &AppHandle, id: &str) {
        match id {
            "global-show-window" => {
                if let Some(window) = app.get_webview_window("main") {
                    let visible = window.is_visible().unwrap_or(false);
                    let focused = window.is_focused().unwrap_or(false);
                    let minimized = window.is_minimized().unwrap_or(false);
                    if visible && focused && !minimized {
                        // 窗口在前台 → 隐藏主窗口，显示悬浮窗
                        let _ = window.hide();
                        // 悬浮窗被禁用时（widget_enabled='0'）不显示
                        let widget_enabled = if let Some(state) = app.try_state::<crate::AppState>() {
                            state
                                .db()
                                .ok()
                                .and_then(|db| {
                                    db.query_row(
                                        "SELECT value FROM settings WHERE key = 'widget_enabled'",
                                        rusqlite::params![],
                                        |row| row.get::<_, String>(0),
                                    )
                                    .ok()
                                })
                                .map(|v| v != "0")
                                .unwrap_or(true)
                        } else {
                            true
                        };
                        if widget_enabled {
                            if let Some(widget) = app.get_webview_window("widget") {
                                let _ = widget.show();
                            }
                        }
                    } else {
                        // 不可见 / 最小化 / 在后台 → 显示主窗口，隐藏悬浮窗
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                        if let Some(widget) = app.get_webview_window("widget") {
                            let _ = widget.hide();
                        }
                    }
                }
            }
            "global-toggle-notes" => {
                // 有任意可见便签 → 全部隐藏;否则显示 task_notes 表里仍有行的便签。
                // 取消固定的窗口只是隐藏(僵尸窗口,不能 destroy),对不上行的跳过。
                let note_windows: Vec<(String, tauri::WebviewWindow)> = app
                    .webview_windows()
                    .into_iter()
                    .filter(|(label, _)| label.starts_with("note-"))
                    .collect();
                let any_visible = note_windows
                    .iter()
                    .any(|(_, w)| w.is_visible().unwrap_or(false));
                if any_visible {
                    for (_, w) in &note_windows {
                        let _ = w.hide();
                    }
                } else {
                    for (label, w) in &note_windows {
                        let task_id = &label["note-".len()..];
                        let pinned = app
                            .try_state::<crate::AppState>()
                            .and_then(|state| {
                                state.db().ok().map(|conn| {
                                    crate::db::task_note_repo::get(&conn, task_id)
                                        .ok()
                                        .flatten()
                                        .is_some()
                                })
                            })
                            .unwrap_or(false);
                        if pinned {
                            // show 只让窗口可见,不会抬到其它应用之上;
                            // 逐个 set_focus 把便签抬到前台,确保"显示"真的看得见
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                }
            }
            _ => {}
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn test_parse_ctrl_shift_t() {
            let result = parse_keys_to_shortcut("Ctrl+Shift+T");
            assert!(result.is_ok());
        }

        #[test]
        fn test_parse_single_key() {
            let result = parse_keys_to_shortcut("N");
            assert!(result.is_ok());
        }

        #[test]
        fn test_parse_with_spaces() {
            let result = parse_keys_to_shortcut("Ctrl + Shift + T");
            assert!(result.is_ok());
        }

        #[test]
        fn test_parse_invalid_key() {
            let result = parse_keys_to_shortcut("InvalidKey");
            assert!(result.is_err());
        }

        #[test]
        fn test_parse_empty_string() {
            let result = parse_keys_to_shortcut("");
            assert!(result.is_err());
        }

        #[test]
        fn test_parse_alt_d() {
            let result = parse_keys_to_shortcut("Alt+D");
            assert!(result.is_ok());
        }

        #[test]
        fn test_merge_adds_missing_new_shortcut() {
            // 老用户配置:只有 global-show-window,缺后加的 global-toggle-notes → 补默认值
            let mut old = HashMap::new();
            old.insert(
                "global-show-window".to_string(),
                ShortcutConfig {
                    keys: "Ctrl+Shift+T".into(),
                    enabled: true,
                },
            );
            let merged = merge_missing_defaults(old);
            assert_eq!(merged["global-toggle-notes"].keys, "Alt+D");
            assert!(merged["global-toggle-notes"].enabled);
            assert_eq!(merged["global-show-window"].keys, "Ctrl+Shift+T");
        }

        #[test]
        fn test_merge_preserves_user_config() {
            // 用户已改键/禁用 → 保留;已存在的新 id 也不被默认值覆盖
            let mut user = HashMap::new();
            user.insert(
                "global-show-window".to_string(),
                ShortcutConfig {
                    keys: "Ctrl+Alt+W".into(),
                    enabled: false,
                },
            );
            user.insert(
                "global-toggle-notes".to_string(),
                ShortcutConfig {
                    keys: "Alt+N".into(),
                    enabled: true,
                },
            );
            let merged = merge_missing_defaults(user);
            assert_eq!(merged["global-show-window"].keys, "Ctrl+Alt+W");
            assert!(!merged["global-show-window"].enabled);
            assert_eq!(merged["global-toggle-notes"].keys, "Alt+N");
        }
    }
}

#[cfg(not(mobile))]
pub use desktop::*;

#[cfg(mobile)]
pub fn register_global_shortcuts(
    _app: &tauri::AppHandle,
    _conn: &rusqlite::Connection,
) -> Result<(), crate::error::AppError> {
    Ok(())
}

#[cfg(mobile)]
pub fn reload_global_shortcuts(
    _app: &tauri::AppHandle,
    _conn: &rusqlite::Connection,
) -> Result<(), crate::error::AppError> {
    Ok(())
}

#[cfg(mobile)]
pub fn handle_global_shortcut_action(_app: &tauri::AppHandle, _id: &str) {}
