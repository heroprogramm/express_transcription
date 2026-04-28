# IPC Protocol

All IPC communication between the main and renderer processes passes through the preload bridge (`contextBridge.exposeInMainWorld`). The renderer never uses `ipcRenderer` directly.

## Invoke/Handle Channels (Renderer -> Main)

### Authentication

| Channel | Parameters | Return Type | Description |
|---|---|---|---|
| `get-api-key` | none | `string \| null` | Decrypts and returns the stored Soniox API key, or `null` if none exists |
| `save-api-key` | `key: string` | `void` | Encrypts the key via `safeStorage` and persists it in `electron-store`. Validates non-empty and max 512 chars |
| `has-api-key` | none | `boolean` | Returns whether an encrypted API key exists in the store |

### Configuration

| Channel | Parameters | Return Type | Description |
|---|---|---|---|
| `get-config` | none | `{ config: AppConfig; warnings: string[] }` | Returns the current config merged with defaults, plus any validation warnings |
| `save-config` | `fields: { model?: string; endpoint_detection?: boolean; review_time_seconds?: number; viz_host?: string; viz_port?: number; viz_scene_path?: string; viz_scroll_speed?: number; viz_auto_pause_on_idle?: boolean; viz_auto_pause_on_idle_seconds?: number; viz_auto_pause_on_edit?: boolean }` | `{ config: AppConfig; warnings: string[] }` | Merges provided fields into stored config, validates, reloads, and returns the result |
| `get-models` | none | `Array<{ id: string; name: string }>` | Returns the list of Soniox models available for selection in Settings |

### Session Management

| Channel | Parameters | Return Type | Description |
|---|---|---|---|
| `start-session` | none | `void` | Creates a session log file (`sessions/session_YYYYMMDD_HHMMSS.txt`) and sets the feed file path |
| `stop-session` | none | `void` | Flushes the feed buffer, closes the session write stream |
| `log-translation` | `timestamp: string, text: string` | `void` | Appends `[timestamp] text\n` to session log and feed buffer. Validates: timestamp max 20 chars, text max 10,000 chars |
| `log-translations-batch` | `batch: Array<{ ts: string; text: string }>` | `void` | Processes each item through `logTranslation` with the same validation. Used by the renderer's 200 ms flush |

### System

| Channel | Parameters | Return Type | Description |
|---|---|---|---|
| `ensure-mic-access` | none | `"granted" \| "denied" \| "opened-settings"` | macOS: checks `getMediaAccessStatus`, prompts via `askForMediaAccess`, or opens System Preferences. Windows: checks status or opens `ms-settings:privacy-microphone`. Linux: returns `"granted"` |
| `clipboard:write` | `text: string` | `void` | Writes text to the system clipboard |

### Performance Monitoring

| Channel | Parameters | Return Type | Description |
|---|---|---|---|
| `perf:start` | none | `void` | Starts a 2-second interval collecting CPU, memory, and event loop lag metrics. Sends snapshots to renderer |
| `perf:stop` | none | `void` | Stops the collection interval and logs a summary (peak RSS, peak heap, avg CPU, avg lag) |
| `perf:ping` | none | `number` | Returns `Date.now()` — used by renderer to measure IPC round-trip time |

### Viz Engine

| Channel | Parameters | Return Type | Description |
|---|---|---|---|
| `viz:load-scene` | none | `void` | Connects to Viz Engine (if needed) and loads the configured scene |
| `viz:continue` | none | `void` | Sends an IN/OUT (continue) command to the Viz Engine |
| `viz:send-text` | `text: string` | `void` | Pushes a translation line to the next available Viz Engine text slot. Validates: max 10,000 chars |
| `viz:toggle-scroll` | `start: boolean` | `void` | Starts or stops the Viz Engine scroll animation |
| `viz:edit-pause` | none | `void` | Pauses scroll due to user editing a translation (only if `auto_pause_on_edit` is enabled) |
| `viz:set-speed` | `speed: number` | `void` | Sets the scroll speed (0.1–1.0) |
| `viz:hard-reset` | none | `void` | Stops scroll animation and clears all text slots |
| `viz:get-status` | none | `VizStatus` | Returns the current Viz Engine controller state |

## Push Events (Main -> Renderer)

| Channel | Payload | Source | Description |
|---|---|---|---|
| `perf:snapshot` | `PerfSnapshot` | `metrics.ts` interval (2 s) | Contains per-process CPU/memory, main process heap stats, and event loop lag |
| `open-settings` | none | Application menu | Sent when user clicks Settings in the app menu (macOS app menu or Help menu) |
| `update-status` | `status: string, version?: string` | `updater.ts` | Auto-updater lifecycle events: `"downloading"`, `"ready"`, `"up-to-date"`, `"error"` |
| `viz:status` | `VizStatus` | `viz-engine.ts` | Periodic Viz Engine state snapshot pushed to the renderer |

## Type Definitions

### AppConfig

```typescript
interface AppConfig {
  soniox: { language: string; model: string; translate_to: string; endpoint_detection: boolean };
  output: { feed_file: string; session_log_dir: string; review_time_seconds: number };
  viz: { host: string; port: number; scene_path: string; scroll_speed: number; auto_pause_on_idle: boolean; auto_pause_on_idle_seconds: number; auto_pause_on_edit: boolean };
}
```

### VizStatus

```typescript
type VizConnection = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

interface VizStatus {
  connection: VizConnection;        // Command socket lifecycle state
  isAnimating: boolean;             // Scroll loop active
  isLoaded: boolean;                // Local flag: scene was loaded this session
  loadedSceneName: string | null;   // Authoritative scene name reported by the engine (null if unknown)
  hasData: boolean;                 // At least one text slot has been written
  autoPaused: boolean;              // Scroll auto-paused (idle or edit)
  currentIdx: number;               // Next slot index (1–15)
  yPos: number;                     // Current scroll position
  scrollSpeed: number;              // Active scroll speed
  history: VizLogEntry[];           // Recent action/event log (max 30 entries)
}

interface VizLogEntry {
  time: string;
  msg: string;
  type: "info" | "action";
}
```

### PerfSnapshot

```typescript
interface PerfSnapshot {
  ts: number;
  processes: Array<{
    pid: number;
    type: string;                          // "Browser" (main), "Tab" (renderer), etc.
    cpu: { percentCPUUsage: number };
    memory: { workingSetSize: number; privateBytes: number };
  }>;
  mainMemory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  eventLoopLagMs: number;
}
```

## One-Way Sends (Renderer -> Main)

| Channel | Parameters | Description |
|---|---|---|
| `restart-for-update` | none | Triggers `autoUpdater.quitAndInstall()` to restart the app and apply a downloaded update |

## Renderer-Side Wrapper

The file `src/renderer/src/lib/ipc.ts` provides typed wrapper functions for every IPC channel. These wrappers access `window.electronAPI` via a `getApi()` helper that throws if the preload bridge is not available. All invoke wrappers are async; event listeners (`onPerfSnapshot`, `onOpenSettings`, `onUpdateStatus`, `onVizStatus`) return unsubscribe functions. `copyToClipboard` is fire-and-forget. `restartForUpdate` sends a one-way message to trigger app restart for updates.

## Batching Strategy

The renderer does not call `log-translation` for individual entries. Instead, `soniox.ts` maintains a `logQueue` array. When `queueLogTranslation()` is called, the entry is pushed to the queue and a 200 ms flush timer is scheduled. On flush, all queued entries are sent in a single `log-translations-batch` IPC call. This reduces IPC overhead during high-throughput transcription.
