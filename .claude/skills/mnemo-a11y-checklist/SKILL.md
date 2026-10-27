---
name: mnemo-a11y-checklist
description: Accessibility checklist for any visual or UI change in Mnemo (tokens, shared/ui, cards, screens, hover or motion). Use it while planning a UI change and again before calling it done, even when the request only says "make it look better", "restyle", "new card" or "tweak the colors", and pair it with /check.
---

# Accessibility checklist

Mnemo is keyboard-first and dark by default, and its contrast rules are enforced by tests. A visual change is easy to
ship with a regression nobody sees on a normal monitor with a mouse, so go through this list for every UI change: once
when planning (say in the plan which items the change touches) and once before reporting it done (say which were
checked and how).

1. **Contrast.** Colors only come from tokens. A new or changed color token gets a case in
   `src/shared/styles/colors.test.ts` (4.5:1 for text, 3:1 for indicators, icons and field edges on every surface
   listed there). Text over thumbnails sits on `bg-scrim`, never directly on the image.
2. **Windows high contrast (`forced-colors`).** Backgrounds and shadows disappear in that mode. Anything that marks
   state or an edge only with a fill (current item, selection, progress, a card edge) needs a border, outline or text
   that survives it: `border-transparent` turns visible there, so prefer it to removing a border. Bars, tracks and
   knobs that are only a fill use the classes in `shared/ui/forcedColors.ts` (system colors).
3. **Zoom and text size.** The layout has to hold at 200% zoom without cutting text or scrolling sideways: no fixed
   heights on text containers, truncation only where a tooltip or the accessible name gives the full text.
4. **Target size.** Controls are at least 24×24 px (WCAG 2.5.8). Watch `IconButton size="sm"` and icons placed
   inside rows.
5. **Focus.** Every control is reachable with `Tab` and shows the `focus-ring`. Text cut by truncation shows its full
   value on keyboard focus too (`Tooltip` with `useIsTruncated`), since `title` only appears on mouse hover. One card
   is one tab stop: things drawn as buttons inside a card are part of it, not nested buttons.
6. **Names and announcements.** Icon-only controls have a label; decorative icons are `aria-hidden`. When a visible
   word is removed (a "Watched" badge, a status), keep it for screen readers (`sr-only`) if lists or cards are named
   by their content. A visible greeting or label that replaces an `h1` keeps the `h1` (focus goes there on navigation).
7. **Motion.** Transitions use the duration tokens, which `prefers-reduced-motion` sets to zero; looping animations
   get `motion-reduce:animate-none`. Motion answers the user (hover, open, confirm); nothing moves on its own.
8. **Before and after.** For changes in `shared/ui` or tokens, capture `/dev/catalog` before and after with the Vite
   server only (`bun run dev`, port 1420) and headless Edge, then look at both:

   ```sh
   "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,4200 --virtual-time-budget=6000 --screenshot="<scratchpad>/after-catalog-1440.png" "http://localhost:1420/#/dev/catalog"
   ```

   Repeat at 900 px wide. The catalog shows backend error toasts in a browser; ignore them. Screens that need data
   (home, folder, player) can only be checked in `bun tauri dev`, so ask the user for that.

Report the result as one line per item: checked, not affected, or what still needs the user (for example zoom or
high contrast in the real app).
