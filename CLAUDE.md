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
| i18n | react-i18next (infrastructure ready, not yet deployed) |

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

---

## Project Structure

```
src/
├── components/
│   ├── layout/       Sidebar, Header, TaskDetailPanel
│   ├── tasks/        TaskCard, TaskList, TaskDetail, TaskQuickAdd, UnifiedLayout
│   ├── calendar/     MonthView, WeekView, DayView
│   ├── shared/       CommandPalette, SearchBar, DatePicker, KeyCapture, ShortcutEditor, ErrorBoundary, ...
│   └── attachments/  AttachmentZone, ImageLightbox
├── pages/            TodayPage, CalendarPage, TagPage, SearchPage, DashboardPage,
│                     SettingsPage, MyDayPage, DateFilterPage, MatrixPage, KanbanPage,
│                     HabitPage, WidgetPage
├── hooks/            useTasks, useTags, useTheme, useKeyboardShortcuts
├── stores/           uiStore.ts, shortcutStore.ts
├── lib/              db.ts (Tauri invoke wrappers), date.ts, cn.ts, priority.ts, ...
├── types/            task.ts, tag.ts, attachment.ts, shortcuts.ts
└── i18n/             locales/zh-CN.json, locales/en-US.json (dormant)
src-tauri/
├── src/
│   ├── commands/     task_commands, reminder_commands, tag_commands, settings_commands,
│   │                 shortcut_commands, widget_commands, stats_commands, habit_commands
│   ├── db/           task_repo, reminder_repo, tag_repo, attachment_repo, habit_repo, migrations, connection
│   ├── models/       task, task_reminder, tag, attachment, settings, habit
│   ├── shortcuts.rs  Dynamic global shortcut registration + handler dispatch
│   └── reminders.rs  Background polling thread (60s interval)
```

---

## Keyboard Shortcuts

### Configurable (Settings → 快捷键)

| Default | ID | Scope |
|---------|-----|-------|
| Ctrl+Shift+T | global-show-window | Rust global — toggle main window show/hide; hides widget when showing, shows widget when hiding |
| Ctrl+K | command-palette | Frontend — open command palette |
| Ctrl+B | toggle-sidebar | Frontend — toggle sidebar |
| N | new-task | Frontend — focus quick-add input |

### Hardcoded (not in configurable list)

- **Escape** — exit selection mode or deselect task (works inside inputs too)
- **Browser shortcuts blocked**: Ctrl+P/S/U/R/H/J/D/O/T/W/N, F1/F3/F5/F11/F12, Alt+←/→, Backspace (outside inputs). Editing combos (Ctrl+C/V/X/A/Z/Y) only work inside inputs.

### Shortcut Architecture

```
Settings UI (ShortcutEditor → KeyCapture)
       │ update shortcut
       ▼
shortcutStore (Zustand, persisted to SQLite settings table key='keyboard_shortcuts')
       │
       ├── Frontend: useKeyboardShortcuts hook reads shortcutMap → builds actionMap → keydown handler dispatches
       │
       └── Rust: shortcuts::register_global_shortcuts() reads JSON → filters RUST_SCOPE_IDS → registers OS hotkeys
            └── with_handler → looks up shortcut in global_shortcut_map → handle_global_shortcut_action()
```

**Rust global shortcut registration** (`src-tauri/src/shortcuts.rs`): Only shortcuts listed in `RUST_SCOPE_IDS` are registered as OS-level global hotkeys. Frontend shortcuts are NOT registered at the OS level (this was a critical bug fix — see below).

`src/types/shortcuts.ts` is the canonical source of shortcut definitions (`SHORTCUT_DEFS`), default key mappings, key normalization (`normalizeKeys`, `eventToNormalizedKeys`), conflict detection, and validation. The `ShortcutDef.scope` field determines which layer processes the shortcut: `'rust'` = OS global, `'frontend'` = app-level keydown listener.

---

## Database Schema (migration v11)

- **tasks**: id, title, description, is_completed, is_archived, is_suspended, is_abandoned, is_pinned, priority (0-4), due_date, reminder, tag_id (FK), parent_task_id (self-ref, CASCADE), sort_order, recurrence (JSON), my_day_date, reminded, created_at, updated_at
- **task_reminders**: id, task_id (FK CASCADE), offset, reminder_time, reminded, created_at
- **tags**: id, name, color, icon, sort_order, parent_tag_id (self-ref nesting)
- **attachments**: id, task_id, original_name, storage_name, mime_type, file_size, created_at
- **habits**: id, name, color, icon, frequency, target_count, sort_order
- **habit_logs**: id, habit_id (FK CASCADE), log_date, count, note. UNIQUE(habit_id, log_date)
- **settings**: key TEXT PRIMARY KEY, value TEXT — stores serialized preferences including `keyboard_shortcuts` (v11)

---

## Key Architecture Patterns

### Scroll Container Clipping (App.tsx)
`<main>` wraps an inner `<div className="h-full overflow-y-auto">` (App.tsx:153). Per CSS spec, setting `overflow-y: auto` forces `overflow-x: auto` too, creating a **clipping container** that clips:
- `absolute` positioned children (use Portal for dropdowns)
- `ring` (box-shadow) on element edges → ring appears cut off
- `outline` extending outside the element

This affects every page rendered inside `<Routes>`.

### Page Height — Never calc(100vh - Npx)
Pages inside the scroll container must NOT use `calc(100vh - Npx)`. The layout is:
```
h-screen → flex → Sidebar | flex-1 flex-col | TaskDetailPanel
                                → Header
                                → main flex-1 → div.h-full.overflow-y-auto → <Routes>
```
Use `h-full flex flex-col` on page root + `flex-1 min-h-0` on the scrollable area. The hardcoded `N` never matches the actual consumed height (Header, padding, title bar vary).

### Drag-over Highlight
Do NOT put `ring` directly on a droppable container with `overflow-hidden` — the ring gets clipped by the scroll container and hidden behind child backgrounds. Instead use an absolutely-positioned **overlay div**:
```tsx
{isOver && (
  <div className="absolute inset-0 rounded-xl ring-2 ring-inset ring-[#7C72F6]
               pointer-events-none z-10" />
)}
```
Container needs `relative`. Overlay's `z-10` ensures ring is above all children.

### Bottom Spacing
All page-level `overflow-y-auto` containers should have `pb-6` so content doesn't touch the bottom edge when scrolled to end. This replaces global bottom padding on the outer scroll container (which caused unwanted gaps on `h-full` pages).

### Portal Dropdown Positioning
ALL dropdowns/popups MUST use `<Portal>` (renders to `document.body`) + `fixed` positioning with `getBoundingClientRect()`. Context menus use `z-[200]`, confirm dialogs use `z-[300]`.

### Tauri invoke Parameters — CRITICAL
Tauri v2 defaults to **camelCase** for `invoke()` parameter names. Every `#[tauri::command]` MUST have explicit `rename_all = "snake_case"` to keep JS keys matching Rust parameter names. Without it, snake_case JS keys (e.g. `parent_tag_id`) are silently ignored → received as `None` on the Rust side. This caused the sub-tag bug — tags with `parent_tag_id` were created as root tags because Tauri expected `parentTagId`.

### TanStack Query Invalidation
Use `predicate` for cross-page reliability:
```tsx
queryClient.invalidateQueries({
  predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks'
});
```

### Auto-Save (TaskDetail)
800ms debounce on all edits. When clearing a field, send `''` (empty string) — NOT `undefined` or `null`. The Rust `UpdateTaskRequest` treats empty strings as "clear this optional field" (maps to `None`). `undefined` values are stripped during JSON serialization.

### Due Date Format
`due_date` stores `"YYYY-MM-DD"` (date-only) or `"YYYY-MM-DD HH:mm"` (with time, space separator). All comparisons use `.slice(0, 10)` to extract date part. `parseISO()` needs `.replace(' ', 'T')` first.

### Delete Flow & Undo
Call `setSelectedTaskId(null)` BEFORE `deleteTask.mutate(id)` to prevent "Not found" errors. Undo via toast with 8s duration, recreating via `createTask.mutateAsync`.

### Task View Modes
Three modes in `useUIStore.taskViewMode` (`'list' | 'wall' | 'unified'`), persisted to localStorage. Every task page supports all three via conditional rendering.

### UnifiedLayout Scroll Architecture
Parent container must use `flex flex-col overflow-hidden` (NOT `overflow-y-auto`). Left and right panels each have `flex-1 min-h-0 overflow-y-auto`.

### Single Instance Detection
`src-tauri/src/lib.rs` contains a `single_instance` module (Windows-only). At startup, creates a named mutex (`TodoFlow_SingleInstance_Global_Mutex`). If the mutex already exists, finds the existing window by title ("TodoFlow") via `FindWindowW`, restores + focuses it, then exits. Prevents crash-on-relaunch when app is minimized to tray.

### Tag Nesting — Two Levels Max
Tags support `parent_tag_id` (self-referencing FK). The backend builds a recursive tree in `tag_repo::get_all_with_counts`. UI restriction: `TagTreeItem` only shows the "添加子标签" context menu item when `depth === 0`, limiting nesting to root → child (no grandchildren).

### Database Import — Covers All Tables
`settings_commands::import_database` selectively imports 6 tables from a backup `.db`: tasks, tags, task_reminders, attachments, habits, habit_logs. After import, emits `task-changed` which the frontend listens to — must invalidate `tasks`, `tags`, `habits`, and `dashboard-stats` caches. `backup_database` does a raw file copy (complete), and now overwrites existing destination files.

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
