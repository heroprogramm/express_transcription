# ExpressText

Real-time speech transcription and translation desktop app. ExpressText captures live audio from a microphone, transcribes it using the [Soniox](https://soniox.com/) speech-to-text API, and provides one-way translation (e.g., Urdu to English) -- all in a single window.

## Features

- **Real-time transcription** -- streams audio from any connected microphone and displays partial and final results as they arrive (default source language: Urdu).
- **Live translation** -- translates transcribed speech into a target language in real time (default target: English).
- **Split-pane UI** -- side-by-side view with the original transcript on the left and the translated output on the right, using virtual scrolling for large sessions.
- **Feed file output** -- writes the latest translated line to a text file (`feed.txt`) using atomic writes, consumable by external tools (e.g., OBS, broadcast graphics).
- **Session logging** -- every session is saved to a timestamped log file for archival.
- **Microphone selection** -- choose from any available audio input device with live device-change detection.
- **Dark and light themes** -- toggle between themes; preference is persisted across sessions.
- **Performance monitoring overlay** -- toggle with `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to view CPU usage, FPS, memory, event loop lag, and IPC round-trip time.
- **Secure API key storage** -- the Soniox API key is stored locally using `electron-store` (or read from the `SONIOX_API_KEY` environment variable).
- **Single instance enforcement** -- prevents multiple instances of the app from running simultaneously.
- **Renderer crash recovery** -- the app automatically recovers from renderer process crashes.

## Tech Stack

| Layer           | Technology                                                                    |
| --------------- | ----------------------------------------------------------------------------- |
| Desktop         | [Electron](https://www.electronjs.org/) 41                                   |
| Tooling         | [electron-vite](https://electron-vite.org/) 5                                |
| UI Framework    | [SolidJS](https://www.solidjs.com/) 1.9                                      |
| Styling         | [Tailwind CSS](https://tailwindcss.com/) 4                                   |
| Language        | [TypeScript](https://www.typescriptlang.org/) 6                              |
| Speech-to-Text  | [Soniox Web SDK](https://soniox.com/)                                        |
| Persistence     | [electron-store](https://github.com/sindresorhus/electron-store)             |
| Packaging       | [electron-builder](https://www.electron.build/)                              |
| Package Manager | [Bun](https://bun.sh/)                                                       |
| Linting         | [oxlint](https://oxc-project.github.io/)                                     |
| Formatting      | [oxfmt](https://oxc-project.github.io/)                                      |
| Git Hooks       | [Lefthook](https://github.com/evilmartians/lefthook)                         |
| CI/CD           | GitHub Actions (cross-platform build and release)                             |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [Bun](https://bun.sh/) (package manager and script runner)
- A [Soniox API key](https://soniox.com/) for speech-to-text

### Install dependencies

```bash
bun install
```

### Configure your API key

Launch the app and enter your key in the Settings modal. The key is encrypted using the OS keychain via Electron's `safeStorage` API and persisted locally.

### Run in development mode

```bash
bun run dev
```

This starts the Electron app with hot-reload for the renderer process.

### Build for production

```bash
bun run dist
```

This compiles the app and runs electron-builder, producing platform-specific installers:

| Platform | Output Format       |
| -------- | ------------------- |
| macOS    | `.dmg`              |
| Windows  | `.exe` (NSIS)       |
| Linux    | `.deb`, `.AppImage` |

## Scripts

| Command             | Description                                       |
| ------------------- | ------------------------------------------------- |
| `bun run dev`       | Start the app in development mode with hot-reload |
| `bun run build`     | Compile main, preload, and renderer to `out/`     |
| `bun run preview`   | Preview the production build locally              |
| `bun run dist`      | Build and package the app with electron-builder   |
| `bun run lint`      | Lint source files with oxlint                     |
| `bun run fmt`       | Format source files with oxfmt                    |
| `bun run fmt:check` | Check formatting without writing changes          |

## Configuration

Settings are managed via `electron-store` with sensible defaults. Configurable values:

| Key                          | Default      | Description                                                 |
| ---------------------------- | ------------ | ----------------------------------------------------------- |
| `soniox.language`            | `ur`         | Source language code (e.g., `ur` for Urdu)                  |
| `soniox.model`               | `stt-rt-v4`  | Soniox model identifier                                     |
| `soniox.translate_to`        | `en`         | Target translation language code (e.g., `en` for English)   |
| `output.feed_file`           | `feed.txt`   | Name of the rolling feed file written to the app data dir   |
| `output.session_log_dir`     | `sessions`   | Subdirectory (under app data) where session logs are stored |
| `output.review_time_seconds` | `10`         | Time in seconds to review translations before auto-confirm  |

Output files are written to the Electron `userData` directory:

- **macOS** -- `~/Library/Application Support/express-text/`
- **Windows** -- `%APPDATA%/express-text/`
- **Linux** -- `~/.config/express-text/`

## Project Structure

```
src/
  main/
    index.ts            # Electron main process entry point
    config.ts           # Configuration loading
    ipc.ts              # IPC handler registration
    logger.ts           # Session and feed file logging
    metrics.ts          # Performance metrics collection
    session.ts          # Session lifecycle management
    store.ts            # electron-store setup
    window.ts           # Window creation and crash recovery
  preload/
    index.ts            # Context bridge (main <-> renderer)
  renderer/
    index.html          # Entry HTML
    src/
      App.tsx           # Root SolidJS component
      components/
        Button.tsx          # Reusable button component
        Controls.tsx        # Mic selector, start/stop/clear buttons
        PerfOverlay.tsx     # Performance monitoring overlay
        SettingsModal.tsx   # API key input modal
        StatsBar.tsx        # Latency, word count, uptime display
        ThemeToggle.tsx     # Dark/light theme toggle
        Toast.tsx           # Toast notification component
        TranscriptPane.tsx  # Transcript and translation panes
      lib/
        ipc.ts          # Electron IPC wrapper
        perf.ts         # Client-side performance utilities
        soniox.ts       # Soniox SDK integration
        types.ts        # Shared TypeScript types
      styles/
        app.css         # Global styles
electron.vite.config.ts # electron-vite configuration
package.json
```

## CI/CD

The project uses GitHub Actions for automated builds and releases. Pushing a version tag (e.g., `v0.1.8`) triggers a cross-platform build on macOS, Windows, and Linux, uploads the artifacts, and creates a GitHub Release with the packaged installers.

## Author

**Hamza Shafique** -- [GitHub](https://github.com/hamza-56)

## License

Copyright (c) 2026-present Hamza Shafique. All rights reserved. See [LICENSE](LICENSE) for details.
