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
| Drag & drop | @dnd-kit |
| Animation | motion (framer-motion) |
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
npm run lint             # ESLint (flat config)
```

On Windows, prepend cargo to PATH:
```powershell
$env:Path += ";$env:USERPROFILE\.cargo\bin"
```

Port 1420 frequently conflicts between restarts. Kill the lingering process before launching:
```powershell
taskkill /F /IM todo-flow.exe; Start-Sleep -Seconds 1; npx tauri dev
```

---

## Project Structure

```
src/
├── components/
│   ├── layout/       Sidebar, Header, TaskDetailPanel
│   ├── tasks/        TaskCard, TaskList, TaskDetail, TaskQuickAdd, StickyWall, StickyNote, ExpandedNote, UnifiedLayout
│   ├── calendar/     MonthView, WeekView, DayView
│   ├── shared/       DatePicker, RecurrencePicker, CommandPalette, SearchBar, BulkActionBar,
│   │                 Portal, OnboardingOverlay, PageTitle, ReminderList, ErrorBoundary, EmptyState, LoadingSkeleton
│   └── attachments/  AttachmentZone, ImageLightbox
├── pages/            TodayPage, CalendarPage, TagPage, SearchPage, DashboardPage,
│                     SettingsPage, MyDayPage, DateFilterPage, MatrixPage, KanbanPage,
│                     HabitPage, WidgetPage
├── hooks/            useTasks, useTags, useTheme, useCalendarEvents
├── stores/           uiStore.ts, calendarStore.ts, pomodoroStore.ts
├── lib/              db.ts, date.ts, cn.ts, nlp.ts, priority.ts, recurrence.ts, sortTasks.ts, holidays.ts
├── types/            task.ts, tag.ts, attachment.ts
└── i18n/             locales/zh-CN.json, locales/en-US.json (dormant, not deployed)
src-tauri/
├── src/
│   ├── commands/     task_commands, reminder_commands, tag_commands, settings_commands, widget_commands, stats_commands, habit_commands
│   ├── db/           task_repo, reminder_repo, tag_repo, attachment_repo, habit_repo, migrations, connection
│   ├── models/       task, task_reminder, tag, attachment, settings, habit
│   └── reminders.rs  Background polling thread (60s interval)
```

---

## Database Schema (migration v10)

- **tasks**: id, title, description, is_completed, is_archived, is_suspended (v8), is_abandoned (v8), is_pinned (v9), priority (0-4), due_date, reminder, tag_id (FK), parent_task_id (self-ref, CASCADE), sort_order, recurrence (JSON), my_day_date, reminded, created_at, updated_at
- **task_reminders** (v10): id, task_id (FK CASCADE), offset, reminder_time, reminded, created_at — replaces the old single `reminder` + `reminded` column pattern
- **tags**: id, name, color, icon, sort_order, parent_tag_id (self-ref nesting, v7)
- **attachments**: id, task_id, original_name, storage_name, mime_type, file_size, created_at
- **habits**: id, name, color, icon, frequency, target_count, sort_order
- **habit_logs**: id, habit_id (FK CASCADE), log_date, count, note. UNIQUE(habit_id, log_date)

### Reminder flow (v10)
Reminders live in `task_reminders` table. Each row has `offset` (e.g. `"0m"`, `"-30m"`, `"custom:YYYY-MM-DD HH:mm"`) and a computed `reminder_time` (absolute datetime). `reminders.rs` polls every 60s: `SELECT ... FROM task_reminders WHERE reminded=0 AND reminder_time <= now`. Frontend `ReminderList` component handles CRUD via `reminder_commands.rs`.

---

## Key Architecture Patterns

### Portal Dropdown Positioning
ALL dropdowns/popups MUST use `<Portal>` (renders to `document.body`) + `fixed` positioning with `getBoundingClientRect()`. The `<main>` element's internal `<div>` has `overflow-y-auto` which clips `absolute` elements.

```tsx
<Portal>
  <div className="fixed inset-0 z-40" onClick={close} />
  <div className="fixed z-50 ..." style={{
    top: (btnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
    left: btnRef.current?.getBoundingClientRect().left ?? 0,
  }}>
```

Context menus use `z-[200]`, confirm dialogs use `z-[300]`.

**Critical**: `motion.aside` in `TaskDetailPanel` applies `transform` which creates a CSS containing block, making `position: fixed` relative to the panel instead of the viewport. Must use Portal to escape this.

### Tauri invoke Parameters
`#[tauri::command(rename_all = "snake_case")]` does NOT convert `invoke()` keys. JS keys must match Rust parameters exactly: `invoke('create_task_reminder', { task_id: taskId, offset, due_date: dueDate })`.

### Task List Data Pipeline
```
useTasks(filters) → sortTasks(tasks, sortMode) → nestChildren(sorted) → render
```
- `nestChildren()` builds parent-child tree from flat list
- Children bypass date/tag/my_day filters when `include_children: true`
- `sort_order`: new parent tasks get `sort_order=0` (prepend), new subtasks get `MAX+1` (append)

### TanStack Query Invalidation
Use `predicate` for cross-page reliability:
```tsx
queryClient.invalidateQueries({
  predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks'
});
```
`['task', id]` queries are separate from `['tasks', ...]` queries. After creating/deleting subtasks, must manually invalidate `['task', parentId]` in the mutation's `onSuccess` for the detail panel to refresh.
`['task-reminders', taskId]` queries for reminders.
`['tags']` must also be invalidated after task mutations affecting tags.

### Delete Flow & Undo
1. Call `setSelectedTaskId(null)` BEFORE `deleteTask.mutate(id)` to prevent "Not found" errors
2. `useDeleteTask.onSuccess` must NOT invalidate `['task', id]` (that's the deleted task)
3. Undo: `toast.success(() => <button onClick={undo}>, { duration: 8000 })`
4. For parent tasks with children: capture `children` array before delete, recreate parent via `createTask.mutateAsync`, then sequentially recreate children

### Auto-Save (TaskDetail)
800ms debounce on all edits. Save comparison detects dirty fields. When clearing a field, send `''` (empty string) — NOT `undefined` or `null`. The Rust `UpdateTaskRequest` treats empty strings as "clear this optional field" (maps to `None`). `undefined` values are stripped during JSON serialization, causing the old value to persist.

### Theme System (v0.3.0 — 6 themes)
| Theme | CSS class | resolvedTheme |
|-------|-----------|---------------|
| light | — | `'light'` |
| dark | `.dark` | `'dark'` |
| system | — | system preference |
| glass | `.glass` | `'dark'` |
| warm | `.warm` | `'dark'` |
| lumina | `.lumina` | `'light'` |

CSS variables in `:root` (light baseline), `.dark`, `.glass`, `.warm`, `.lumina`. Theme-specific color overrides in `@layer utilities` using `.warm .bg-[#7C72F6]` etc. When adding a new theme, update: `uiStore.ts` (Theme type + getResolvedTheme), `useTheme.ts` (VALID_THEMES + class toggle + changeTheme type), `index.css` (CSS variables + utility overrides), `Header.tsx` (theme array + icon), `CommandPalette.tsx` (command entry), `WidgetPage.tsx` (isDark check), `App.tsx` (gradient background).

### Task View Modes (v0.3.0)
Three view modes stored in `useUIStore.taskViewMode` (`'list' | 'wall' | 'unified'`), persisted to localStorage. Every task page supports all three via conditional rendering. `PageTitle` has a toggle button that cycles through modes. `unified` mode renders `<UnifiedLayout>` (left-right split, independently scrolling, resizable divider, keyboard ↑↓ navigation).

### UnifiedLayout Scroll Architecture
The unified view's parent container in each page must use `flex flex-col overflow-hidden` (NOT `overflow-y-auto`). Left and right panels each have `flex-1 min-h-0 overflow-y-auto`. The outer page container is `flex flex-col h-full` with `shrink-0` toolbar.

### Due Date Format
`due_date` stores `"YYYY-MM-DD"` (date-only) or `"YYYY-MM-DD HH:mm"` (with time, space separator). All comparisons use `.slice(0, 10)` to extract date part. `parseISO()` needs `.replace(' ', 'T')` first. Rust backend uses `parse_due_date_only()` helper in `task_repo.rs`.

### Reminder Storage
Reminder offset is computed to absolute time before storage: `"0m"` = `"YYYY-MM-DD 09:00"`, `"-30m"` = 30 min before due time. All reminder times use SPACE separator (`"YYYY-MM-DD HH:mm"`) for Rust compatibility. `normalizeReminder()` in `date.ts` converts legacy T-format.

---

## Design Tokens & Style

| Token | Light | Dark |
|-------|-------|------|
| Primary | `#7C72F6` | `#7C72F6` |
| Card bg | `#FFFFFF` | `#1E1E32` |
| Card border | `#F3F4F6` | `white/0.06` |
| Main text | `#111827` | `white/90` |
| Secondary text | `#6B7280` | — |
| Input bg | `#F9FAFB` | `white/0.03` |

- Use explicit hex colors (`bg-[#7C72F6]`) rather than generic Tailwind utilities
- `cn()` for conditional class merging
- All UI text in Chinese (简体中文)
- No comments unless the WHY is non-obvious
- No JSDoc — self-documenting identifiers
- No premature abstraction — three similar lines beats a shared helper
