---
name: check
description: Runs Mnemo's definition of done (typecheck, lint, tests, rustfmt, clippy, cargo test, build) in order and stops at the first failure. Optionally scoped to one area, e.g. `/check player` or `/check sync`. Use before saying a change is ready.
argument-hint: "[area]"
---

# Check

Runs the checks that CLAUDE.md requires before a change is ready, cheapest first, and stops at the first failure.

## Rules

- This machine struggles with heavy commands: run one step at a time, never in parallel, and always give Vitest
  `--maxWorkers=2`.
- Stop at the first failing step. Show the relevant part of its output (the failing tests or the errors, not the
  whole log) and do not run the next steps.
- Never "fix" a failure by weakening a test or a lint rule. Report it, and fix the code only if the user asked for it.
- Never commit. The git guard blocks it anyway.

## Steps

Frontend steps run from the repository root, Rust steps from `src-tauri`.

1. `bun run typecheck`
2. `bun run lint`
3. Tests:
   - with no area: `bun run test --maxWorkers=2`;
   - with an area: run only the matching paths that exist: `src/features/<area>`, `src/shared/<area>`,
     `src/app/<area>` (e.g. `bun run test src/features/player --maxWorkers=2`). If none exists, say so and run the
     whole suite.
4. `cargo fmt --check`
5. `cargo clippy --all-targets -- -D warnings`
6. Rust tests:
   - with no area: `cargo test`. It also regenerates `src/shared/ipc/bindings.ts`: if `git status` then shows that
     file changed, report it, because the bindings were out of date;
   - with an area: `cargo test <area>::` (e.g. `cargo test sync::`).
7. With no area only: `bun run build`, which must finish without warnings.

## Report

End with one line per step, `ok` or `failed`, with the counts the tool printed (e.g. `vitest 484 passed`,
`cargo test 322 passed`), plus any step skipped and why. For a scoped run, say that it was scoped and that the
full `/check` is still needed before the change is ready.
