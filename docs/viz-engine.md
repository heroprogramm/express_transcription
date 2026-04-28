# Viz Engine Integration

ExpressText pushes live translations to a Vizrt graphics engine over TCP, enabling on-air lower-third crawls. The main process (`src/main/viz-engine.ts`) owns the TCP connections; the renderer controls Viz through IPC.

## Architecture

```
┌──────────────────────────────────┐     ┌──────────────────────┐
│          Renderer (UI)           │     │      Viz Engine      │
│                                  │     │   (TCP port, e.g.    │
│  VizPane ──IPC──► viz-engine.ts ─┼─TCP─┤    6100)             │
│                                  │     │                      │
│  App.tsx createEffect:           │     │  Scene with DataPool │
│    sentEntries → vizSendText() ──┼─IPC─┤  15 text slots       │
└──────────────────────────────────┘     └──────────────────────┘
```

The renderer communicates with `viz-engine.ts` via IPC only. Two independent TCP sockets connect to the Viz Engine host:

| Socket | Purpose | Lifecycle |
|---|---|---|
| **Command socket** | Scene loading, text slot writes, animation control, reset | Persistent with auto-reconnect (5 s backoff) |
| **Scroll socket** | High-frequency `ScrollY` updates (~30 ms interval) | Created on scroll start, destroyed on stop |

## Connection Management

### Command Socket

- Opened eagerly from `vizInit()` at app startup so the connection badge reflects real engine state from the first frame
- Kept alive (`setKeepAlive: true`) for the app's lifetime
- On disconnect: auto-reconnects after 5 seconds (`VIZ_RECONNECT_DELAY_MS`)
- On error: logs warning, marks the connection state, pushes status to renderer
- Commands use request/response with a 2 s timeout (`VIZ_CMD_TIMEOUT_MS`)

### Scroll Socket

- Separate socket to avoid blocking command responses with high-frequency writes
- Created only when scroll animation starts
- If disconnected during animation: reconnects after 5 s and resumes the scroll loop
- Destroyed when scroll stops or on hard reset

## Protocol

All commands are null-terminated (`\0`) UTF-8 strings sent over raw TCP. The Viz Engine uses a line-based protocol where each command gets a response. `vizTalk()` accumulates incoming chunks until the trailing `\0` is observed before resolving — Viz responses can arrive across multiple TCP packets.

### Command Types

**Scene Loading:**
```
-1 RENDERER*MAIN_LAYER SET_OBJECT SCENE*{scene_path}
```

**Scene Query (used to detect what's actually loaded):**
```
3 MAIN_SCENE*NAME GET
```
Response is the scene's `NAME` property prefixed with the echoed cmd_id, e.g. `3 Translation_BB`. The cmd_id is stripped during parsing; an empty/`ERROR` value means no scene is loaded. The query uses a positive cmd_id (`3`) because Viz only returns a response when a non-`-1` ID is sent.

**Animation Control (Director IN/OUT):**
```
-1 RENDERER*MAIN_LAYER*STAGE*DIRECTOR*Default CONTINUE
```

**DataPool SET (single or batched):**
```
0 MAIN_SCENE*FUNCTION*DataPool*Data SET var1=val1;var2=val2;
```

All DataPool writes are batched into a single TCP write using semicolon-delimited `key=value` pairs.

### DataPool Variables

| Variable | Purpose |
|---|---|
| `TXT1` – `TXT15` | Text content for each slot |
| `READY1` – `READY15` | Slot visibility flag (`"0"` = hidden, `"1"` = visible) |
| `ScrollY` | Vertical scroll position (float, updated ~33x/sec during animation) |
| `SHOW_WAIT` | Controls wait indicator (`"0"` = scrolling, `"1"` = paused) |
| `DO_RESET` | Triggers scene reset logic (`"1"`) |

## Text Slot System

The engine manages 15 text slots (`TXT1` through `TXT15`) in a circular buffer:

1. `vizSendText(text)` writes to `TXT{currentIdx}` and sets `READY{currentIdx} = 1`
2. `currentIdx` advances from 1 to 15, then wraps back to 1
3. Text is sanitized: newlines → spaces, semicolons → spaces, commas → single low-9 quotation marks (to avoid breaking the DataPool SET syntax)
4. Both the text and ready flag are sent as a single batched DataPool command

## Scroll Engine

The scroll animation drives a `ScrollY` DataPool variable at ~30 ms intervals:

1. `vizToggleScroll(true)` sets `SHOW_WAIT = 0` and starts the scroll loop
2. Each tick: `yPos += scrollSpeed * (elapsed / 30)` (frame-rate independent)
3. Speed is configurable at runtime via `vizSetSpeed(0.1–1.0)`
4. `vizToggleScroll(false)` sets `SHOW_WAIT = 1` and stops the loop
5. Keyboard shortcut: `Ctrl+Space` toggles scroll from the renderer

## Hard Reset

`vizHardReset()` performs a full state reset in a single TCP write:

1. Stops scroll animation and clears the scroll interval
2. Resets `yPos = 0`, `currentIdx = 1`, `hasData = false`
3. Sends a batched DataPool command that:
   - Sets `ScrollY = 0` and `DO_RESET = 1`
   - Clears all 15 text slots (`TXT{n} = " "`) and hides them (`READY{n} = 0`)
4. Clears history log and pushes status to renderer

The reset is guarded by a `ConfirmDialog` in the UI to prevent accidental triggering.

## Auto-Send Flow

Translations are automatically forwarded to Viz when they reach `sent` status:

```
TranslationEntry (confirmed) → drainConfirmedQueue() → sentEntries signal
    ↓
App.tsx createEffect watches sentEntries
    ↓
For each new entry: vizSendText(entry.text) via IPC
```

This runs in a `createEffect` in `App.tsx` that tracks the `sentEntries` array length and sends only newly added entries.

## Auto-Pause

The Viz scroll can automatically pause in two scenarios, each independently configurable in Settings:

### Idle Pause (`auto_pause_on_idle`)

When enabled, if no new text arrives for `auto_pause_on_idle_seconds` (default 10 s), the scroll loop stops and `SHOW_WAIT = 1` is sent. The timeout resets each time `vizSendText()` is called. When new text arrives, scroll resumes automatically.

### Edit Pause (`auto_pause_on_edit`)

When enabled, clicking into a pending translation entry to edit it immediately pauses the scroll. The renderer calls `vizEditPause()` via IPC, which stops the scroll loop and sends `SHOW_WAIT = 1`. Scroll resumes when the next text is sent to Viz.

Both pause types set `autoPaused = true` in the status, and the VizPane shows a yellow "Paused" indicator.

## Status Reporting

The `viz:status` push event sends a `VizStatus` snapshot to the renderer after every state change:

```typescript
interface VizStatus {
  connection: VizConnection;       // Command socket lifecycle state
  isAnimating: boolean;            // Scroll loop active
  isLoaded: boolean;               // Local flag: scene was loaded this session
  loadedSceneName: string | null;  // Authoritative scene name reported by the engine
  hasData: boolean;                // At least one text slot has been written
  autoPaused: boolean;             // Scroll auto-paused (idle or edit)
  currentIdx: number;              // Next slot index (1–15)
  yPos: number;                    // Current scroll position
  scrollSpeed: number;             // Active scroll speed
  history: VizLogEntry[];          // Recent action/event log (max 30 entries)
}
```

The VizPane subscribes to this on mount and also polls `viz:get-status` once for the initial state.

### Scene Detection (`loadedSceneName`)

`isLoaded` is a local session flag — it only tells you whether *this* renderer has loaded a scene. `loadedSceneName` is the ground-truth scene name reported by the engine itself, used to detect external loads, mismatched scenes, or "nothing loaded" states.

It is reconciled in four places:

1. **On every successful command-socket (re)connect**, the main process sends `3 MAIN_SCENE*NAME GET` and parses the response (e.g. `3 Translation_BB` → `Translation_BB`).
2. **On a periodic poll while the cmd socket is connected** (`VIZ_SCENE_POLL_INTERVAL_MS`, currently 5 s) — picks up scene swaps made directly in the Viz Engine UI without requiring a reconnect. The poll starts in the cmd-socket `connect` handler and stops on `close`/`error` and in `vizCleanup()`.
3. **When the main window regains focus**, an immediate reconcile fires (gated on `connection === "connected"`) so external swaps surface promptly when the user alt-tabs back into the app instead of waiting up to one poll interval.
4. **After a successful `vizLoadScene()`**, it is set to the leaf segment of `vizConfig.scene_path` (since we just told the engine to load it). The next poll tick verifies the engine actually loaded that scene.

Note: `vizHardReset()` does **not** clear `loadedSceneName` — a hard reset only zeros the DataPool slots; the scene itself remains loaded on the engine.

The VizPane uses this field to render warnings, comparing against the leaf segment of `viz.scene_path`:

| State | UI |
|---|---|
| Not connected | (no chip — state unknown) |
| Loaded scene matches leaf of `viz.scene_path` | Neutral chip with scene name |
| Loaded scene differs from leaf of `viz.scene_path` | Yellow "Wrong scene: …" warning |
| No scene loaded on engine | Red "No scene loaded" warning |
| Loaded but no `viz.scene_path` configured | Neutral chip (cannot compare) |

## Configuration

Viz Engine settings are stored in the `viz` section of `AppConfig`:

| Field | Default | Description |
|---|---|---|
| `host` | `127.0.0.1` | Viz Engine hostname or IP |
| `port` | `6100` | Viz Engine TCP port |
| `scene_path` | (empty) | Scene object path (e.g. `EXPRESS_24_7/TRANSLATION_BB/Translation_BB`) |
| `scroll_speed` | `0.3` | Default scroll velocity per frame (0.1–1.0) |
| `auto_pause_on_idle` | `true` | Pause scroll when no new text arrives |
| `auto_pause_on_idle_seconds` | `10` | Seconds of inactivity before idle pause triggers |
| `auto_pause_on_edit` | `true` | Pause scroll when editing a translation entry |

These are editable in the **Viz Engine** tab of the Settings modal. Config changes update the in-memory state via `vizUpdateConfig()` without requiring a restart.
