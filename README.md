<p align="center">
   <img src="./public/logo.png" alt="Mnemo Logo" width="160" />
</p>

<h1 align="center">Mnemo: Local Video Library</h1>

<p align="center">
  <strong>Version 2.3.0</strong> - Desktop application for managing and watching your local video collection
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
  custom icons for library folders.
- **Sort and filter:** sort a folder's videos by name, duration or date added, and show only unwatched, in-progress
  or watched ones.
- **Two ways to view a folder:** *Folders* shows only what is directly inside it; *Continuous* lists every video below
  it grouped by subfolder, and playback continues from one subfolder to the next (great for courses). Subfolders
  inherit the choice until you change it.
- **Home:** continue watching, suggestions, recently watched and a preview of each library folder.
- **Built-in player:** resumes where you stopped, subtitles from a file next to the video (`.srt`, `.vtt`, `.sub`,
  `.ass`) or embedded in it (text tracks of MKV and MP4), switching between audio tracks where the system's webview
  can play them, speeds from 0.25× to 2×, an "Up next" list and a countdown to the next video, plus keyboard and
  mouse shortcuts. Volume, speed, subtitles and theater mode are remembered between sessions.
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
  they come back. Unplugged drives never lose anything.
- **Backup:** export the whole library to JSON and import it back (exports from Mnemo 1.x are accepted too).
- **Maintenance:** library statistics, database details and cleanup of videos that no longer belong to a folder or
  whose file is gone.

## Shortcuts

Press `?` anywhere (or the keyboard button in the top bar or the player) to see every shortcut. Player and
back/forward keys can be changed in Settings → Shortcuts; the tables below show the defaults.

### Anywhere

| Keys | Action |
|---|---|
| `Alt+←` / mouse back button | Go back (closes the player) |
| `Alt+→` / mouse forward button | Go forward (reopens the last video) |
| `?` | Show the keyboard shortcuts |
| `Esc` in the search field | Clear the search |

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
| `Esc` | Leave full screen, or close the player |

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
- **Interface:** React 19, TypeScript, TanStack Router, Query and Virtual, Radix UI, Tailwind CSS 4 with design
  tokens.
- **Tooling:** Vite, Bun, Biome, Vitest and Testing Library, clippy and rustfmt.

See [CLAUDE.md](CLAUDE.md) for the architecture and conventions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
