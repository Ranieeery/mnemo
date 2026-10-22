---
name: release
description: Prepares a Mnemo release X.Y.Z. Bumps the version in the five files that carry it, drafts the release notes in the CLAUDE.md format from the changes since the last tag, and hands over the build, commit, tag and publish commands without running them.
argument-hint: "X.Y.Z"
disable-model-invocation: true
---

# Release

Prepares release `$ARGUMENTS`. You only change files and draft text. The user builds, commits, tags and
publishes.

## 1. Check the request

- `$ARGUMENTS` must be a plain semver `X.Y.Z` with no `v`. Otherwise stop and ask for the version.
- Read the current version from `package.json`. The new one must be greater. Name the kind of bump (major, minor or
  patch) and stop to ask if it looks wrong for the changes found in step 3. For example, a feature in a patch.
- The previous release is `git describe --tags --abbrev=0`. Tags have no `v`.
- The working tree should be clean apart from what this release changes. If `git status` shows other changes, list
  them and ask before going on.

## 2. Bump the version

Change `<old>` to `<new>` in exactly these places:

| File | Where |
|---|---|
| `package.json` | the top-level `"version"` |
| `src-tauri/Cargo.toml` | `version` under `[package]` (the line after `name = "mnemo"`) |
| `src-tauri/Cargo.lock` | only the `version` of the `[[package]]` whose `name = "mnemo"`. Other crates share version numbers, so never replace globally |
| `src-tauri/tauri.conf.json` | the top-level `"version"` |
| `README.md` | `<strong>Version <old></strong>` near the top, and any other mention of the current version |

Afterwards, search the five files for `<old>` and confirm that the only matches left belong to other crates in
`Cargo.lock`.

## 3. Draft the release notes

Gather what changed: `git log <previous>..HEAD --oneline`, plus the diffs of `docs/features.md`,
`docs/database.md` and `docs/media-and-sync.md` since that tag. Those docs describe behavior from the user's side,
so prefer them over commit messages.

Write the notes in English Markdown for people who use the app, in the CLAUDE.md format:

- `# Mnemo X.Y.Z`;
- an opening paragraph: what the version brings, and that libraries and exports from earlier versions open as
  before (say how if not);
- `## Highlights`: 3 to 5 items, each starting with a bold phrase;
- one `##` section per area (e.g. Library, Player, History, Settings, Accessibility) with what changed for the user;
- `## Fixes`, when there are any;
- `## Upgrading from X.Y`: data kept, behavior changes, requirements (e.g. ffmpeg).

Shortcuts and formats go in backticks. Never mention code names, commands, tables, files or internal refactors.
Leave out changes that only touch tests, tooling or docs.

Save the draft to `release-notes-<new>.md` in the scratchpad directory and show it in the reply.

## 4. Hand over

Never run these yourself; the git guard blocks committing and tagging anyway. Give them to the user in order. The
Rust checks run inside `src-tauri`, so every later step must start back at the repository root: the paths below are
relative to it. Tell the user to stop at the first command that fails. In particular, a failed `git commit` must
never be followed by the tag, or the tag points at the previous commit.

```sh
cd "$(git rev-parse --show-toplevel)"
bun run check
(cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test)
bun tauri build               # installers in src-tauri/target/release/bundle/
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json README.md
git commit -m "chore(release): <new>"
git log -1 --format=%s        # must print chore(release): <new> before tagging
git tag <new>
git push && git push origin <new>
gh release create <new> --title "<new>" --notes-file <notes file> \
  src-tauri/target/release/bundle/msi/*.msi src-tauri/target/release/bundle/nsis/*-setup.exe
```

The notes file given to `gh` must start with
`**Full Changelog**: https://github.com/Ranieeery/mnemo/compare/<previous>...<new>` followed by a blank line.
Write that line at the top of the saved draft.
