# ADR 0001: Use Tauri v2 Mobile For The First Android Route

## Status

Accepted.

## Context

TodoFlow already uses Tauri v2, React, TypeScript, Rust, and SQLite on Windows desktop. The Android migration needs an installable mobile app while preserving existing desktop behavior and avoiding a complete rewrite before the product and sync model are validated.

The main alternatives are:

- Kotlin with Jetpack Compose.
- Flutter.
- Responsive reuse of the current desktop React UI.
- Tauri v2 Mobile with mobile-specific React routes and shared Rust/SQLite foundations.

## Decision

Use Tauri v2 Mobile as the first Android implementation route.

The Android app will keep a mobile-only shell and mobile-only pages. It may reuse domain logic, repository interfaces, Rust data access, and shared primitives where they are platform-neutral. It must not reuse the desktop Sidebar, Header, TaskDetailPanel, desktop context menus, or desktop split-pane shell on phone-width screens.

Kotlin with Jetpack Compose remains the fallback route if device validation shows unacceptable limitations in WebView performance, notifications, background work, file access, input behavior, or Android platform integration.

## Consequences

Positive:

- Reuses the current stack and reduces the first Android proof-of-concept cost.
- Keeps desktop and Android close enough to share domain and sync behavior.
- Lets mobile routing and UI remain separate from desktop layout assumptions.

Negative:

- Android plugin and WebView behavior must be validated early on physical devices.
- Some native-feeling interactions may require Android platform bridges or a later Compose fallback.

Required follow-up:

- Add Android build validation before enabling user-facing mobile releases.
- Keep platform services behind notification, file, share, storage, and background-work boundaries.
- Maintain desktop behavior with Android gates disabled.
