## ADDED Requirements

### Requirement: Android primary navigation
The Android app SHALL provide mobile-first primary navigation for Today, Tasks, Calendar, Habits, and Settings without relying on the desktop sidebar.

#### Scenario: Navigate between primary areas
- **WHEN** the user taps a bottom navigation item
- **THEN** the app displays the selected primary area and preserves the current local data state

#### Scenario: Desktop sidebar is not used on phone
- **WHEN** the Android app renders on a phone-width viewport
- **THEN** the app SHALL NOT show the desktop sidebar, desktop header layout, or desktop split-pane shell

### Requirement: Mobile quick add
The Android app SHALL provide a global quick-add entry point for creating tasks from mobile contexts.

#### Scenario: Create task from FAB
- **WHEN** the user taps the floating add button and submits a non-empty task title
- **THEN** the app creates the task in local storage and shows it in the relevant task list

#### Scenario: Add metadata during capture
- **WHEN** the user opens quick add
- **THEN** the app lets the user set due date, reminder, tag, priority, and My Day state before saving

### Requirement: Mobile task list interactions
Task lists on Android SHALL support touch-native operations for viewing, completing, editing, and bulk handling tasks.

#### Scenario: Complete task from list
- **WHEN** the user taps a task completion control
- **THEN** the app toggles the task completion state locally and reflects the new state immediately

#### Scenario: Open task detail
- **WHEN** the user taps a task card outside the completion control
- **THEN** the app opens a mobile task detail surface for that task

#### Scenario: Show contextual actions
- **WHEN** the user long-presses a task card
- **THEN** the app shows a mobile action sheet or enters multi-select mode without requiring a right-click menu

### Requirement: Mobile task detail
The Android app SHALL provide a touch-first task detail experience for editing task title, status, priority, due date, reminders, tag, recurrence, subtasks, description, and destructive actions.

#### Scenario: Edit task detail
- **WHEN** the user changes a task field in mobile detail
- **THEN** the app saves the change locally and shows whether the change is synced, pending, or failed

#### Scenario: Edit subtasks
- **WHEN** the user creates or toggles a subtask from mobile detail
- **THEN** the subtask updates locally while preserving TodoFlow's two-level nesting constraint

### Requirement: Mobile calendar
The Android app SHALL adapt calendar behavior for small screens with a week strip and agenda list as the default calendar experience.

#### Scenario: Select date
- **WHEN** the user selects a date from the week strip
- **THEN** the app shows tasks due on that date in an agenda-style list

#### Scenario: Open month view
- **WHEN** the user chooses the month-view action
- **THEN** the app shows a mobile month overview with task count markers per date

### Requirement: Mobile habits
The Android app SHALL support daily habit review and check-in.

#### Scenario: Check habit
- **WHEN** the user taps a habit check-in control for today
- **THEN** the app records or toggles today's habit log locally and updates the visible streak state

### Requirement: Mobile focus timer
The Android app SHALL adapt the desktop pomodoro feature into a mobile focus experience.

#### Scenario: Start focus from task
- **WHEN** the user starts focus from a task
- **THEN** the app opens or updates a mobile focus session associated with that task

#### Scenario: Notify phase completion
- **WHEN** a focus or break phase completes
- **THEN** the app triggers an Android-appropriate notification or visible in-app completion state

### Requirement: Offline mobile usage
The Android app SHALL allow core task and habit workflows to operate without network connectivity.

#### Scenario: Create task offline
- **WHEN** the device is offline and the user creates a task
- **THEN** the task is stored locally and marked as pending synchronization

#### Scenario: Restart app offline
- **WHEN** the app restarts while offline
- **THEN** previously created local tasks and habits remain available
