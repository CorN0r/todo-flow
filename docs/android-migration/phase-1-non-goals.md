# Android Phase 1 Non-Goals

## Status

Confirmed for the first Android migration implementation pass.

## Purpose

Android phase 1 must be a native-feeling mobile experience, not a compressed desktop interface. The following desktop behaviors are explicitly deferred, adapted, or excluded from the first Android release.

## Desktop Tray

The Windows tray is not ported to Android.

Android replacement:

- Notification surfaces for reminders and focus events.
- Settings entry for sync, account, and local data status.
- Later Android quick settings or widget integrations only after the MVP is stable.

## Desktop Floating Widget

The desktop floating widget and floating focus window are not ported to Android phase 1.

Android replacement:

- A dedicated mobile focus page.
- Foreground or system notification controls for active focus sessions.
- Later home screen widgets as a separate feature gate.

## Right-Click Menus

Right-click menus are not required for any Android core workflow.

Android replacement:

- Long-press action sheets.
- Explicit icon buttons for common actions.
- Optional multi-select mode for bulk operations.

## Hover Controls

Hover-only controls are not allowed in Android phase 1.

Android replacement:

- Persistent, visible action affordances where repeated use is expected.
- Swipe actions only where discoverability and accessibility remain acceptable.
- Action sheets for secondary commands.

## Desktop Split Panes

The desktop Sidebar, Header, TaskDetailPanel, and wide split-pane shell are not mounted on phone-width Android screens.

Android replacement:

- Bottom navigation for primary areas.
- Full-screen route or bottom sheet for task detail.
- Tablet and foldable adaptations may introduce multi-pane layouts later, but they must not define the phone baseline.

## Acceptance Rule

A phase-1 Android screen fails review if a core workflow depends on tray behavior, desktop floating windows, right-click, hover, global keyboard shortcuts, or the desktop split-pane shell.
