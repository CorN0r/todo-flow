## ADDED Requirements

### Requirement: Mobile design tokens
The mobile UI SHALL use named design tokens for color, typography, spacing, radius, elevation, and motion instead of hard-coding desktop CSS class values into mobile components.

#### Scenario: Theme token usage
- **WHEN** a mobile component renders a primary action
- **THEN** it uses the mobile primary action token rather than a desktop-only Tailwind class contract

### Requirement: Mobile themes
The Android app SHALL support Light, Dark, and Lumina themes for the initial mobile release.

#### Scenario: Switch theme
- **WHEN** the user selects a supported mobile theme
- **THEN** the app updates colors and surfaces consistently across primary navigation, task lists, detail surfaces, and settings

### Requirement: Touch target accessibility
Interactive mobile controls SHALL meet Android-appropriate touch target and readability constraints.

#### Scenario: Render action control
- **WHEN** the app renders a primary or repeated action control
- **THEN** the touch target is at least 44dp or the platform-equivalent minimum

#### Scenario: Respect font scaling
- **WHEN** the user changes system font scaling
- **THEN** core task titles, controls, and navigation remain readable and non-overlapping

### Requirement: Mobile motion
Mobile transitions SHALL be purposeful, fast, and non-blocking.

#### Scenario: Open task detail
- **WHEN** the user opens a task detail surface
- **THEN** the surface animates in a way that preserves context and completes without delaying editing

### Requirement: Mobile visual hierarchy
The mobile UI SHALL make task status, due date, priority, tag, reminder, and sync state visually scannable.

#### Scenario: Scan task card
- **WHEN** a task card has due date, priority, tag, and pending sync state
- **THEN** the card presents those signals without text overlap or requiring hover

### Requirement: No desktop-only interaction dependence
The mobile UI SHALL NOT require hover, right-click, global keyboard shortcuts, tray menus, or desktop floating windows for core workflows.

#### Scenario: Access task actions
- **WHEN** the user needs task actions on Android
- **THEN** the app provides touch-native controls such as buttons, gestures, long-press menus, or action sheets
