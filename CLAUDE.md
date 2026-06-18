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
npm run test:rust        # Rust tests (cd src-tauri && cargo test --lib)
npm run lint             # ESLint (flat config)
```

Port 1420 frequently conflicts. Kill the lingering process before launching:
```powershell
taskkill /F /IM todo-flow.exe; Start-Sleep -Seconds 1; npx tauri dev
```

**Important**: Vite HMR does NOT reliably update the widget or pomodoro windows (separate WebViews). After changes to `WidgetPage.tsx` or `PomodoroWidgetPage.tsx`, kill the process and restart — these windows load stale code otherwise.

---

## Multi-Window Architecture

TodoFlow has THREE Tauri WebView windows, all created in `src-tauri/src/lib.rs`:

| Window | Label | Size | Flags |
|--------|-------|------|-------|
| **main** | `"main"` | 1200×800 | Default window, resizeable, can hide to tray |
| **widget** | `"widget"` | 300×420 (min 80×80) | `decorations(false)`, `always_on_top(true)`, `transparent(true)`, `skip_taskbar(true)` |
| **pomodoro** | `"pomodoro"` | 190×200 | `decorations(false)`, `always_on_top(true)`, `transparent(true)`, `skip_taskbar(true)`, `resizable(true)` |

The widget window loads `/?widget=1`, pomodoro loads `/?pomodoro=1`. MemoryRouter detects these query params in `App.tsx` to route to the correct page.

**Cross-window communication** uses Tauri events (`emit`/`listen`):

| Event | Direction | Purpose |
|-------|-----------|---------|
| `theme-changed` | main → widget, pomodoro | Sync theme across windows |
| `pomodoro-state` | main → widget, pomodoro | Sync timer state (every second) |
| `pomodoro-control` | pomodoro → main | Control actions (pause/resume/skip/reset/stop) |
| `bubble-color-changed` | main → widget | Sync custom bubble gradient |

Windows that are separate WebViews have their own React instances, Zustand stores, and DOM. They do NOT share state — all state sync is via Tauri events.

---

## Project Structure

```
src/
├── components/
│   ├── layout/       Sidebar, Header, TaskDetailPanel
│   ├── tasks/        TaskCard, TaskList, TaskDetail, TaskQuickAdd, UnifiedLayout
│   ├── calendar/     MonthView, WeekView, DayView
│   ├── shared/       CommandPalette, SearchBar, DatePicker, KeyCapture, ShortcutEditor,
│   │                 ErrorBoundary, PomodoroFullscreen, Portal, ...
│   └── attachments/  AttachmentZone, ImageLightbox
├── pages/            TodayPage, CalendarPage, TagPage, SearchPage, DashboardPage,
│                     SettingsPage, WidgetPage, PomodoroWidgetPage, FocusStatsPage, ...
├── hooks/            useTasks, useTags, useTheme, useKeyboardShortcuts, usePomodoroSync
├── stores/           uiStore.ts, shortcutStore.ts, pomodoroStore.ts, calendarStore.ts
├── lib/              db.ts (Tauri invoke wrappers), date.ts, cn.ts, priority.ts, ...
├── types/            task.ts, tag.ts, attachment.ts, shortcuts.ts, pomodoro.ts
└── i18n/             locales/zh-CN.json, locales/en-US.json
src-tauri/
├── src/
│   ├── commands/     task_commands, reminder_commands, tag_commands, settings_commands,
│   │                 shortcut_commands, widget_commands, stats_commands, habit_commands
│   ├── db/           task_repo, reminder_repo, tag_repo, attachment_repo, habit_repo,
│   │                 migrations, connection
│   ├── models/       task, task_reminder, tag, attachment, settings, habit
│   ├── shortcuts.rs  Dynamic global shortcut registration + handler dispatch
│   └── reminders.rs  Background polling thread (60s interval)
```

---

## Keyboard Shortcuts

### Configurable (Settings → 快捷键)

| Default | ID | Scope |
|---------|-----|-------|
| Ctrl+Shift+T | global-show-window | Rust global — toggle main window show/hide |
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

## Database Schema (migration v11)

- **tasks**: id, title, description, is_completed, is_archived, is_suspended, is_abandoned, is_pinned, priority (0-4), due_date, reminder, tag_id (FK), parent_task_id (self-ref, CASCADE), sort_order, recurrence (JSON), my_day_date, reminded, created_at, updated_at
- **task_reminders**: id, task_id (FK CASCADE), offset, reminder_time, reminded, created_at
- **tags**: id, name, color, icon, sort_order, parent_tag_id (self-ref nesting)
- **attachments**: id, task_id, original_name, storage_name, mime_type, file_size, created_at
- **habits**: id, name, color, icon, frequency, target_count, sort_order
- **habit_logs**: id, habit_id (FK CASCADE), log_date, count, note. UNIQUE(habit_id, log_date)
- **settings**: key TEXT PRIMARY KEY, value TEXT — stores serialized preferences

### Settings Keys

| Key | Value | Used By |
|-----|-------|---------|
| `theme` | `light`/`dark`/`system`/`glass`/`warm`/`lumina` | useTheme, WidgetPage |
| `widget_enabled` | `"0"`/`"1"` | SettingsPage, WidgetPage, lib.rs |
| `widget_x`/`widget_y` | pixel strings | WidgetPage, lib.rs |
| `widget_size` | `"compact"`/`"normal"` | WidgetPage |
| `widget_bubble_color` | JSON `{from, via, to}` hex colors | WidgetPage, SettingsPage |
| `pomodoro_x` / `pomodoro_y` | pixel strings | PomodoroWidgetPage, lib.rs |
| `keyboard_shortcuts` | JSON `ShortcutMap` | shortcutStore |
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

The Pomodoro standalone window uses the same edge snapping pattern (`PomodoroWidgetPage.tsx`) when dragged, and persists position via `pomodoro_x`/`pomodoro_y` settings.

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
