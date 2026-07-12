# Android MVP QA Checklist

Use this checklist before shipping the Android MVP build.

## Install And Launch

- Install a clean Android build on emulator and one physical device.
- Launch from the home screen.
- Relaunch after force stop.
- Rotate device if supported and confirm no content overlap.
- Confirm the mobile route does not mount desktop sidebar, header, or split-pane elements.

## Offline Usage

- Disable network.
- Create a task from the global FAB.
- Edit title, priority, due date, reminder, tag, recurrence, and description.
- Complete, reopen, delete, and recreate a task.
- Create and toggle a habit check-in.
- Restart the app and confirm offline data is still visible.

## Task Workflows

- Today shows overdue, due today, and My Day sections.
- Tasks tab supports search, incomplete/completed filters, tag entry, and priority sort.
- Tap opens task detail.
- Long press opens task action sheet.
- Subtasks can be created, completed, and deleted.
- Subtask nesting stops at TodoFlow's two-level rule.

## Habits, Calendar, And Focus

- Calendar week strip filters agenda by selected date.
- Month overview shows task count markers.
- Habit check-in updates streak and completion display immediately.
- Focus page starts, pauses, resumes, and transitions between focus and break phases.
- Focus phase completion triggers the Android notification placeholder or adapter path.

## Themes And Accessibility

- Light, Dark, and Lumina themes render legibly.
- Repeated controls meet at least 44dp touch target size.
- System font scaling does not clip task cards, sheets, nav labels, or buttons.
- Bottom navigation and FAB remain usable above Android system navigation.

## Sync States

- Pending task shows non-blocking pending sync state.
- Manual sync action appears in Settings and task list app bars.
- Sync in progress disables duplicate manual taps.
- Failed sync state is recoverable and does not discard local changes.
- Conflict state is visible where sync status badges are shown.
