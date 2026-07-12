# ADR 0003: Use Platform-Neutral Mobile Design Tokens

## Status

Accepted.

## Context

TodoFlow has a mature desktop visual language, but Android cannot depend on desktop Tailwind class names, hover behavior, or wide-screen layout structure. The migration also needs a path for later iOS and HarmonyOS clients.

The design system must support Light, Dark, and Lumina themes while keeping task status, due date, priority, tag, reminder, and sync state scannable on small screens.

## Decision

Create a mobile design token set for color, typography, spacing, radius, elevation, and motion. Token names and values must be platform-neutral and exportable as JSON.

Mobile components use semantic tokens instead of desktop-specific class contracts. React can map tokens to CSS variables, and future native clients can map the same token names to platform styles.

Phase-1 mobile primitives include:

- App bars.
- Bottom navigation.
- Floating action button.
- Bottom sheets.
- Action sheets.
- Chips.
- Icon buttons.
- Empty states.
- Sync badges.

## Consequences

Positive:

- Keeps mobile UI consistent without copying desktop layout mechanics.
- Gives future iOS and HarmonyOS clients a stable visual contract.
- Makes theme support testable and easier to inspect.

Negative:

- Requires an additional mapping layer before mobile components are built.
- Some desktop visual details may need translation instead of direct reuse.

Required follow-up:

- Export tokens in a platform-neutral JSON file.
- Validate repeated controls against at least 44dp touch targets.
- Add visual checks for task cards with due date, priority, tag, reminder, and sync state.
- Keep motion durations fast, purposeful, and non-blocking.
