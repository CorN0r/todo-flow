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
