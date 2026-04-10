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
| `save-config` | `fields: { model?: string; feed_delay_seconds?: number }` | `{ config: AppConfig; warnings: string[] }` | Merges provided fields into stored config, validates, reloads, and returns the result |

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

### Performance Monitoring

| Channel | Parameters | Return Type | Description |
|---|---|---|---|
| `perf:start` | none | `void` | Starts a 2-second interval collecting CPU, memory, and event loop lag metrics. Sends snapshots to renderer |
| `perf:stop` | none | `void` | Stops the collection interval and logs a summary (peak RSS, peak heap, avg CPU, avg lag) |
| `perf:ping` | none | `number` | Returns `Date.now()` — used by renderer to measure IPC round-trip time |

## Push Events (Main -> Renderer)

| Channel | Payload | Source | Description |
|---|---|---|---|
| `perf:snapshot` | `PerfSnapshot` | `metrics.ts` interval (2 s) | Contains per-process CPU/memory, main process heap stats, and event loop lag |
| `open-settings` | none | Application menu | Sent when user clicks Settings in the app menu (macOS app menu or Help menu) |

## Type Definitions

### AppConfig

```typescript
interface AppConfig {
  soniox: { language: string; model: string; translate_to: string };
  output: { feed_file: string; session_log_dir: string; feed_delay_seconds: number };
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

## Renderer-Side Wrapper

The file `src/renderer/src/lib/ipc.ts` provides typed wrapper functions for every IPC channel. These wrappers access `window.electronAPI` via a `getApi()` helper that throws if the preload bridge is not available. All invoke wrappers are async; the two event listeners (`onPerfSnapshot`, `onOpenSettings`) return unsubscribe functions. `copyToClipboard` is synchronous (uses `clipboard.writeText` from the preload).

## Batching Strategy

The renderer does not call `log-translation` for individual entries. Instead, `soniox.ts` maintains a `logQueue` array. When `queueLogTranslation()` is called, the entry is pushed to the queue and a 200 ms flush timer is scheduled. On flush, all queued entries are sent in a single `log-translations-batch` IPC call. This reduces IPC overhead during high-throughput transcription.
