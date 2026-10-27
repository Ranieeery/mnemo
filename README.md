<p align="center">
   <img src="./public/logo.png" alt="Mnemo Logo" width="160" />
</p>

<h1 align="center">Mnemo: Local Video Library</h1>

<p align="center">
  <strong>Version 2.8.1</strong> - Desktop application for managing and watching your local video collection
</p>

<p align="center">
  <a href="https://github.com/Ranieeery/mnemo/releases">
    <img src="https://img.shields.io/github/v/release/Ranieeery/mnemo?style=flat-square" alt="Latest Release">
  </a>
  <a href="https://github.com/Ranieeery/mnemo/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/Ranieeery/mnemo/stargazers">
    <img src="https://img.shields.io/github/stars/Ranieeery/mnemo?style=flat-square" alt="Stars">
  </a>
</p>

---

## What is Mnemo?

Mnemo organizes and plays the videos you already have on disk. Unlike media servers, it never moves or renames
anything: you browse your library by its real folder structure, like a file explorer, while Mnemo keeps titles,
thumbnails, tags and watch progress in a local SQLite database.

## Features

- **Folder-based library:** add folders and browse their real hierarchy, with breadcrumbs, per-folder progress and
  custom icons and icon colors for library folders.
- **Rename library folders in the app:** give a library folder a name of your own (right-click it and choose
  "Rename", or press `F2` on it). The folder on disk keeps its name, which still shows in the folder's tooltip and on
  its screen; clear the name, or choose "Reset to folder name", to use it again.
- **Sort and filter:** sort a folder's videos by name, duration or date added, and show only unwatched, in-progress
  or watched ones.
- **Two ways to view a folder:** *Folders* shows only what is directly inside it; *Continuous* lists every video below
  it grouped by subfolder, and playback continues from one subfolder to the next (great for courses). Subfolders
  inherit the choice until you change it.
- **Adjustable sidebar:** drag its edge to resize it, or collapse it to a rail of icons that still reaches every
  screen and folder. It opens the way you left it.
- **Library folder order:** sort the library folders by name, date added or the most recently watched, or arrange
  them yourself by holding and dragging them (or with the keyboard, or "Move up"/"Move down"). Pin a folder or a
  group to keep it at the top of its list in any order. The order is kept everywhere they are listed, including
  backups.
- **Folder groups:** organize the library folders into groups of your own (such as "Series" or "Courses") from the
  sort menu or a folder's "Move to group". Groups sit among the other folders in the order you choose, and the sort
  modes apply to them too (by name, date created or the most recently watched folder inside). Drag folders into a
  group, out of it or between groups (holding a folder over a collapsed group opens it), collapse a group to its
  name and folder count, and move groups by dragging their headers. Deleting a group never removes its folders: they
  stay where the group was (pinned ones stay pinned). With no groups, the sidebar looks as it always did.
- **Home:** the video to resume first, large, with the others in progress beside it, then suggestions, recently
  watched and a preview of each library folder.
- **Any window size:** from 640×480 (half a laptop screen) up; in a narrow window the sidebar becomes a rail that opens
  over the screen and the player's playlist moves under the video.
- **Zoom:** `Ctrl +`, `Ctrl -` and `Ctrl 0` (or `Ctrl` and the mouse wheel) zoom the interface from 67% to 300%,
  kept between sessions.
- **Hidden folders:** hide any folder from the home page, search and history (right-click it and choose "Hide from
  home and history"). Its videos still play normally when you open the folder, progress is still saved, and
  Settings lists every hidden folder to show it again.
- **Built-in player:** resumes where you stopped, subtitles from a file next to the video (`.srt`, `.vtt`, `.sub`,
  `.ass`) or embedded in it (text tracks of MKV and MP4), switching between audio tracks where the system's webview
  can play them, speeds from 0.25× to 2×, the folder's playlist beside the video (or under it in a narrow window), a
  countdown to the next video, the description and tags under it, plus keyboard and mouse shortcuts. Volume, speed,
  subtitles and theater mode are remembered between sessions.
- **Mini player:** shrink the window to a small video that stays on top of other apps in a corner of the screen, with
  just the essential controls; subtitles, the countdown to the next video and every shortcut keep working, and
  expanding it puts the window back exactly as it was.
- **Pin window:** keep the whole Mnemo window on top of other apps at any size, from the player's controls or a key
  of your choice that works on every screen (until you unpin it or close the app).
- **Subtitle style:** size, color, background and its opacity, outline, position and font, with a live preview.
- **Custom thumbnails:** use the frame on screen as a video's thumbnail, or go back to the automatic one.
- **Watch status:** videos count as watched at 90% by default (adjustable from 50% to 100%) or when they end; mark
  videos or whole folders as watched or unwatched.
- **History:** the videos you watched, by day, and your watched time per day or week.
- **Tags:** tag videos individually or a whole folder at once, search by tag, and clean up tags in Settings.
- **Search:** search the library by title, description and tag, or search file names on disk inside a folder,
  including videos not read yet.
- **Background processing:** durations and thumbnails are read with ffmpeg in the background, several files at a
  time, with progress, details per folder and a cancel button.
- **Follows your folders:** new videos show up on their own. Renamed or moved videos keep their progress, tags and
  history, even when the change was made while Mnemo was closed. Deleted videos are kept aside for 30 days in case
  they come back. Unplugged drives never lose anything, and a folder moved, renamed or whose drive got another
  letter can be located again, keeping everything (files are never moved).
- **Backup:** export the whole library to JSON and import it back (exports from Mnemo 1.x are accepted too).
- **Maintenance:** library statistics, database details and cleanup of videos that no longer belong to a folder or
  whose file is gone.
- **Update notices:** Mnemo tells you when a newer version is published on GitHub, with a link to its release page,
  and Settings → Maintenance can check on demand. It never downloads or installs anything by itself.

## Privacy

Mnemo works offline. Its only network request is the update check: once a day at most, shortly after it starts, it
asks GitHub's API for the latest published release, sending nothing but the standard request (with `Mnemo/<version>`
as its user agent; GitHub sees your IP address, as with any request). No telemetry, no account. Turn off "Check for
updates automatically" in Settings → Maintenance and no request is made unless you click "Check now".

## Shortcuts

Press `?` anywhere (or the keyboard button in the top bar or the player) to see every shortcut. Player, window and
back/forward keys can be changed in Settings → Shortcuts; the tables below show the defaults. "Pin window" has no
key until you give it one.

### Anywhere

| Keys | Action |
|---|---|
| `Alt+←` / mouse back button | Go back (closes the player) |
| `Alt+→` / mouse forward button | Go forward (reopens the last video) |
| `?` | Show the keyboard shortcuts |
| `F2` on a library folder in the sidebar | Rename it in the app |
| `Esc` in the search field | Clear the search |
| `Ctrl +` / `Ctrl -` / `Ctrl 0` | Zoom in / out / back to 100% |

### Player

| Keys | Action |
|---|---|
| `Space` / `K` | Play or pause |
| `J` / `L` | Back / forward 10 seconds |
| `←` / `→` | Back / forward 5 seconds |
| `↑` / `↓` | Volume up / down 5% |
| `[` / `]` | Speed down / up 0.25× |
| `Backspace` | Reset speed to 1× |
| `F` | Full screen |
| `T` | Theater mode |
| `M` | Mute |
| `C` | Subtitles on or off |
| `I` | Mini player on or off |
| `Esc` | Leave full screen or the mini player, or close the player |

Right-click a video or a folder (or press `Shift+F10` on it) for its actions.

## Requirements

- **ffmpeg and ffprobe** on the `PATH`, to read durations and create thumbnails. Mnemo still opens without them and
  tells you what is missing.
  - Windows: `winget install Gyan.FFmpeg`
  - macOS: `brew install ffmpeg`
  - Debian/Ubuntu: `sudo apt install ffmpeg`
- **Windows:** WebView2 (included in Windows 10 and 11).

## Install

Download the latest installer from the [Releases](https://github.com/Ranieeery/mnemo/releases) page.

> Published binaries are currently Windows-only (`.exe` with NSIS and `.msi`). macOS and Linux can build from source.

### Upgrading from 1.x

Just install and open the new version: your existing library (`mnemo.db`) is upgraded in place and nothing is lost.
Back it up first if you want to be able to go back, since 1.x cannot read the upgraded database or 2.0 exports.

| OS | Data folder |
|---|---|
| Windows | `%APPDATA%\com.mnemo` |
| macOS | `~/Library/Application Support/com.mnemo` |
| Linux | `~/.config/com.mnemo` (database) and `~/.local/share/com.mnemo` (thumbnails) |

## Build from source

### Prerequisites

- [Bun](https://bun.sh)
- [Rust](https://rustup.rs) (stable)
- The [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS:
  - Windows: Microsoft C++ Build Tools ("Desktop development with C++"). If Smart App Control is on, it blocks the
    executables Cargo builds; turn it off to compile.
  - macOS: Xcode Command Line Tools.
  - Linux: WebKitGTK and the other packages listed by Tauri.
- ffmpeg and ffprobe (see Requirements).

### Run and build

```sh
bun install          # dependencies
bun tauri dev        # run the app in development
bun tauri build      # installers in src-tauri/target/release/bundle/
```

### Checks

```sh
bun run check        # TypeScript, Biome lint and frontend tests
bun run format       # format the frontend

cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test           # backend tests; also regenerates the TypeScript bindings
```

In development, `Ctrl+Shift+D` opens the design system catalog.

## Technology

- **Desktop shell:** [Tauri 2](https://tauri.app) with a Rust backend that owns the database, the file system and
  ffmpeg (SQLite through `rusqlite`, versioned migrations, typed commands generated with `tauri-specta`).
- **Interface:** React 19, TypeScript, TanStack Router, Query and Virtual, Radix UI, dnd-kit, Tailwind CSS 4 with
  design tokens.
- **Tooling:** Vite, Bun, Biome, Vitest and Testing Library, clippy and rustfmt.

See [CLAUDE.md](CLAUDE.md) for the architecture and conventions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
