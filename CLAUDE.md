# CLAUDE.md — TodoFlow

## Project Overview

TodoFlow is a Windows desktop TODO app built with **Tauri v2** (Rust backend + React 19/TypeScript frontend). Target install size < 20MB. The app provides task management with calendar views, subtasks, tags, image attachments, and a desktop widget.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript 6 |
| Styling | Tailwind CSS v4 (no config file, uses `@import "tailwindcss"` in index.css) |
| State — server | TanStack Query v5 |
| State — client | Zustand v5 |
| Routing | react-router-dom v7 (MemoryRouter) |
| Database | SQLite via rusqlite (bundled, WAL mode) |
| Forms | react-hook-form + zod |
| Drag & drop | @dnd-kit |
| Animation | motion (framer-motion) |
| Icons | lucide-react |
| Toast | sonner |
| Testing | vitest + @testing-library/react + jsdom |

---

## Project Structure

```
src/
├── components/
│   ├── layout/       Sidebar, Header, TaskDetailPanel
│   ├── tasks/        TaskCard, TaskList, TaskDetail, TaskQuickAdd, VirtualTaskList
│   ├── calendar/     MonthView, WeekView, DayView
│   ├── attachments/  AttachmentZone, ImageLightbox
│   ├── shared/       DatePicker, RecurrencePicker, CommandPalette, SearchBar,
│   │                 BulkActionBar, EmptyState, ErrorBoundary, LoadingSkeleton,
│   │                 PageHeader, PageTitle, OnboardingOverlay, PomodoroTimer,
│   │                 RichTextEditor
│   └── ui/           (shadcn/ui-style primitives)
├── pages/            TodayPage, CalendarPage, TagPage, SearchPage,
│                     DashboardPage, SettingsPage, MyDayPage, DateFilterPage,
│                     WidgetPage, MatrixPage, KanbanPage, HabitPage
├── hooks/            useTasks, useTags, useAttachments, useHabits, useTheme,
│                     useKeyboardShortcuts, useCalendarEvents
├── stores/           uiStore.ts, calendarStore.ts, pomodoroStore.ts
├── lib/              db.ts (Tauri invoke wrapper), date.ts (date-fns re-exports),
│                     cn.ts (clsx + tailwind-merge), nlp.ts (Chinese NLP parser),
│                     priority.ts, recurrence.ts, sortTasks.ts
├── types/            task.ts, tag.ts, attachment.ts
└── test/             components/, pages/, stores/, hooks/, visual/, mocks.ts,
                      test-utils.tsx, setup.ts

src-tauri/src/
├── commands/         task_commands, tag_commands, attachment_commands,
│                     settings_commands, stats_commands, widget_commands,
│                     habit_commands
├── db/               connection, migrations, task_repo, tag_repo,
│                     attachment_repo, habit_repo
├── models/           task, tag, attachment, settings, habit
├── lib.rs            AppState, plugin registration, command handlers, tray, widget window
├── main.rs           Entry point
├── error.rs          AppError enum
└── reminders.rs      Background reminder polling (tokio)
```

## Database Schema (migration v7)

- **tags** — id, name, color, icon, sort_order, parent_tag_id (self-ref FK for nesting, v7), created_at, updated_at (1:N with tasks via tag_id FK)
- **tasks** — id, title, description, is_completed, is_archived, priority (0-4), due_date, reminder, tag_id (FK→tags), parent_task_id (self-ref FK, max 2-level subtrees, CASCADE delete), sort_order, recurrence (JSON), my_day_date, reminded, created_at, updated_at
- **attachments** — id, task_id, original_name, storage_name, mime_type, file_size, thumbnail_name, created_at
- **settings** — key, value
- **habits** — id, name, color, icon, frequency, target_count, sort_order, created_at, updated_at (v6)
- **habit_logs** — id, habit_id (FK→habits CASCADE), log_date, count, note, created_at. UNIQUE(habit_id, log_date) (v6)

## Tauri Commands (Rust → Frontend)

Tasks: create_task, get_task, update_task, delete_task, reorder_tasks, get_tasks, duplicate_task, get_today_task_count, add_task_to_my_day, remove_task_from_my_day
Tags: create_tag, get_tags, update_tag, delete_tag, reorder_tags
Attachments: upload_attachment, upload_attachments_bulk, upload_link_attachment, get_attachments, delete_attachment, get_attachment_file_path
Settings: get_setting, set_setting, get_all_settings, backup_database
Stats: get_dashboard_stats
Widget: hide_to_tray, show_main_from_widget
Habits: create_habit, get_habits, update_habit, delete_habit, reorder_habits, toggle_habit_log

Frontend invokes these via the typed wrappers in `src/lib/db.ts`.

---

## Theme System

Four themes: `light`, `dark`, `system`, `glass`.

- CSS custom properties (HSL) defined at `:root` (light), `.dark` (dark), `.glass` (glassmorphism)
- Zustand `uiStore` holds `theme` and `resolvedTheme`
- `useTheme` hook toggles `.dark` and `.glass` classes on `<html>`, persists choice via `setSetting('theme', ...)`
- When `theme === 'glass'`, `<App>` renders fixed gradient background layers and switches main content to `bg-transparent` so the gradient shows through translucent cards
- `.glass` CSS rules auto-apply `backdrop-filter: blur()` to common Tailwind card classes (`bg-white`, `dark:bg-[#1e1e32]`, etc.)

---

## Design Tokens (all pages unified)

| Token | Light | Dark |
|-------|-------|------|
| Primary | `#7C72F6` | `#7C72F6` (lighter) |
| Card bg | `#FFFFFF` | `#1E1E32` |
| Card border | `#F3F4F6` | `white/0.06` |
| Main text | `#111827` | `white/90` |
| Secondary text | `#6B7280` | — |
| Muted text | `#9CA3AF` | — |
| Input bg | `#F9FAFB` | `white/0.03` |
| Input border | `#E5E7EB` | `white/0.07` |
| Section label | `text-[11px] font-semibold text-[#6B7280] uppercase tracking-[1px]` |
| Card style | `rounded-[10px] bg-white dark:bg-[#1E1E32] border border-[#F3F4F6] dark:border-white/[0.06]` |
| Card shadow | `0px 1px 3px 0px rgba(0,0,0,0.04)` |
| Destructive | `#EF4444` | hover `bg-[#FEF2F2]` |

**Rule**: Use specific hex colors (`bg-[#7C72F6]`, `text-[#6B7280]`) rather than generic Tailwind utilities (`bg-purple-500`, `text-gray-500`). Use `cn()` (clsx + tailwind-merge) for conditional class merging.

---

## Code Style Preferences

- **No comments by default** — only add a short comment when the WHY is non-obvious (hidden constraint, subtle invariant, bug workaround). Never explain WHAT the code does.
- **No docstrings / JSDoc** — well-named identifiers are self-documenting.
- **No premature abstraction** — three similar lines beats a shared helper until the pattern is proven.
- **No feature flags or backwards-compat shims** — change the code directly.
- **Edit existing files** rather than creating new ones.
- **Don't add error handling** for scenarios that can't happen — trust internal code and framework guarantees.
- **No half-finished implementations** — complete what you start.
- **Prefer dedicated tools** (Read, Write, Edit, Glob, Grep) over Bash for file operations.
- **Use `cn()`** from `src/lib/cn.ts` for merging Tailwind classes conditionally.

---

## Current Progress (as of 2026-05-28)

All planned features complete except Phase 9 (build/packaging). Notable features:
- Chinese NLP date parser in TaskQuickAdd (`src/lib/nlp.ts`) — parses 今天/明天/下周X/!!!priority/#tag/每天
- Inline title editing in TaskCard (double-click)
- Eisenhower Matrix (`/matrix`), Kanban board (`/kanban`), Habit tracker (`/habits`)
- Pomodoro timer with SVG ring, AudioContext beep, sonner toast
- Tag nesting (migration v7: `parent_tag_id` on tags, recursive tree in sidebar)
- Attachment support for 30+ file types + link attachments
- Virtual scrolling for lists >50 tasks (`VirtualTaskList`)
- Rich text editor with paste-image support (`RichTextEditor`)
- Desktop widget window with live today-task count

### Remaining
- [ ] Phase 9: Build & packaging (MSI/NSIS installers, code signing, auto-update)

---

## Common Commands

```bash
npm run dev              # Vite dev server on port 1420
npm run tauri dev        # Tauri dev mode (Rust backend + frontend)
npm run build            # TypeScript check + Vite production build
npm run tauri build      # Full Tauri production build (MSI/NSIS)
npm test                 # Run vitest suite (208 tests, 30 files)
npm run test:coverage    # vitest with coverage
npm run test:rust        # cargo test (48 unit + 9 integration)
npm run test:all         # Both frontend and Rust tests
npm run test:smoke       # Fast subset of tests
npm run lint             # ESLint (flat config)
```

On Windows, cargo may not be in PATH for PowerShell. Prepend:
```powershell
$env:Path += ";$env:USERPROFILE\.cargo\bin"
```
