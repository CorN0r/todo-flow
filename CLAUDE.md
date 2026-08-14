# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TodoFlow is a Windows desktop TODO app built with **Tauri v2** (Rust backend + React 19/TypeScript frontend).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"` in index.css, no config file) |
| State — server | TanStack Query v5 |
| State — client | Zustand v5 |
| Routing | react-router-dom v7 (MemoryRouter) |
| Database | SQLite via rusqlite (bundled, WAL mode) |
| Icons | lucide-react |
| Toast | sonner |
| Animation | motion (framer-motion successor) |
| Notification | tauri-plugin-notification |
| i18n | react-i18next (keys defined, components use hardcoded Chinese) |

---

## Common Commands

```bash
npm run dev              # Vite dev server on port 1420
npm run tauri dev        # Tauri dev mode (Rust backend + frontend)
npm run build            # TypeScript check + Vite production build
npm run tauri build      # Full Tauri production build
npm test                 # Run vitest suite
npm run test:smoke       # Fast subset of tests
npm run test:rust        # Rust tests (cd src-tauri && cargo test，含 lib + 集成 + MCP 端到端)
npm run lint             # ESLint (flat config)
```

Port 1420 frequently conflicts. Kill the lingering process before launching:
```powershell
taskkill /F /IM todo-flow.exe; Start-Sleep -Seconds 1; npx tauri dev
```

**Important**: Vite HMR does NOT reliably update the widget, pomodoro, or note windows (separate WebViews). After changes to `WidgetPage.tsx`, `PomodoroWidgetPage.tsx`, `NotePage.tsx` or `NoteCard.tsx`, kill the process and restart — these windows load stale code otherwise.

---

## Multi-Window Architecture

TodoFlow has three fixed Tauri WebView windows (created in `src-tauri/src/lib.rs`) plus dynamically created **desktop note windows**:

| Window | Label | Size | Flags |
|--------|-------|------|-------|
| **main** | `"main"` | 1200×800 | Default window, resizeable, can hide to tray |
| **widget** | `"widget"` | 300×420 (min 80×80) | `decorations(false)`, `always_on_top(true)`, `transparent(true)`, `skip_taskbar(true)` |
| **pomodoro** | `"pomodoro"` | 190×200 | `decorations(false)`, `always_on_top(true)`, `transparent(true)`, `skip_taskbar(true)`, `resizable(true)` |
| **note** | `note-<taskId>` | 280×auto (collapsed 280×36) | `decorations(false)`, `transparent(true)`, `skip_taskbar(true)`, `always_on_top` 按行 |

The widget window loads `/?widget=1`, pomodoro loads `/?pomodoro=1`, notes load `/?note=<taskId>`. MemoryRouter detects these query params in `src/platform/appSurface.ts` / `App.tsx` to route to the correct page.

**Cross-window communication** uses Tauri events (`emit`/`listen`):

| Event | Direction | Purpose |
|-------|-----------|---------|
| `theme-changed` | main → widget, pomodoro | Sync theme across windows |
| `pomodoro-state` | main → widget, pomodoro | Sync timer state (every second) |
| `pomodoro-control` | pomodoro → main | Control actions (pause/resume/skip/reset/stop) |
| `bubble-color-changed` | main → widget | Sync custom bubble gradient |
| `task-changed` | broadcast | Task data changed; all windows invalidate queries |
| `task-notes-changed` | broadcast | task_notes 行增删/置顶/皮肤/折叠变更 |
| `note-style-changed` | main → `note-<id>` | 便签皮肤热切换 |
| `note-interact` | note ↔ note | 某便签内 mousedown 广播,其它便签关闭右键菜单 |
| `widget-shown` | main → widget | 悬浮窗被显示(关主窗/隐藏到托盘),前端收成气泡并收拢位置 |

Windows that are separate WebViews have their own React instances, Zustand stores, and DOM. They do NOT share state — all state sync is via Tauri events.

---

## Desktop Notes (任务桌面便签)

把一个任务以无边框透明小窗固定到桌面。入口:任务右键菜单 / 任务详情「固定到桌面」。一任务一便签（`task_notes.task_id` 主键），上限 8 个（`MAX_NOTES`）。

### 窗口生命周期的血泪教训（必须遵守）

1. **任何窗口都不能 destroy**。本进程内 destroy 任何 WebView2 窗口后，后续 `WebviewWindowBuilder::build()` 在 Windows 上**主线程死锁**（wry#583 / wry#1665，主 STA 线程同步建控制器重入）。`close_task_note` = hide + 删行；便签的 `CloseRequested` 已拦截（`api.prevent_close()` → hide + 删行）。被隐藏的僵尸窗口属正常，进程退出时清理。
2. **`open_task_note` 必须是 `async fn`**。同步 command 跑在主线程，build() 必死锁；async command 在线程池执行，build 经事件循环代理，安全。启动时 setup() 里建窗是安全的（事件循环尚未泵消息）。
3. **拖区语义**：裸 `data-tauri-drag-region` = self 模式，只有**直接点中元素本体**才触发拖动；`"deep"` = 子树任意位置（可点击元素 button/a/input 自动排除）。main Header、便签标题栏、迷你条都用/曾踩过 self 的坑。
4. **拖区会吃掉 click**：点在拖区上时 Tauri 调 `start_dragging` 进入 OS 模态拖动循环，后续的 mouseup/click 不再到达页面。所以可点击展开的区域（如迷你条）不能放拖区；拖区上的自定义 onClick 都会失效。
5. **独立小窗的 DOM focus/blur 事件不可靠**（可能从未获得 DOM focus）。"点了别的便签就关菜单"这类需求用 `note-interact` 广播，别用 blur。

### 便签结构

- 前端：`src/pages/NotePage.tsx`（窗口自适应高度 ResizeObserver、右键菜单、皮肤化菜单）+ `src/components/notes/NoteCard.tsx`（三皮肤 `SKINS` 令牌：glass/paper/minimal，皮肤自带底色、**不跟随应用主题**）+ `src/lib/noteCountdown.ts`（倒计时纯函数）+ `src/hooks/useTaskNotes.ts`。
- 皮肤：每张便签的皮肤存在 `task_notes.style`；**默认皮肤 = settings `note_default_style`（默认 `paper`，设置页可改）**，仅新建便签时读取。右键菜单可切换，皮肤化菜单样式在 NotePage 的 `MENU_SKINS`。
- 右键菜单两个要点：① 外点关闭监听必须挂 **capture 阶段**（Tauri 拖区处理器在 document 冒泡阶段 `stopImmediatePropagation`，冒泡监听收不到）；② 菜单高度可能超过窗口——打开时临时 `setSize` 加高窗口容纳菜单，关闭时恢复。
- 平铺：`find_free_position()`（note_commands.rs）按可见便签的实际占位矩形找空位，避免重叠；新钉和重开都走它。
- **Capabilities**：便签窗口 label 是动态的（`note-<taskId>`），`capabilities/default.json` 的 `windows` 用 `"note-*"` 通配匹配；新增窗口 API 权限时注意覆盖该模式。
- 透明窗口边界即裁剪边界：卡片外层留白必须 ≥ 阴影模糊半径（现 14px），否则阴影被裁成黑边。
- HMR 对便签窗口同样不可靠（同 widget/pomodoro），改 NotePage/NoteCard 后要重启进程或 reload 该窗口。

---

## Project Structure

```
src/
├── components/
│   ├── layout/       Sidebar, Header, TaskDetailPanel
│   ├── tasks/        TaskCard, TaskList, TaskDetail, TaskQuickAdd, UnifiedLayout
│   ├── notes/        NoteCard（桌面便签卡片,三皮肤 SKINS 令牌）
│   ├── calendar/     MonthView, WeekView, DayView
│   ├── shared/       CommandPalette, SearchBar, DatePicker, KeyCapture, ShortcutEditor,
│   │                 ErrorBoundary, PomodoroFullscreen, Portal, ...
│   └── attachments/  AttachmentZone, ImageLightbox
├── pages/            TodayPage, CalendarPage, TagPage, SearchPage, DashboardPage,
│                     SettingsPage, WidgetPage, PomodoroWidgetPage, NotePage(桌面便签窗口),
│                     FocusStatsPage, ...
├── hooks/            useTasks, useTags, useTheme, useKeyboardShortcuts, usePomodoroSync,
│                     useTaskNotes(便签固定/取消固定)
├── stores/           uiStore.ts, shortcutStore.ts, pomodoroStore.ts, calendarStore.ts
├── lib/              db.ts (Tauri invoke wrappers), date.ts, cn.ts, priority.ts,
│                     noteCountdown.ts(便签倒计时), ...
├── sync-client/      conflicts.ts, engine.ts (本地优先跨端同步客户端,对接外部 sync-server)
├── types/            task.ts, tag.ts, attachment.ts, shortcuts.ts, pomodoro.ts, note.ts
└── i18n/             locales/zh-CN.json, locales/en-US.json
src-tauri/
├── src/
│   ├── bin/mcp.rs       todoflow-mcp 二进制入口(clap parse → serve 或 CLI 子命令)
│   ├── commands/        task_commands, reminder_commands, tag_commands, settings_commands,
│   │                    shortcut_commands, widget_commands, stats_commands, habit_commands,
│   │                    attachment_commands, sync_commands, note_commands(桌面便签)
│   ├── db/              task_repo, reminder_repo, tag_repo, attachment_repo, habit_repo,
│   │                    sync_repo, task_note_repo, migrations, connection
│   ├── mcp/             mod.rs(MCP server + #[tool] 注册), handlers.rs(纯函数), cli.rs(clap)
│   ├── models/          task, task_reminder, tag, attachment, settings, habit, sync, task_note
│   ├── db_watcher.rs    DB 文件 mtime 轮询 → emit task-changed(外部写入检测)
│   ├── shortcuts.rs     Dynamic global shortcut registration + handler dispatch
│   └── reminders.rs     Background polling thread (60s interval)
```

---

## Keyboard Shortcuts

### Configurable (Settings → 快捷键)

| Default | ID | Scope |
|---------|-----|-------|
| Ctrl+Shift+T | global-show-window | Rust global — toggle main window show/hide |
| Alt+D | global-toggle-notes | Rust global — toggle all desktop note windows show/hide |
| Ctrl+K | command-palette | Frontend — open command palette |
| Ctrl+B | toggle-sidebar | Frontend — toggle sidebar |
| N | new-task | Frontend — focus quick-add input |
| Ctrl+Shift+P | pomodoro-toggle | Frontend — start pomodoro (no-op if already running) |

### Hardcoded

- **Escape** — exit selection mode, deselect task, or exit fullscreen (pomodoro window)
- **Browser shortcuts blocked**: Ctrl+P/S/U/R/H/J/D/O/T/W/N, F1/F3/F5/F11/F12, Alt+←/→, Backspace (outside inputs). Widget and pomodoro windows also block Ctrl+P/Shift+P to prevent print dialog.

### Shortcut Architecture

```
Settings UI (ShortcutEditor → KeyCapture)
       │ update shortcut
       ▼
shortcutStore (Zustand, persisted to SQLite settings key='keyboard_shortcuts')
       │
       ├── Frontend: useKeyboardShortcuts hook → actionMap → keydown handler dispatches
       │
       └── Rust: shortcuts::register_global_shortcuts() → OS hotkeys for RUST_SCOPE_IDS
```

`src/types/shortcuts.ts` is canonical: `SHORTCUT_DEFS`, defaults (`getDefaultShortcutMap`), normalization (`normalizeKeys`, `eventToNormalizedKeys`), conflict detection, validation. `scope: 'rust'` = OS-level global, `scope: 'frontend'` = app-level keydown listener.

---

## Pomodoro System

### Architecture

```
pomodoroStore (Zustand + localStorage persistence)
    │
    ├──→ Timer loop (store-managed setInterval, NOT per-component)
    │
    ├──→ usePomodoroSync hook (main window, invisible)
    │       · emits pomodoro-state to widget + pomodoro windows
    │       · listens for pomodoro-control from pomodoro window
    │       · shows/hides pomodoro standalone window
    │       · plays beep + sends Windows notification on completion
    │
    ├──→ PomodoroWidgetPage (standalone always-on-top window)
    │       · compact card (170px) with SVG ring + hover controls
    │       · drag-to-move with edge snapping (30px threshold, 400ms debounce)
    │       · fullscreen toggle (setFullscreen) with 400px ring
    │       · sends pomodoro-control events back to main window
    │
    └──→ PomodoroFullscreen (optional, main window)
            · route /pomodoro
            · calls win.setFullscreen(true) for true fullscreen
            · read-only display, no controls
```

### Key Design Decisions

- **Timer loop lives in the store** (`pomodoroStore.ts`). A Zustand `subscribe` watches `isRunning` and starts/stops a single `setInterval`. Components never create their own intervals — this prevents double-tick bugs when multiple components mount.
- **Completion detection** uses a `lastCompleted` signal field. Store sets `lastCompleted: 'focus'` when a phase ends. The sync hook watches this field → fires notification → clears it. This avoids the broken `minutes===0 && seconds===0` check (which never fires because `tick()` sets `minutes` to the next phase value in the same `set()` call).
- **Controls are on the standalone window only**. Main window has zero pomodoro UI. The sync hook (`<PomodoroSync />` in App.tsx) handles all cross-window logic invisibly.
- **sessionStartTime** determines window visibility. Only `stopTimer()` clears it. Phase transitions update it to a new ISO string — the window never disappears between phases.

### State Persistence

- `pomodoroConfig` → localStorage `pomodoroConfig`
- `dailyFocusMinutes` + `taskFocusMinutes` → localStorage `pomodoroHistory`
- Current timer state (taskId, minutes, seconds, etc.) → memory only, lost on restart

### Start Entries

1. TaskCard right-click → "开始番茄钟"
2. TaskDetail pill button → "番茄钟"
3. Ctrl+Shift+P (with or without selected task)

---

## Database Schema (migration v16)

- **tasks**: id, title, description, is_completed, is_archived, is_suspended, is_abandoned, is_pinned, priority (0-4), due_date, reminder, parent_task_id (self-ref, CASCADE), sort_order, recurrence (JSON), my_day_date, source (TEXT, `'agent'` = Agent 创建), reminded, created_at, updated_at + sync 字段 (deleted_at, server_revision, local_revision, last_modified_device_id, sync_status)
- **task_tags**: task_id + tag_id 多对多关联表 (PRIMARY KEY(task_id, tag_id))，任务多标签的唯一真相。`Task.tag_ids: Vec<String>` 经 `json_group_array` 聚合读取；旧 `tasks.tag_id` 列保留但弃用
- **task_reminders**: id, task_id (FK CASCADE), offset, reminder_time, reminded, created_at
- **task_notes**: task_id (PK, FK CASCADE), x, y, width, height, always_on_top, style, collapsed, created_at, updated_at（桌面便签，1:1，不进 sync 系统）
- **tags**: id, name, color, icon, sort_order, parent_tag_id (self-ref nesting)
- **attachments**: id, task_id, original_name, storage_name, mime_type, file_size, created_at
- **habits**: id, name, color, icon, frequency, target_count, sort_order
- **habit_logs**: id, habit_id (FK CASCADE), log_date, count, note. UNIQUE(habit_id, log_date)
- **settings**: key TEXT PRIMARY KEY, value TEXT — stores serialized preferences

### Agent Integration (MCP / CLI)

让 Claude Desktop / Claude Code / Cursor 等 Agent 直接读写任务。内置 MCP server + CLI 同一二进制 `todoflow-mcp`，本地直连 SQLite，与 GUI 共用同一 `todo.db`（WAL 并发安全）。

- **双 bin**：`Cargo.toml` 声明 `[[bin]] todo-flow`(GUI) + `[[bin]] todoflow-mcp`，并设 `default-run = "todo-flow"` 保证 `cargo run` 仍跑 GUI。MCP bin 在 `src-tauri/src/bin/mcp.rs`，链接 `todo_flow_lib`（db 层不依赖 tauri，可直接复用）
- **构建**：`tauri build` 会自动构建并打包 `todoflow-mcp`——Cargo.toml 里声明的额外 `[[bin]]` 会被 Tauri 当作 external binary 自动嵌入安装包，安装后与 `todo-flow.exe` 同目录。⚠️ **不要在 `bundle.resources` 里手动加它**：会导致同一文件被打包两次（NSIS 重复 File、MSI 的 WiX `light.exe` 报重复 Component 失败）
- **MCP server**：`todoflow-mcp serve`（stdio transport，`rmcp` 3.x）。⚠️ serve 模式 stdout 被协议独占，诊断一律 `eprintln!`
- **9 个 MCP 工具**（`#[tool_router(server_handler)]` + `#[tool]`，参数名 snake_case + doc 注释中文进 JSON Schema）：create_task / list_tasks / get_task / update_task / complete_task / reopen_task / delete_task / list_tags / create_tag
- **CLI 子命令**：add / list / get / update / done / reopen / delete / tags / create-tag，与 MCP 共享 `src-tauri/src/mcp/handlers.rs` 纯函数层
- **标签按名称自动创建**：`tag_names` 参数里不存在的标签自动建（写路径，`tag_repo::get_by_name` 查重）；`list_tasks` 过滤时未知标签名静默忽略
- **source 标记**：Agent 创建的任务写 `tasks.source = 'agent'`（GUI 手动创建为 NULL）。前端 `task.source === 'agent'` 时，列表/卡片标题前显示 Sparkles 图标，详情面板显示「由 Agent 创建」
- **GUI 实时刷新**：`src-tauri/src/db_watcher.rs` 轮询 `todo.db` + `todo.db-wal` 的 mtime（2s），检测外部写入后 emit `task-changed`。⚠️ WAL 写事务落在 -wal 文件，必须同时监控两个文件
- **数据目录**：`src-tauri/src/lib.rs` 的 `default_data_dir()`（Windows `%APPDATA%\com.todoflow.desktop`），CLI 用 `--db-path` 覆盖
- **端到端测试**：`cargo test --test mcp_stdio`（子进程跑真实二进制做 initialize → tools/list → tools/call，`env!("CARGO_BIN_EXE_todoflow-mcp")`）

## Settings Keys

| Key | Value | Used By |
|-----|-------|---------|
| `theme` | `light`/`dark`/`system`/`glass`/`warm`/`lumina` | useTheme, WidgetPage |
| `widget_enabled` | `"0"`/`"1"` | SettingsPage, WidgetPage, lib.rs |
| `widget_x`/`widget_y` | pixel strings | WidgetPage, lib.rs |
| `widget_size` | `"compact"`/`"normal"` | WidgetPage |
| `widget_bubble_color` | JSON `{from, via, to}` hex colors | WidgetPage, SettingsPage |
| `pomodoro_x` / `pomodoro_y` | pixel strings | PomodoroWidgetPage, lib.rs |
| `keyboard_shortcuts` | JSON `ShortcutMap` | shortcutStore |
| `shortcuts_enabled` | `"0"`/`"1"` | shortcuts.rs（总开关关闭时不注册任何全局热键） |
| `note_default_style` | `glass`/`paper`/`minimal`（默认 `paper`） | SettingsPage, note_commands.open_task_note |
| `pomodoroConfig` | localStorage, not DB | pomodoroStore |

---

## Key Architecture Patterns

### Scroll Container Clipping (App.tsx)
`<main>` wraps an inner `<div className="h-full overflow-y-auto">`. Per CSS spec, `overflow-y: auto` forces `overflow-x: auto` too, creating a **clipping container**. Use `<Portal>` (renders to `document.body`) for dropdowns/popups that must escape this container.

### Page Height — Never calc(100vh - Npx)
Layout: `h-screen → flex → Sidebar | flex-1 flex-col | TaskDetailPanel → Header → main flex-1 → div.h-full.overflow-y-auto → <Routes>`. Use `h-full flex flex-col` + `flex-1 min-h-0` on scrollable areas.

### Tauri invoke Parameters — CRITICAL
Tauri v2 defaults to **camelCase** for `invoke()` parameter names. Every `#[tauri::command]` MUST have explicit `rename_all = "snake_case"`.

### Portal Dropdown Positioning
ALL dropdowns/popups MUST use `<Portal>` + `fixed` positioning with `getBoundingClientRect()`. Context menus: `z-[200]`, confirm dialogs: `z-[300]`, pomodoro fullscreen: `z-[300]`.

### TanStack Query Invalidation
```tsx
queryClient.invalidateQueries({
  predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks'
});
```

### Due Date Format
`due_date` stores `"YYYY-MM-DD"` (date-only) or `"YYYY-MM-DD HH:mm"` (with time). Comparisons use `.slice(0, 10)`. `parseISO()` needs `.replace(' ', 'T')` first.

### Delete Flow & Undo
Call `setSelectedTaskId(null)` BEFORE `deleteTask.mutate(id)`. Undo via toast with 8s duration, recreating via `createTask.mutateAsync`.

### Tag Nesting — Two Levels Max
Tags support `parent_tag_id` (self-ref FK). UI only shows "添加子标签" when `depth === 0`.

### Widget Window — Edge Snapping & Screen Clamping
Bubble drag triggers `shouldSnapRef.current = true`. The `onMoved` event (400ms debounce) calls `snapToEdge()` — checks distance to screen edges (< 30px threshold) and snaps. `clampInScreen()` prevents widget from moving off-screen during expand/collapse. Multi-monitor: `getScreenBounds()` falls back to `availableMonitors()` if `currentMonitor()` returns null for the transparent window.

**Show 路径统一为气泡**：关主窗（X）和「隐藏到浮窗」都会 `emit_to("widget", "widget-shown")`，WidgetPage 收到后：面板态 → `collapseToBubble()`，气泡态 → `clampInScreen(60,60)`。挂载时也会校正"建窗 300×420 但模式是气泡"的尺寸错配并收拢位置——否则贴边保存的气泡位置会以 300×420 展开到屏幕外。

The Pomodoro standalone window uses the same edge snapping pattern (`PomodoroWidgetPage.tsx`) when dragged, and persists position via `pomodoro_x`/`pomodoro_y` settings. 番茄钟小窗无自定义右键菜单，已用 document 级 `contextmenu` preventDefault 禁用 WebView 原生菜单（WidgetPage/NotePage 有自定义右键处理，不需要）。

---

## Theme System

6 themes: `light`, `dark`, `system`, `glass`, `warm`, `lumina`. CSS variables defined in `src/index.css` per theme class (`.dark`, `.glass`, `.warm`, `.lumina`). The `.glass`/`.warm`/`.lumina` sections also contain Tailwind arbitrary value overrides for explicit hex colors (e.g., `.warm .text-[#7C72F6] { color: #C9A84C; }`).

WidgetPage uses JS ternary (`resolvedTheme === 'dark' ? X : Y`) instead of Tailwind `dark:` variants — so CSS theme overrides for widget must target direct classes (no `dark:` prefix). Widget bubble gradient is user-customizable via Settings (5 presets + custom color pickers, stored in `widget_bubble_color` setting).

---

## Design Tokens

| Token | Light | Dark |
|-------|-------|------|
| Primary | `#7C72F6` | `#7C72F6` |
| Card bg | `#FFFFFF` | `#1E1E32` |
| Card border | `#F3F4F6` | `white/0.06` |
| Main text | `#111827` | `white/90` |
| Input bg | `#F9FAFB` | `white/0.03` |

- Use explicit hex colors (`bg-[#7C72F6]`) rather than generic Tailwind utilities
- `cn()` for conditional class merging
- All UI text in Chinese (简体中文)
- No JSDoc — self-documenting identifiers
- No premature abstraction — three similar lines beats a shared helper

---

## Rich Text Editor (TipTap/ProseMirror)

Task descriptions use a TipTap WYSIWYG editor (`src/components/shared/RichTextEditor.tsx`) that stores HTML content in the `description` TEXT column. The editor supports: text formatting, images (pasted/dragged), tables, task lists, links, and a fullscreen mode.

### CSP: `img-src` 必须含 `data:`（否则 release 图片不显示）

图片以 `data:` URL 存储（粘贴/拖放都是 base64 data: URL）。生产 CSP（`tauri.conf.json` 的 `app.security.csp`）的 `img-src` 必须包含 `data:` 源，否则 **release 构建里图片被浏览器拦截，只显示 broken image 图标**。dev 模式不注入该 CSP（由 Vite 提供），所以 **dev 正常、release 才失败**——排查图片问题务必先看 CSP。

### Critical: ProseMirror DOMParser Strips `data:` URLs

**ProseMirror's built-in HTML parser silently discards `<img>` tags with `data:` URL src attributes.** This is the single most important fact about the rich text system:

- **Paste**: Works because `ImagePasteHandler` extension creates ProseMirror nodes directly via `view.dispatch(tr)`, bypassing HTML parsing.
- **Drag-drop (Tauri)**: Works because `getCurrentWindow().onDragDropEvent()` → `readFile()` → base64 → `insertContentAt({ type: 'image', attrs: { src } })`, bypassing HTML parsing.
- **Loading saved content / sync / fullscreen exit**: Must use `safeSetHTMLContent()` in `RichTextEditor.tsx`, which parses HTML with browser `DOMParser`, extracts images separately, and inserts them via `view.dispatch(editor.state.tr.insert(pos, imageNode))` — **never through `editor.commands.setContent()` or `insertContentAt()` with raw HTML**.

### Extensions

| Extension | Purpose |
|-----------|---------|
| `Image` | Node type + parse/serialize rules (plain TipTap Image) |
| `ImagePasteHandler` | ProseMirror plugin: paste handler, `handleDOMEvents.dragover` (for focus) |
| `ImageSelectionHighlight` | ProseMirror decoration plugin: adds `.img-in-selection` class to images within text selection range. Complements `ProseMirror-selectednode` (which only applies to NodeSelection). |

### Tauri Drag-Drop

Desktop file drag-drop bypasses the browser's DOM drop event. Uses:
```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';
import { readFile } from '@tauri-apps/plugin-fs';

getCurrentWindow().onDragDropEvent((event) => {
  if (event.payload.type === 'drop') {
    // event.payload.paths, event.payload.position
  }
});
```
The listener is registered ONCE (empty `useEffect` deps) via `editorRef` to prevent duplicate listeners. `readFile` reads file bytes → chunked base64 encoding (`btoa` with 8192-byte chunks to avoid stack overflow) → `insertContentAt` with `{ type: 'image', attrs: { src: dataUrl } }`.

### Multi-Image Paste/Drag

Uses module-level `pendingImageInserts` counter. The sync `useLayoutEffect` checks `pendingImageInserts > 0` and skips syncing to prevent `safeSetHTMLContent` from wiping images that haven't finished loading yet. Counter is incremented at paste/drag start and decremented in each `reader.onload` / `readFile.then` callback.

### Fullscreen Mode

`FullscreenEditor` sub-component with independent TipTap instance. On close, uses `safeSetHTMLContent` to transfer content back. `FullscreenEditor` also uses `safeSetHTMLContent` in a `useLayoutEffect` for initial content loading.

### TaskDetail Auto-Save

Description is included in the debounced auto-save (800ms). Two places must include `description`:
- `hasChanges` check in the save-triggering `useEffect`
- `doSave` function diffing against `taskRef.current`

`onBlur` on RichTextEditor flushes pending description saves immediately using `localRef` (a ref tracking latest `local` state) to avoid stale closures.

### Common Mistakes

1. **Never use `useEditor({ content: htmlWithImages })`** — images will be lost because `content` option goes through ProseMirror's DOMParser.
2. **Never use `editor.commands.setContent(htmlWithImages)`** — same reason.
3. **Memoize extensions**: `SHARED_EXTENSIONS(placeholder)` returns a new array each call, causing `useEditor` to recreate the editor on every render. Use `useMemo(() => SHARED_EXTENSIONS(placeholder), [placeholder])`.
4. **React StrictMode**: `useRef` initial values persist across the double-mount (mount → unmount → mount). Don't rely on `useRef(initialValue)` for comparisons; update refs in `useEffect` instead.
5. **Stale closures in save**: Use `localRef` (updated via `useEffect`) rather than `local` directly in callbacks that fire during unmount.

---

## TaskDetailPanel Resizability

`TaskDetailPanel.tsx` slide-in panel is resizable:
- Default width 540px, range 400–800px
- Left edge has a drag handle (5px wide, hover shows blue indicator + `GripVertical` icon)
- Width persisted to `localStorage` key `taskDetailPanelWidth`
- `mousemove`/`mouseup` listeners attached to `document` during drag

---

## PageTitle Component

`src/components/shared/PageTitle.tsx` — the header bar with title, filter chips, sort, view mode toggle, expand/collapse subtasks, multi-select, and new-task button. Key props: `filterMode`, `onFilterChange`, `sortMode`, `onSortChange`, `taskViewMode`, `onToggleViewMode`. Uses `globalSubtasksExpanded` from `uiStore` to toggle all subtasks across the current view.
