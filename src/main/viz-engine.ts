import net from "net";
import type { BrowserWindow } from "electron";
import type { AppConfig, VizConnection, VizLogEntry, VizStatus } from "@shared/types";
import { secondsToMs } from "@shared/utils";
import {
  VIZ_SCROLL_INTERVAL_MS,
  VIZ_CMD_TIMEOUT_MS,
  VIZ_CONNECT_TIMEOUT_MS,
  VIZ_RECONNECT_DELAY_MS,
} from "@shared/timings";
import { log, LogLevel } from "./logger";

// ── Module state ──

let vizConfig: AppConfig["viz"] | null = null;
let win: BrowserWindow | null = null;

let cmdSocket: net.Socket | null = null;
let cmdConnecting = false;
let cmdReconnectTimer: ReturnType<typeof setTimeout> | null = null;

let scrollSocket: net.Socket | null = null;
let scrollInterval: ReturnType<typeof setInterval> | null = null;
let lastTickTime = 0;

let currentIdx = 1;
let yPos = 0.0;
let scrollSpeed = 0.3;
let isAnimating = false;
let isLoaded = false;
let loadedSceneName: string | null = null;
let hasData = false;
let connection: VizConnection = "idle";
let reconnectFailures = 0;
const RECONNECT_FAIL_THRESHOLD = 3;
let autoPaused = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idlePauseMs = 10_000;

const MAX_HISTORY = 30;
const SLOT_COUNT = 15;

// Viz command-protocol cmd_id: any non-negative integer requests a response
// (the engine echoes it back for correlation); -1 signals fire-and-forget.
const CMD_ID_SCENE_QUERY = 1;

let history: VizLogEntry[] = [];

// ── Helpers ──

function timeStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function addLog(msg: string, type: VizLogEntry["type"] = "info"): void {
  history.push({ time: timeStr(), msg, type });
  if (history.length > MAX_HISTORY) history.shift();
}

function pushStatus(): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("viz:status", getVizStatus());
}

// ── Persistent command socket ──

function ensureCmdSocket(): Promise<net.Socket> {
  if (cmdSocket && !cmdSocket.destroyed) return Promise.resolve(cmdSocket);
  if (cmdConnecting) {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (cmdSocket && !cmdSocket.destroyed) {
          clearInterval(check);
          resolve(cmdSocket);
        } else if (!cmdConnecting) {
          clearInterval(check);
          reject(new Error("Connection failed"));
        }
      }, 20);
    });
  }
  return connectCmdSocket();
}

function connectCmdSocket(): Promise<net.Socket> {
  if (!vizConfig) return Promise.reject(new Error("No viz config"));
  cmdConnecting = true;

  const wasConnected = connection === "reconnecting" || connection === "connected";
  connection = wasConnected ? "reconnecting" : "connecting";
  pushStatus();

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setKeepAlive(true);
    socket.setTimeout(VIZ_CONNECT_TIMEOUT_MS, () => {
      socket.destroy(new Error("Connection timed out"));
    });

    socket.connect(vizConfig!.port, vizConfig!.host, () => {
      socket.setTimeout(0);
      cmdSocket = socket;
      cmdConnecting = false;
      reconnectFailures = 0;
      connection = "connected";
      log(LogLevel.Info, "viz:cmd-connected");
      pushStatus();
      resolve(socket);
      reconcileLoadedScene().catch(() => {});
    });

    socket.on("error", (err: Error) => {
      log(LogLevel.Warn, "viz:cmd-error", { message: err.message });
      cmdConnecting = false;
      cmdSocket = null;
      reconnectFailures++;
      if (reconnectFailures >= RECONNECT_FAIL_THRESHOLD || connection === "connecting") {
        connection = "failed";
        pushStatus();
      }
      scheduleCmdReconnect();
      reject(err);
    });

    socket.on("close", () => {
      cmdConnecting = false;
      cmdSocket = null;
      if (connection === "connected") {
        connection = "reconnecting";
        pushStatus();
      }
      scheduleCmdReconnect();
    });
  });
}

function scheduleCmdReconnect(): void {
  if (cmdReconnectTimer) return;
  cmdReconnectTimer = setTimeout(() => {
    cmdReconnectTimer = null;
    if (!cmdSocket && vizConfig) {
      connection = "reconnecting";
      pushStatus();
      connectCmdSocket().catch(() => {});
    }
  }, VIZ_RECONNECT_DELAY_MS);
}

// ── TCP communication (uses persistent socket) ──

function vizTalk(cmd: string): Promise<string> {
  const terminated = cmd.endsWith("\0") ? cmd : `${cmd}\0`;

  return ensureCmdSocket().then(
    (socket) =>
      new Promise((resolve, reject) => {
        let buf = Buffer.alloc(0);
        let done = false;

        const onData = (chunk: Buffer) => {
          if (done) return;
          buf = Buffer.concat([buf, chunk]);
          if (buf.length === 0 || buf[buf.length - 1] !== 0) return;
          done = true;
          socket.removeListener("data", onData);
          socket.removeListener("close", onClose);
          let end = buf.length;
          while (end > 0 && buf[end - 1] === 0) end--;
          resolve(buf.subarray(0, end).toString("utf-8"));
        };

        const onClose = () => {
          if (done) return;
          done = true;
          socket.removeListener("data", onData);
          reject(new Error("Viz Engine connection closed before response"));
        };

        socket.on("data", onData);
        socket.once("close", onClose);
        socket.write(Buffer.from(terminated, "utf-8"));

        setTimeout(() => {
          if (done) return;
          done = true;
          socket.removeListener("data", onData);
          socket.removeListener("close", onClose);
          reject(new Error("Viz Engine command timed out"));
        }, VIZ_CMD_TIMEOUT_MS);
      }),
    () => {
      throw new Error("Viz Engine not connected");
    },
  );
}

/** Send a fire-and-forget command — no waiting for response. */
function vizSend(cmd: string): void {
  const terminated = cmd.endsWith("\0") ? cmd : `${cmd}\0`;
  ensureCmdSocket()
    .then((socket) => socket.write(Buffer.from(terminated, "utf-8")))
    .catch(() => {});
}

/** Build a batched DataPool SET command for multiple variables. */
function batchDataPool(pairs: Array<[string, string]>): string {
  const sets = pairs.map(([v, val]) => `${v}=${val}`).join(";");
  return `0 MAIN_SCENE*FUNCTION*DataPool*Data SET ${sets};`;
}

// ── Scene detection ──

/** Extract scene name from a Viz `MAIN_SCENE*NAME GET` response, e.g. "3 Translation_BB" → "Translation_BB". */
function parseSceneResponse(resp: string): string | null {
  const trimmed = resp.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^-?\d+\s+([\s\S]*)$/);
  const value = (m ? m[1] : trimmed).trim();
  if (!value || value.toUpperCase().startsWith("ERROR")) return null;
  return value;
}

/** Last segment of a slash-delimited Viz scene path. */
function sceneLeaf(path: string): string | null {
  const last = path.split("/").pop();
  return last && last.length > 0 ? last : null;
}

/** Query Viz for the loaded scene name and update local state if changed. */
async function reconcileLoadedScene(): Promise<void> {
  try {
    const resp = await vizTalk(`${CMD_ID_SCENE_QUERY} MAIN_SCENE*NAME GET`);
    const name = parseSceneResponse(resp);
    if (name !== loadedSceneName) {
      loadedSceneName = name;
      addLog(
        name ? `LOAD: Detected scene "${name}" on engine.` : "LOAD: No scene currently loaded.",
        "info",
      );
      pushStatus();
    }
  } catch (err) {
    log(LogLevel.Warn, "viz:scene-query-failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Scroll engine ──

function connectScrollSocket(): Promise<void> {
  if (!vizConfig) return Promise.reject(new Error("No viz config"));

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setKeepAlive(true);
    socket.setTimeout(VIZ_CONNECT_TIMEOUT_MS, () => {
      socket.destroy(new Error("Connection timed out"));
    });

    socket.connect(vizConfig!.port, vizConfig!.host, () => {
      socket.setTimeout(0);
      scrollSocket = socket;
      log(LogLevel.Info, "viz:scroll-connected");
      resolve();
    });

    socket.on("error", (err: Error) => {
      log(LogLevel.Warn, "viz:scroll-error", { message: err.message });
      scrollSocket = null;
      if (isAnimating) scheduleScrollReconnect();
      reject(err);
    });

    socket.on("close", () => {
      scrollSocket = null;
      if (isAnimating) scheduleScrollReconnect();
    });
  });
}

function scheduleScrollReconnect(): void {
  setTimeout(() => {
    if (!isAnimating) return;
    connectScrollSocket()
      .then(() => startScrollLoop())
      .catch(() => {});
  }, VIZ_RECONNECT_DELAY_MS);
}

function startScrollLoop(): void {
  if (scrollInterval) return;
  lastTickTime = performance.now();

  scrollInterval = setInterval(() => {
    if (!isAnimating || !scrollSocket || scrollSocket.destroyed) return;

    const now = performance.now();
    const elapsed = now - lastTickTime;
    lastTickTime = now;

    yPos += scrollSpeed * (elapsed / VIZ_SCROLL_INTERVAL_MS);
    const cmd = `0 MAIN_SCENE*FUNCTION*DataPool*Data SET ScrollY=${yPos.toFixed(2)};\0`;
    scrollSocket.write(Buffer.from(cmd, "utf-8"));
  }, VIZ_SCROLL_INTERVAL_MS);
}

function stopScrollLoop(): void {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
}

// ── Reset logic ──

function resetLogic(): void {
  isAnimating = false;
  autoPaused = false;
  yPos = 0.0;
  currentIdx = 1;
  hasData = false;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  stopScrollLoop();

  // Batch all reset commands into a single TCP write
  const pairs: Array<[string, string]> = [
    ["ScrollY", "0"],
    ["DO_RESET", "1"],
  ];
  for (let i = 1; i <= SLOT_COUNT; i++) {
    pairs.push([`TXT${i}`, " "], [`READY${i}`, "0"]);
  }
  vizSend(batchDataPool(pairs));
}

// ── Public API ──

/** Store config and BrowserWindow reference. No auto-connect. */
export function vizInit(config: AppConfig["viz"], browserWindow: BrowserWindow): void {
  vizConfig = config;
  win = browserWindow;
  scrollSpeed = config.scroll_speed;
  idlePauseMs = secondsToMs(config.auto_pause_on_idle_seconds);
}

/** Update config at runtime (e.g. after settings save). */
export function vizUpdateConfig(config: AppConfig["viz"]): void {
  vizConfig = config;
  scrollSpeed = config.scroll_speed;
  idlePauseMs = secondsToMs(config.auto_pause_on_idle_seconds);
}

/** Clean up all sockets and intervals on app quit. */
export function vizCleanup(): void {
  stopScrollLoop();
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (cmdReconnectTimer) {
    clearTimeout(cmdReconnectTimer);
    cmdReconnectTimer = null;
  }
  if (cmdSocket) {
    cmdSocket.destroy();
    cmdSocket = null;
  }
  if (scrollSocket) {
    scrollSocket.destroy();
    scrollSocket = null;
  }
  connection = "idle";
}

/** Load the configured scene into Viz Engine. */
export async function vizLoadScene(): Promise<void> {
  if (!vizConfig) return;
  await vizTalk(`-1 RENDERER*MAIN_LAYER SET_OBJECT SCENE*${vizConfig.scene_path}`);
  resetLogic();
  isLoaded = true;
  loadedSceneName = vizConfig.scene_path ? sceneLeaf(vizConfig.scene_path) : null;
  history = [];
  addLog("LOAD: Scene loaded. Translations will auto-send.", "action");
  pushStatus();
}

/** Toggle Viz Director animation (IN/OUT). */
export async function vizContinue(): Promise<void> {
  await vizTalk("-1 RENDERER*MAIN_LAYER*STAGE*DIRECTOR*Default CONTINUE");
  addLog("ACTION: Animation Toggle (IN/OUT)", "action");
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (!isAnimating || !vizConfig?.auto_pause_on_idle) return;
  idleTimer = setTimeout(() => {
    if (!isAnimating) return;
    autoPaused = true;
    isAnimating = false;
    stopScrollLoop();
    vizSend(batchDataPool([["SHOW_WAIT", "1"]]));
    addLog("SCROLL: Auto-paused (no new text)", "action");
    pushStatus();
  }, idlePauseMs);
}

/** Send a text string to the next available Viz DataPool slot (single TCP write). */
export function vizSendText(text: string): void {
  // Resume scroll if it was auto-paused
  if (autoPaused) {
    autoPaused = false;
    isAnimating = true;
    vizSend(batchDataPool([["SHOW_WAIT", "0"]]));

    if (!scrollSocket || scrollSocket.destroyed) {
      connectScrollSocket()
        .then(() => startScrollLoop())
        .catch(() => {});
    } else {
      startScrollLoop();
    }

    addLog("SCROLL: Resumed (new text)", "action");
  }

  const clean = text.replace(/\n/g, " ").replace(/;/g, " ").replace(/,/g, "\u201A");
  vizSend(
    batchDataPool([
      [`TXT${currentIdx}`, clean],
      [`READY${currentIdx}`, "1"],
    ]),
  );
  addLog(`[Box ${currentIdx}] ${clean}`);

  hasData = true;
  currentIdx = currentIdx === SLOT_COUNT ? 1 : currentIdx + 1;
  resetIdleTimer();
  pushStatus();
}

/** Start or stop the scroll engine. */
export async function vizToggleScroll(start: boolean): Promise<void> {
  if (start) {
    if (!hasData) return;

    try {
      if (!scrollSocket || scrollSocket.destroyed) {
        await connectScrollSocket();
      }
    } catch (err) {
      pushStatus();
      throw err;
    }

    autoPaused = false;
    isAnimating = true;
    vizSend(batchDataPool([["SHOW_WAIT", "0"]]));
    startScrollLoop();
    resetIdleTimer();
    addLog("SCROLL: Started", "action");
  } else {
    autoPaused = false;
    isAnimating = false;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    stopScrollLoop();
    vizSend(batchDataPool([["SHOW_WAIT", "1"]]));
    addLog("SCROLL: Stopped", "action");
  }

  pushStatus();
}

/** Pause scroll due to editing — resumes automatically when new text arrives. */
export function vizEditPause(): void {
  if (!isAnimating || !vizConfig?.auto_pause_on_edit) return;
  autoPaused = true;
  isAnimating = false;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  stopScrollLoop();
  vizSend(batchDataPool([["SHOW_WAIT", "1"]]));
  addLog("SCROLL: Paused (editing)", "action");
  pushStatus();
}

/** Update the scroll speed. */
export function vizSetSpeed(speed: number): void {
  scrollSpeed = Math.max(0.1, Math.min(1.0, speed));
}

/** Hard reset: stop scroll, clear all slots, reset position. */
export function vizHardReset(): void {
  resetLogic();
  isLoaded = false;
  history = [];
  addLog("SYSTEM: Reset. Text cleared.", "action");
  pushStatus();
}

/** Return the current Viz Engine state snapshot. */
export function getVizStatus(): VizStatus {
  return {
    connection,
    isAnimating,
    isLoaded,
    loadedSceneName,
    hasData,
    autoPaused,
    currentIdx,
    yPos,
    scrollSpeed,
    history,
  };
}
