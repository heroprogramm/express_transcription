# ExpressText

Real-time speech transcription and translation desktop app. ExpressText captures live audio from a microphone, transcribes it using the [Soniox](https://soniox.com/) speech-to-text API, and provides one-way translation (e.g., Urdu to English) -- all in a single window.

## Features

- **Real-time transcription** -- streams audio from any connected microphone and displays partial and final results as they arrive (default source language: Urdu).
- **Live translation** -- translates transcribed speech into a target language in real time (default target: English).
- **Three-pane UI** -- the original transcript (Speech), the translated output (Translation), and a Viz Engine control surface, with resizable horizontal and vertical splits.
- **Translation review window** -- each translated line shows a configurable countdown (default 10 s) during which the operator can click to inline-edit the text before it is committed and forwarded.
- **Viz Engine integration** -- pushes confirmed translations to a Vizrt graphics engine over TCP (15 text slots, scroll animation, idle/edit auto-pause, Ctrl+Space toggle, hard reset).
- **Feed file output** -- writes the latest translated line to a text file (`feed.txt`) using atomic writes, consumable by external tools (e.g., OBS, broadcast graphics).
- **Session logging** -- every session is saved to a timestamped log file for archival.
- **Microphone selection** -- choose from any available audio input device with live device-change detection and a per-pane audio waveform visualizer.
- **Dark and light themes** -- toggle between themes; preference is persisted across sessions.
- **Performance monitoring overlay** -- toggle with `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to view CPU usage, FPS, memory, event loop lag, and IPC round-trip time.
- **Auto-updates** -- background update checks via `electron-updater` (GitHub releases) with a toast prompt to restart when a new version is downloaded.
- **Secure API key storage** -- the Soniox API key is encrypted with the OS keychain via Electron's `safeStorage` and persisted with `electron-store`.
- **Single instance enforcement** -- prevents multiple instances of the app from running simultaneously.
- **Renderer crash recovery** -- the app automatically recovers from renderer process crashes.

## Tech Stack

| Layer           | Technology                                                                    |
| --------------- | ----------------------------------------------------------------------------- |
| Desktop         | [Electron](https://www.electronjs.org/) 41                                   |
| Tooling         | [electron-vite](https://electron-vite.org/) 5                                |
| UI Framework    | [SolidJS](https://www.solidjs.com/) 1.9                                      |
| Styling         | [Tailwind CSS](https://tailwindcss.com/) 4                                   |
| Icons           | [lucide-solid](https://lucide.dev/)                                          |
| Language        | [TypeScript](https://www.typescriptlang.org/) 6                              |
| Speech-to-Text  | [Soniox Web SDK](https://soniox.com/)                                        |
| Persistence     | [electron-store](https://github.com/sindresorhus/electron-store)             |
| Auto-updates    | [electron-updater](https://www.electron.build/auto-update)                   |
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

| Key                                | Default                                          | Description                                                                     |
| ---------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `soniox.language`                  | `ur`                                             | Source language code (e.g., `ur` for Urdu)                                     |
| `soniox.model`                     | `stt-rt-v4`                                      | Soniox model identifier                                                         |
| `soniox.translate_to`              | `en`                                             | Target translation language code (e.g., `en` for English)                       |
| `soniox.endpoint_detection`        | `false`                                          | Enable Soniox endpoint detection for finalising utterances                      |
| `output.feed_file`                 | `feed.txt`                                       | Name of the rolling feed file written to the app data dir                       |
| `output.session_log_dir`           | `sessions`                                       | Subdirectory (under app data) where session logs are stored                     |
| `output.review_time_seconds`       | `10`                                             | Time in seconds to review translations before auto-confirm                      |
| `viz.host`                         | `127.0.0.1`                                      | Viz Engine hostname or IP                                                       |
| `viz.port`                         | `6100`                                           | Viz Engine TCP port                                                             |
| `viz.scene_path`                   | `EXPRESS_24_7/TRANSLATION_BB/Translation_BB`     | Scene object path to load on the engine                                         |
| `viz.scroll_speed`                 | `0.3`                                            | Default scroll velocity per frame (0.1–1.0)                                     |
| `viz.auto_pause_on_idle`           | `true`                                           | Pause scroll when no new text arrives                                           |
| `viz.auto_pause_on_idle_seconds`   | `10`                                             | Seconds of inactivity before idle pause triggers                                |
| `viz.auto_pause_on_edit`           | `true`                                           | Pause scroll when the operator is editing a pending translation                 |

Output files are written to the Electron `userData` directory:

- **macOS** -- `~/Library/Application Support/express-text/`
- **Windows** -- `%APPDATA%/express-text/`
- **Linux** -- `~/.config/express-text/`

## Project Structure

```
src/
  main/
    index.ts            # Electron main process entry point
    config.ts           # Configuration loading and validation
    ipc.ts              # IPC handler registration
    logger.ts           # Session and feed file logging
    metrics.ts          # Performance metrics collection
    session.ts          # Session lifecycle management
    store.ts            # electron-store setup
    updater.ts          # Auto-update lifecycle (electron-updater)
    viz-engine.ts       # Viz Engine TCP controller (command + scroll sockets)
    window.ts           # Window creation and crash recovery
  preload/
    index.ts            # Context bridge (main <-> renderer)
  shared/
    timings.ts          # Shared timing constants
    types.ts            # Shared TypeScript types (AppConfig, VizStatus, …)
    utils.ts            # Cross-process utilities
  renderer/
    index.html          # Entry HTML
    public/
      theme-init.js     # Pre-paint theme bootstrap
    src/
      App.tsx           # Root SolidJS component
      index.tsx         # Renderer entry point
      assets/           # Logos and Urdu/Latin web fonts
      components/
        AudioWaveform.tsx   # Live mic waveform visualiser
        Button.tsx          # Reusable button component
        ConfirmDialog.tsx   # Modal confirm prompt (Stop, Clear, Hard Reset)
        Controls.tsx        # Mic selector, start/stop/clear buttons
        PerfOverlay.tsx     # Performance monitoring overlay (lazy)
        ResizeHandle.tsx    # Horizontal/vertical pane resize handle
        SettingsModal.tsx   # Settings modal (Soniox / Output / Viz Engine tabs, lazy)
        SpeechPane.tsx      # STT (Urdu) transcript pane
        StatsBar.tsx        # Latency, lines, uptime, signal indicator
        ThemeToggle.tsx     # Dark/light theme toggle
        Toast.tsx           # Toast notification container
        TranslationPane.tsx # Translated entries with review/edit lifecycle
        VizPane.tsx         # Viz Engine control surface and history log
      lib/
        audio-level.ts      # Double-buffered audio level tracking
        entry-manager.ts    # Entry lifecycle (pending → editing → confirmed → sent)
        errors.ts           # Toast-based user error reporting
        ipc.ts              # Typed Electron IPC wrapper
        perf.ts             # Renderer-side performance utilities
        soniox.ts           # Soniox SDK integration (audio + auto-reconnect)
        types.ts            # Renderer-only TypeScript types
        use-auto-scroll.ts  # Auto-scroll pinning hook
      styles/
        app.css         # Global styles
docs/
  architecture.md       # High-level architecture, data flow, lifecycle
  components.md         # Component tree and responsibilities
  ipc-protocol.md       # Full IPC channel reference
  viz-engine.md         # Viz Engine TCP protocol and integration
electron.vite.config.ts # electron-vite configuration (path aliases @/ and @shared/)
package.json
```

## Release Flow

Releases are produced by [`.github/workflows/build.yml`](.github/workflows/build.yml) via GitHub Actions. The workflow runs whenever a tag matching `v*` is pushed (or it can be invoked manually with `workflow_dispatch`).

### Cutting a release

1. Bump the `version` field in `package.json` (this drives the artifact filenames and the auto-updater).
2. Commit the bump on `main` -- e.g., `chore: bump version to 0.1.23`.
3. Create and push a matching tag:

   ```bash
   git tag v0.1.23
   git push origin v0.1.23
   ```

   The tag must use the `v` prefix to satisfy both the workflow's `tags: ["v*"]` filter and electron-builder's `vPrefixedTagName: true` setting. The GitHub Release name itself is unprefixed (e.g., `0.1.23`).

### What the workflow does

For each push of a `v*` tag, the workflow fans out across a three-row matrix (`macos-latest`, `windows-latest`, `ubuntu-latest`) and on every runner:

1. Checks out the tagged commit.
2. Sets up Bun and installs dependencies with `bun install --frozen-lockfile`.
3. Compiles main, preload, and renderer with `bun run build`.
4. Packages the app with `bunx electron-builder --<platform> --publish onTagOrDraft`, which both produces the installers and uploads them to the GitHub Release for that tag.

`GH_TOKEN` is set to a `PAT_TOKEN` secret during the build step (used by `electron-updater` metadata) and to the workflow's `GITHUB_TOKEN` during the package step (used to publish to the private repo). On failure, `dist/*.log` is uploaded as a `build-logs-<platform>` artifact for 3 days.

### Generated targets

Artifacts are named by the `artifactName` template in `package.json` -- `${productName}-${version}-${os}-${arch}.${ext}` -- so `v0.1.23` produces files such as `ExpressText-0.1.23-mac-arm64.dmg`.

| Platform | Targets             |
| -------- | ------------------- |
| macOS    | `.dmg`              |
| Windows  | `.exe` (NSIS)       |
| Linux    | `.deb`, `.AppImage` |

Alongside the installers, electron-builder uploads the `latest*.yml` channel files (`latest-mac.yml`, `latest.yml`, `latest-linux.yml`) and accompanying blockmaps. The auto-updater (`electron-updater`) reads these from the GitHub Release feed to detect and download new versions in the background.

## Author

**Hamza Shafique** -- [GitHub](https://github.com/hamza-56)

## License

Copyright (c) 2026-present Hamza Shafique. All rights reserved. See [LICENSE](LICENSE) for details.
