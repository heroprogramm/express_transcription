# Express Transcribe

A cross-platform desktop application for real-time speech-to-text transcription and translation. Built for the Express 24/7 newsroom workflow, it captures live audio from a microphone, transcribes it using the [Soniox](https://soniox.com/) speech-to-text API, and provides one-way translation (e.g., Urdu to English) -- all in a single window.

## Features

- **Real-time transcription** -- streams audio from any connected microphone and displays partial and final transcription results as they arrive.
- **Live translation** -- translates the transcribed speech into a target language in real time using Soniox one-way translation.
- **Split-pane UI** -- side-by-side view with the original transcript on the left and the translated output on the right.
- **Session logging** -- every session is saved to a timestamped log file for archival purposes.
- **Feed file output** -- writes the latest translated line to a text file (`feed.txt`) that can be consumed by external tools (e.g., OBS, broadcast graphics).
- **Microphone selection** -- choose from any available audio input device, with live device-change detection.
- **Latency and word-count stats** -- a live stats bar shows transcription latency, total word count, and session uptime.
- **Dark and light themes** -- toggle between themes with a single click; preference is persisted in local storage.
- **Configurable** -- language, model, translation target, and output paths are all controlled via a JSON config file.
- **Secure API key storage** -- the Soniox API key is stored locally using `electron-store` (or read from the `SONIOX_API_KEY` environment variable).

## Tech Stack

| Layer        | Technology                                      |
| ------------ | ----------------------------------------------- |
| Desktop      | [Electron](https://www.electronjs.org/) 41      |
| Tooling      | [electron-vite](https://electron-vite.org/) 5   |
| UI Framework | [SolidJS](https://www.solidjs.com/) 1.9         |
| Styling      | [Tailwind CSS](https://tailwindcss.com/) 4      |
| Language      | [TypeScript](https://www.typescriptlang.org/) 6 |
| Speech-to-Text | [Soniox Web SDK](https://soniox.com/)         |
| Package Manager | [Bun](https://bun.sh/)                       |
| Linting      | [oxlint](https://oxc-project.github.io/)        |
| Formatting   | [oxfmt](https://oxc-project.github.io/)         |
| Git Hooks    | [Lefthook](https://github.com/evilmartians/lefthook) |
| CI/CD        | GitHub Actions (cross-platform build and release) |

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [Bun](https://bun.sh/) (used as the package manager and script runner)
- A [Soniox API key](https://soniox.com/) for speech-to-text

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd express-transcribe-v2
```

### 2. Install dependencies

```bash
bun install
```

### 3. Configure your API key

You have two options:

- **Environment variable** -- set `SONIOX_API_KEY` in your shell before running the app.
- **In-app settings** -- launch the app and enter your key in the Settings modal (it will be stored securely via `electron-store`).

### 4. Run in development mode

```bash
bun run dev
```

This starts the Electron app with hot-reload for the renderer process.

## Configuration

Application settings are loaded from `config/default.json`:

```json
{
  "soniox": {
    "language": "ur",
    "model": "stt-rt-v4",
    "translate_to": "en"
  },
  "output": {
    "feed_file": "feed.txt",
    "session_log_dir": "sessions"
  }
}
```

| Key                        | Description                                                  |
| -------------------------- | ------------------------------------------------------------ |
| `soniox.language`          | Source language code (e.g., `ur` for Urdu)                   |
| `soniox.model`             | Soniox model identifier                                      |
| `soniox.translate_to`      | Target translation language code (e.g., `en` for English)    |
| `output.feed_file`         | Name of the rolling feed file written to the app data dir    |
| `output.session_log_dir`   | Subdirectory (under app data) where session logs are stored  |

Output files are written to the Electron `userData` directory:

- **macOS** -- `~/Library/Application Support/express-transcribe/`
- **Windows** -- `%APPDATA%/express-transcribe/`
- **Linux** -- `~/.config/express-transcribe/`

## Scripts

| Command           | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `bun run dev`     | Start the app in development mode with hot-reload     |
| `bun run build`   | Compile the main, preload, and renderer to `out/`     |
| `bun run preview` | Preview the production build locally                  |
| `bun run dist`    | Build and package the app with electron-builder       |
| `bun run lint`    | Lint source files with oxlint                         |
| `bun run fmt`     | Format source files with oxfmt                        |
| `bun run fmt:check` | Check formatting without writing changes            |

## Building for Production

To create distributable packages:

```bash
bun run dist
```

This compiles the app and runs electron-builder, producing platform-specific outputs:

| Platform | Output Format      |
| -------- | ------------------ |
| macOS    | `.dmg`             |
| Windows  | `.exe` (NSIS)      |
| Linux    | `.deb`, `.AppImage` |

## Project Structure

```
express-transcribe-v2/
  config/
    default.json            # App configuration
  src/
    main/
      index.ts              # Electron main process (window, IPC, file I/O)
    preload/
      index.ts              # Context bridge between main and renderer
    renderer/
      index.html            # Entry HTML
      src/
        App.tsx              # Root SolidJS component
        components/
          Controls.tsx       # Mic selector, start/stop/clear buttons
          SettingsModal.tsx   # API key input modal
          StatsBar.tsx        # Latency, word count, uptime display
          ThemeToggle.tsx     # Dark/light theme toggle
          TranscriptPane.tsx  # STT and translation panes
        lib/
          soniox.ts          # Soniox SDK integration
          tauri-bridge.ts    # Electron IPC wrapper
          types.ts           # Shared TypeScript types
        styles/
          app.css            # Global styles
  electron.vite.config.ts    # electron-vite configuration
  package.json
```

## License

Private -- all rights reserved.
