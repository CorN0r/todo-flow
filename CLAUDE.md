# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TodoFlow is a Windows desktop TODO app built with **Tauri v2** (Rust backend + React 19/TypeScript frontend). The app provides task management with calendar views, subtasks, tags, image attachments, and a desktop widget.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS v4 (no config file, uses `@import "tailwindcss"` in index.css) |
| State — server | TanStack Query v5 |
| State — client | Zustand v5 |
| Routing | react-router-dom v7 (MemoryRouter) |
| Database | SQLite via rusqlite (bundled, WAL mode) |
| Drag & drop | @dnd-kit |
| Animation | motion (framer-motion) |
| Icons | lucide-react |
| Toast | sonner |

---

## Common Commands

```bash
npm run dev              # Vite dev server on port 1420
npm run tauri dev        # Tauri dev mode (Rust backend + frontend)
npm run build            # TypeScript check + Vite production build
npm run tauri build      # Full Tauri production build
npm test                 # Run vitest suite
npm run test:smoke       # Fast subset of tests
npm run lint             # ESLint (flat config)
```

On Windows, cargo may not be in PATH for PowerShell. Prepend:
```powershell
$env:Path += ";$env:USERPROFILE\.cargo\bin"
```

---

## Project Structure

```
src/
├── components/
│   ├── layout/       Sidebar, Header, TaskDetailPanel
│   ├── tasks/        TaskCard, TaskList, TaskDetail, TaskQuickAdd, VirtualTaskList
│   ├── calendar/     MonthView, WeekView, DayView
│   ├── shared/       DatePicker, RecurrencePicker, ReminderPicker, CommandPalette,
│   │                 SearchBar, BulkActionBar, Portal, OnboardingOverlay, PomodoroTimer,
│   │                 ErrorBoundary, LoadingSkeleton, EmptyState, PageTitle, PageHeader
│   └── attachments/  AttachmentZone, ImageLightbox
├── pages/            TodayPage, CalendarPage, TagPage, SearchPage, DashboardPage,
│                     SettingsPage, MyDayPage, DateFilterPage, MatrixPage, KanbanPage,
│                     HabitPage, WidgetPage
├── hooks/            useTasks, useTags, useAttachments, useHabits, useTheme,
│                     useKeyboardShortcuts, useCalendarEvents
├── stores/           uiStore.ts, calendarStore.ts, pomodoroStore.ts
├── lib/              db.ts (Tauri invoke wrappers), date.ts (date-fns re-exports),
│                     cn.ts (clsx + tailwind-merge), nlp.ts (Chinese NLP),
│                     priority.ts, recurrence.ts, sortTasks.ts, holidays.ts
└── types/            task.ts, tag.ts, attachment.ts
```

---

## Database Schema (migration v7)

- **tasks**: id, title, description, is_completed, is_archived, priority (0-4), due_date, reminder, tag_id (FK), parent_task_id (self-ref, max 2-level, CASCADE), sort_order, recurrence (JSON), my_day_date, reminded, created_at, updated_at
- **tags**: id, name, color, icon, sort_order, parent_tag_id (self-ref nesting, v7)
- **attachments**: id, task_id, original_name, storage_name, mime_type, file_size, created_at
- **habits**: id, name, color, icon, frequency, target_count, sort_order
- **habit_logs**: id, habit_id (FK CASCADE), log_date, count, note. UNIQUE(habit_id, log_date)

---

## Key Architecture Patterns

### Dropdown Positioning (Portal Pattern)
All dropdowns/popups MUST use `<Portal>` (renders to `document.body`) + `fixed` positioning with `getBoundingClientRect()`. The `<main>` element's internal `<div>` has `overflow-y-auto` which clips `absolute` elements. Never use `absolute` positioning for overlays inside page content. See `src/components/shared/Portal.tsx`.

```tsx
<Portal>
  <div className="fixed inset-0 z-40" onClick={close} />
  <div className="fixed z-50 ..." style={{
    top: (btnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
    left: btnRef.current?.getBoundingClientRect().left ?? 0,
  }}>
```

### Sortable Context Menu (Portal + z-[200])
Right-click context menus must also use Portal to avoid being clipped by stacking contexts:
```tsx
{menu && (
  <Portal>
    <div className="fixed inset-0 z-40" onClick={close} />
    <div ref={menuRef} style={{ left: e.clientX, top: e.clientY }}
      className="fixed z-[200] ...">
```

### Task List Hierarchy
- `useTasks({ include_children: true })` returns flat list; `nestChildren()` in `sortTasks.ts` builds tree
- Backend: when `include_children` is true, children bypass date/tag/my_day filters (`parent_task_id IS NOT NULL OR <filter>`)
- Subtask sort_order: new subtasks get `MAX+1` (append to end), while top-level tasks get `0` (prepend to top)

### Tauri invoke Parameter Naming
`#[tauri::command(rename_all = "snake_case")]` does NOT convert raw `invoke()` parameter keys. JS keys must match Rust parameter names exactly. E.g., `invoke('toggle_habit_log', { habit_id: habitId, date })` — use `habit_id`, NOT `habitId`.

### Theme System
Four themes: `light`, `dark`, `system`, `glass`. CSS custom properties in `index.css`: `:root` (light), `.dark` (dark), `.glass` (glassmorphism). Glass auto-apply rules are in `@layer utilities` (not `@layer base`) to override Tailwind utilities. Background gradients use `z-[-1]` to stay behind content.

### Date Handling
All date functions re-exported from `src/lib/date.ts` (wraps date-fns). Use `todayISO()` for comparisons, `isOverdue()` for overdue checks, `formatDate()` for display. Chinese holidays in `src/lib/holidays.ts`.

### Portal Dropdown Positioning
Use `useLayoutEffect` (not `onClick`) to calculate dropdown position after browser layout. Add `window.addEventListener('scroll', calc, true)` and `window.addEventListener('resize', calc)` to keep dropdown tracking trigger button. If trigger scrolls off-screen, close the dropdown.

### Page Layout (Fixed Header + Scrollable List)
Task pages use this structure to keep title bar fixed:
```tsx
<div className="flex flex-col h-full">
  <div className="shrink-0">...header...</div>
  <div className="flex-1 min-h-0 overflow-y-auto">
    <TaskList tasks={...} />
  </div>
</div>
```
The parent `<main>` container must NOT have `overflow-y-auto` — each page handles its own scrolling.

### Widget Window Positioning
When using `WebviewUrl::App(path)`, the path is appended to the dev URL. For the widget window, use `"/?widget=1"` and detect in App.tsx with `new URLSearchParams(window.location.search).has('widget')`. Do NOT rely on path-based routing for widget detection — MemoryRouter ignores the URL path.

---

## Design Tokens

| Token | Light | Dark |
|-------|-------|------|
| Primary | `#7C72F6` | `#7C72F6` |
| Card bg | `#FFFFFF` | `#1E1E32` |
| Card border | `#F3F4F6` | `white/0.06` |
| Main text | `#111827` | `white/90` |
| Secondary text | `#6B7280` | — |
| Muted text | `#9CA3AF` | — |
| Input bg | `#F9FAFB` | `white/0.03` |
| Destructive | `#EF4444` | hover `bg-[#FEF2F2]` |
| Card class | `rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06]` |

**Rule**: Use specific hex colors (`bg-[#7C72F6]`, `text-[#6B7280]`) rather than generic Tailwind utilities. Use `cn()` for conditional class merging.

---

## Code Style

- **No comments** unless the WHY is non-obvious. Never explain WHAT.
- **No JSDoc/docstrings** — self-documenting identifiers.
- **No premature abstraction** — three similar lines beats a shared helper.
- **No feature flags or compat shims** — change code directly.
- **Edit existing files** rather than creating new ones.
- **All UI text in Chinese** (简体中文). Technical identifiers in English.
- Use `cn()` from `src/lib/cn.ts` for conditional Tailwind classes.
- **Theme adaptation**: Use explicit hex colors + `isDark` JS variable rather than Tailwind `dark:` variant. The widget window is a separate webview with its own JS context; CSS classes on `<html>` may not sync. Prefer `cn()` with `isDark ? 'dark-class' : 'light-class'`.

---

## Widget / Floating Window

The widget is a separate Tauri `WebviewWindow` (label `"widget"`, URL `/?widget=1`). Key points:

- **URL routing**: Since `MemoryRouter` ignores browser URLs, App.tsx detects the widget window via `window.location.search` (`?widget=1`) to set `initialEntries` to `/widget`.
- **Event sync**: Rust emits `task-changed` event to all windows on CRUD. Both main and widget listen for this and call `queryClient.invalidateQueries({ queryKey: ['tasks'] })`.
- **Theme in widget**: Use local `useState` + `getSetting('theme')` directly; do NOT rely on Zustand store cross-window sync.
- **Window transparency**: Widget uses `transparent(true)` — must set `document.body.style.backgroundColor = 'transparent'` in a mount effect.
- **Compact bubble**: Uses `startDragging()` (not `data-tauri-drag-region`) to allow simultaneous hover/click/drag on a single element.

---

## System Tray

- `TrayIconBuilder::with_id("todoflow-tray")` — always use `.show_menu_on_left_click(false)` on Windows.
- Left-click: match `TrayIconEvent::Click { button: MouseButton::Left, .. }` and call `window.unminimize()` before `show()`.
- Right-click: handled by `.menu(&tray_menu)`, no event handler needed.
- Close button (`X`) → `api.prevent_close()` + `window.hide()`; tray "退出" → `app.exit(0)`.

---

## Task Change Events

All mutating commands in `task_commands.rs` take `app: AppHandle` and call `app.emit("task-changed", ())` after success. Frontend `listen('task-changed', ...)` invalidates `['tasks']` query key for real-time cross-window sync. No polling needed.

---

## Global Shortcuts

- `Ctrl+Shift+T`: show main window + quick-add task
- `Ctrl+Shift+W`: toggle widget visibility
- Registration: `app.handle().global_shortcut().register(Shortcut::new(...))` in setup.
- Handler: compare `*shortcut == ctrl_shift_t` to dispatch different actions.

---

## SQLite NULL Handling

`params![]` with `WHERE col = ?1` and `None` (NULL) will NOT match in SQLite. Use `IS NOT DISTINCT FROM ?1` for NULL-safe comparison, or use `params![]` with no params for `IS NULL`.

---

## Sort Order Rules

- **New parent task**: `UPDATE tasks SET sort_order = sort_order + 1 WHERE parent_task_id IS NULL` (all top-level tasks shift down), then insert with `sort_order = 0`.
- **New subtask**: `SELECT COALESCE(MAX(sort_order), -1) + 1` within its parent.
- **Date sort null handling**: Use explicit null checks in comparator — `if (!a.due_date) return 1` — rather than placeholder strings like `'9999'` to avoid localeCompare edge cases.
