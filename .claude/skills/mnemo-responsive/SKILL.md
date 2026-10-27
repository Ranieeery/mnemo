---
name: mnemo-responsive
description: Responsive layout rules for Mnemo screens and panels (window sizes, sidebar rail and drawer, player layout, page margins, grids). Use when adding or changing a screen, a header, a side panel or anything whose layout depends on width, when the request mentions a small/half-screen/narrow window, snap, 4K or "it breaks when I resize". Pair it with mnemo-a11y-checklist and /check.
---

# Responsive layout

Mnemo is a desktop app, but its window is resized all the time: half a 1366 px screen with snap (~683 px), 1920 px
maximized, 4K, and the mini player. Every layout has to hold from the minimum window up.

## Reference widths

| Width | What it stands for |
|---|---|
| 640×480 | the minimum window (`tauri.conf.json`, also read by the Rust window layout) |
| ~900 | a small window; below 900 px the player playlist goes under the details (`PlaylistPanel` `placement="below"`) |
| 1000 | below it the sidebar is always the rail, and expanding it opens a drawer (`useSidebarDrawer`) |
| 1280×800 | the size Mnemo opens with (never saved): the home's "Also in progress" fits beside the highlighted video |
| 1366 / 1920 | common laptop and desktop screens, maximized |

## Rules

- **Window breakpoints only for the frame** (sidebar, player layout): `useMediaQuery` from `shared/ui`, with the
  query as a named constant next to the code that uses it. Never change a saved preference because of the window
  width: the narrow layout is applied on top of it and goes away when the window widens.
- **Inside a screen, size by the room the screen has**, not by the window, because the sidebar changes it: wrapping
  flex rows (`flex-wrap`, `basis-*`), `minmax(0, …)` grid columns, container queries (`@container`) or `useColumns`
  for grids of cards.
- **Page margin is `px-page`** (`--spacing-page`, 16 px in a narrow window up to 40 px). Screens never use a fixed
  `px-8`.
- Long text truncates only where a tooltip or the accessible name keeps the full text (see the a11y checklist).
  Paths and names wrap or truncate; buttons and tabs never shrink below their label.
- A panel that leaves the side in a narrow window (playlist, drawer) keeps its saved width for when it comes back.
- Never put two utilities of the same property on one element (`relative` and `absolute`): Tailwind's CSS order
  decides, not the class order. Pick one with a ternary.
- Overlays over the screen (drawer) make the screen `inert` and close with `Esc`, a click outside and navigation,
  returning focus to what opened them.

## Checking

- Tests: `setWindowWidth(px)` from `shared/test/window` answers `max-width`/`min-width` queries and notifies the
  hooks; it is reset after each test. Cover the narrow and the wide layout, and crossing between them.
- Screens with data can only be seen in `bun tauri dev`: ask the user for screenshots at ~680 and ~900 px (and 1920
  when a max width is involved). Shared components can be checked in `/dev/catalog` with headless Edge at those
  widths (see mnemo-a11y-checklist, item 8).
