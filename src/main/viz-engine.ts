import net from "net";
import type { BrowserWindow } from "electron";
import {
  type AppConfig,
  type VizLogEntry,
  type VizStatus,
  type VizTestResult,
  VizConnection,
} from "@shared/types";
import { secondsToMs } from "@shared/utils";
import {
  VIZ_SCROLL_INTERVAL_MS,
  VIZ_CMD_TIMEOUT_MS,
  VIZ_CONNECT_TIMEOUT_MS,
  VIZ_RECONNECT_DELAY_MS,
  VIZ_SCENE_POLL_INTERVAL_MS,
} from "@shared/timings";
import { log, LogLevel } from "./logger";

// ── Module state ──

let vizConfig: AppConfig["viz"] | null = null;
let win: BrowserWindow | null = null;

let cmdSocket: net.Socket | null = null;
let cmdConnecting = false;
let cmdReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let scenePollTimer: ReturnType<typeof setInterval> | null = null;
let focusHandler: (() => void) | null = null;

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
let connection: VizConnection = VizConnection.Idle;
let reconnectFailures = 0;
const RECONNECT_FAIL_THRESHOLD = 3;
let autoPaused = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idlePauseMs = 10_000;
let isEditing = false;

// ── AUTO / MANUAL mode ──
let autoScrollMode = true;

const MAX_HISTORY = 30;
const SLOT_COUNT = 30;
const CMD_ID_SCENE_QUERY = 1;

// ── Auto adjustment state ──
let lastTextTime = 0;
let avgTextIntervalMs = 2000;
let manualSpeedOverride = false;
let reviewTimeMs = 0;
let autoDelayMs = 1000;

// From Viz Artist measurements
const BOX_SPACING_UNITS = 24.555;
const FRAMES_PER_SECOND = 1000 / VIZ_SCROLL_INTERVAL_MS; // 50fps
const SAFETY_FACTOR = 0.8;

// ── Send queue ──
let sendQueue: string[] = [];
let isSending = false;

let history: VizLogEntry[] = [];

// ── Helpers ──

function timeStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "00")}`;
}

function addLog(msg: string, type: VizLogEntry["type"] = "info"): void {
  history.push({ time: timeStr(), msg, type });
  if (history.length > MAX_HISTORY) history.shift();
}

function pushStatus(): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("viz:status", getVizStatus());
}

function getDelayMs(): number {
  if (autoScrollMode) {
    return autoDelayMs;
  }
  return vizConfig?.send_delay_ms ?? 1000;
}

function autoAdjustSpeed(): void {
  if (!autoScrollMode) return;
  if (manualSpeedOverride) return;

  const now = Date.now();

  if (lastTextTime > 0) {
    const interval = now - lastTextTime;
    const realInterval = Math.max(100, interval - reviewTimeMs);

    if (realInterval >= 100 && realInterval <= 10000) {
      if (realInterval < avgTextIntervalMs) {
        avgTextIntervalMs = avgTextIntervalMs * 0.5 + realInterval * 0.5;
      } else {
        avgTextIntervalMs = avgTextIntervalMs * 0.8 + realInterval * 0.2;
      }

      // ── Auto adjust scroll speed ──
      const idealUnitsPerSecond =
        (BOX_SPACING_UNITS / (avgTextIntervalMs / 1000)) * SAFETY_FACTOR;
      const idealSpeed = idealUnitsPerSecond / FRAMES_PER_SECOND;
      const newSpeed = Math.min(1.0, Math.max(0.1, idealSpeed));

      if (Math.abs(newSpeed - scrollSpeed) > 0.02) {
        scrollSpeed = newSpeed;
        addLog(
          `Auto: speed=${scrollSpeed.toFixed(2)} interval=${Math.round(avgTextIntervalMs)}ms review=${Math.round(reviewTimeMs)}ms`,
          "info",
        );
        pushStatus();
      }

      // ── Auto adjust send delay ──
      const newDelay = Math.round(avgTextIntervalMs * 0.5);
      const clampedDelay = Math.min(3000, Math.max(300, newDelay));
      if (Math.abs(clampedDelay - autoDelayMs) > 50) {
        autoDelayMs = clampedDelay;
        addLog(`Auto: delay=${clampedDelay}ms`, "info");
        pushStatus();
      }

      // ── Auto adjust idle timeout ──
      const autoIdleMs = Math.round(avgTextIntervalMs * 2);
      const clampedIdle = Math.min(10000, Math.max(2000, autoIdleMs));
      if (Math.abs(clampedIdle - idlePauseMs) > 500) {
        idlePauseMs = clampedIdle;
        addLog(`Auto: idle=${Math.round(clampedIdle / 1000)}s`, "info");
      }
    }
  }

  lastTextTime = now;
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

  const wasConnected =
    connection === VizConnection.Reconnecting || connection === VizConnection.Connected;
  connection = wasConnected ? VizConnection.Reconnecting : VizConnection.Connecting;
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
      connection = VizConnection.Connected;
      log(LogLevel.Info, "viz:cmd-connected");
      pushStatus();
      resolve(socket);
      reconcileLoadedScene().catch(() => {});
      startScenePolling();
    });

    socket.on("error", (err: Error) => {
      log(LogLevel.Warn, "viz:cmd-error", { message: err.message });
      cmdConnecting = false;
      cmdSocket = null;
      reconnectFailures++;
      if (
        reconnectFailures >= RECONNECT_FAIL_THRESHOLD ||
        connection === VizConnection.Connecting
      ) {
        connection = VizConnection.Failed;
        pushStatus();
      }
      stopScenePolling();
      scheduleCmdReconnect();
      reject(err);
    });

    socket.on("close", () => {
      cmdConnecting = false;
      cmdSocket = null;
      if (connection === VizConnection.Connected) {
        connection = VizConnection.Reconnecting;
        pushStatus();
      }
      stopScenePolling();
      scheduleCmdReconnect();
    });
  });
}

function scheduleCmdReconnect(): void {
  if (cmdReconnectTimer) return;
  cmdReconnectTimer = setTimeout(() => {
    cmdReconnectTimer = null;
    if (!cmdSocket && vizConfig) {
      connection = VizConnection.Reconnecting;
      pushStatus();
      connectCmdSocket().catch(() => {});
    }
  }, VIZ_RECONNECT_DELAY_MS);
}

// ── TCP communication ──

function vizTalk(cmd: string): Promise<string> {
  const terminated = cmd.endsWith("\0") ? cmd : `${cmd}\0`;

  return ensureCmdSocket().then(
    (socket) =>
      new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let done = false;

        const onData = (chunk: Buffer) => {
          if (done) return;
          chunks.push(chunk);
          if (chunk.length === 0 || chunk[chunk.length - 1] !== 0) return;
          done = true;
          socket.removeListener("data", onData);
          socket.removeListener("close", onClose);
          const buf = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
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

function vizSend(cmd: string): void {
  const terminated = cmd.endsWith("\0") ? cmd : `${cmd}\0`;
  ensureCmdSocket()
    .then((socket) => socket.write(Buffer.from(terminated, "utf-8")))
    .catch(() => {});
}

function batchDataPool(pairs: Array<[string, string]>): string {
  const sets = pairs.map(([v, val]) => `${v}=${val}`).join(";");
  return `0 MAIN_SCENE*FUNCTION*DataPool*Data SET ${sets};`;
}

// ── Scene detection ──

function parseSceneResponse(resp: string): string | null {
  const trimmed = resp.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^-?\d+\s+([\s\S]*)$/);
  const value = (m ? m[1] : trimmed).trim();
  if (!value || value.toUpperCase().startsWith("ERROR")) return null;
  return value;
}

function sceneLeaf(path: string): string | null {
  const last = path.split("/").pop();
  return last && last.length > 0 ? last : null;
}

function startScenePolling(): void {
  if (scenePollTimer) return;
  scenePollTimer = setInterval(() => {
    reconcileLoadedScene().catch(() => {});
  }, VIZ_SCENE_POLL_INTERVAL_MS);
}

function stopScenePolling(): void {
  if (scenePollTimer) {
    clearInterval(scenePollTimer);
    scenePollTimer = null;
  }
}

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

const SCROLL_CMD_PREFIX = Buffer.from("0 MAIN_SCENE*FUNCTION*DataPool*Data SET ScrollY=", "utf-8");
const SCROLL_CMD_SUFFIX = Buffer.from(";\0", "utf-8");

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

function writeScrollPosition(socket: net.Socket): void {
  socket.cork();
  socket.write(SCROLL_CMD_PREFIX);
  socket.write(yPos.toFixed(2), "utf-8");
  socket.write(SCROLL_CMD_SUFFIX);
  socket.uncork();
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
    writeScrollPosition(scrollSocket);
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
  sendQueue = [];
  isSending = false;
  isEditing = false;
  lastTextTime = 0;
  avgTextIntervalMs = 2000;
  manualSpeedOverride = false;
  autoDelayMs = 1000;
  // ── Auto stop disabled — idle timer commented out ──
  // if (idleTimer) {
  //   clearTimeout(idleTimer);
  //   idleTimer = null;
  // }
  stopScrollLoop();

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

export function vizInit(config: AppConfig["viz"], browserWindow: BrowserWindow): void {
  vizConfig = config;
  win = browserWindow;
  scrollSpeed = config.scroll_speed;
  idlePauseMs = secondsToMs(config.auto_pause_on_idle_seconds);

  focusHandler = () => {
    if (connection === VizConnection.Connected) {
      reconcileLoadedScene().catch(() => {});
    }
  };
  browserWindow.on("focus", focusHandler);
  connectCmdSocket().catch(() => {});
}

export function vizUpdateConfig(config: AppConfig["viz"]): void {
  vizConfig = config;
  idlePauseMs = secondsToMs(config.auto_pause_on_idle_seconds);
}

export function vizSetReviewTime(seconds: number): void {
  reviewTimeMs = seconds * 1000;
  addLog(`Review time: ${seconds}s`, "info");
}

export function vizCleanup(): void {
  stopScrollLoop();
  stopScenePolling();
  sendQueue = [];
  isSending = false;
  isEditing = false;
  // ── Auto stop disabled — idle timer commented out ──
  // if (idleTimer) {
  //   clearTimeout(idleTimer);
  //   idleTimer = null;
  // }
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
  if (focusHandler && win) {
    win.removeListener("focus", focusHandler);
    focusHandler = null;
  }
  connection = VizConnection.Idle;
}

export function vizReconnect(): void {
  if (!vizConfig) return;
  if (cmdReconnectTimer) {
    clearTimeout(cmdReconnectTimer);
    cmdReconnectTimer = null;
  }
  if (cmdConnecting) return;
  if (cmdSocket) {
    cmdSocket.destroy();
    cmdSocket = null;
  }
  reconnectFailures = 0;
  connection = VizConnection.Reconnecting;
  pushStatus();
  connectCmdSocket().catch(() => {});
}

export function vizTestConnection(host: string, port: number): Promise<VizTestResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: VizTestResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(VIZ_CONNECT_TIMEOUT_MS, () => {
      finish({ ok: false, error: "Connection timed out" });
    });
    socket.once("connect", () => {
      finish({ ok: true, elapsedMs: Math.round(performance.now() - start) });
    });
    socket.once("error", (err: Error) => {
      finish({ ok: false, error: err.message });
    });

    socket.connect(port, host);
  });
}

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

export async function vizContinue(): Promise<void> {
  await vizTalk("-1 RENDERER*MAIN_LAYER*STAGE*DIRECTOR*Default CONTINUE");
  addLog("ACTION: Animation Toggle (IN/OUT)", "action");
}

// ── Auto stop disabled — resetIdleTimer commented out ──
function resetIdleTimer(): void {
  // if (idleTimer) clearTimeout(idleTimer);
  // if (!isAnimating || !vizConfig?.auto_pause_on_idle || !autoScrollMode) return;
  // idleTimer = setTimeout(() => {
  //   if (!isAnimating) return;
  //   autoPaused = true;
  //   isAnimating = false;
  //   stopScrollLoop();
  //   vizSend(batchDataPool([["SHOW_WAIT", "1"]]));
  //   addLog("SCROLL: Stopped — last text on screen", "action");
  //   pushStatus();
  // }, idlePauseMs);
}

export function vizSetEditing(editing: boolean): void {
  isEditing = editing;
  addLog(editing ? "EDIT MODE: ON — text blocked" : "EDIT MODE: OFF — text sending", "info");
}

export function vizSetAutoMode(auto: boolean): void {
  autoScrollMode = auto;

  if (auto) {
    manualSpeedOverride = false;
    lastTextTime = 0;
    avgTextIntervalMs = 2000;
    autoDelayMs = 1000;
    addLog("Mode: AUTO — speed + delay + scroll automatic", "action");
  } else {
    // ── Auto stop disabled — idle timer commented out ──
    // if (idleTimer) {
    //   clearTimeout(idleTimer);
    //   idleTimer = null;
    // }
    addLog("Mode: MANUAL — operator controls everything", "action");
  }

  pushStatus();
}

async function processSendQueue(): Promise<void> {
  if (isSending) return;
  isSending = true;

  while (sendQueue.length > 0) {
    const text = sendQueue.shift()!;
    const clean = text
      .replace(/\n/g, " ")
      .replace(/;/g, " ")
      .replace(/,/g, "\u201A");

    vizSend(
      batchDataPool([
        [`TXT${currentIdx}`, clean],
        [`READY${currentIdx}`, "1"],
      ]),
    );

    addLog(`[Box ${currentIdx}] ${clean}`);
    hasData = true;
    currentIdx = currentIdx === SLOT_COUNT ? 1 : currentIdx + 1;
    pushStatus();

    // Queue pressure boost — only when 3+ texts waiting
    // queue=0-3 → no boost, normal auto speed
    // queue=4   → 40% faster
    // queue=5   → 50% faster
    // queue=10+ → max speed 1.0
    if (sendQueue.length > 3) {
      const boost = 1.0 + (sendQueue.length * 0.1);
      const boostedSpeed = Math.min(1.0, scrollSpeed * boost);
      if (boostedSpeed > scrollSpeed) {
        scrollSpeed = boostedSpeed;
        addLog(`Queue boost x${sendQueue.length}: speed=${scrollSpeed.toFixed(2)}`, "info");
        pushStatus();
      }
    }

    const delayMs = getDelayMs();
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }

  isSending = false;

  // Reset speed back to auto calculated after queue clears
  // Prevents speed staying boosted after queue empties
  if (autoScrollMode && !manualSpeedOverride) {
    const idealUnitsPerSecond =
      (BOX_SPACING_UNITS / (avgTextIntervalMs / 1000)) * SAFETY_FACTOR;
    const resetSpeed = Math.min(0.6, Math.max(0.1, idealUnitsPerSecond / FRAMES_PER_SECOND));
    if (Math.abs(resetSpeed - scrollSpeed) > 0.02) {
      scrollSpeed = resetSpeed;
      addLog(`Queue cleared: speed reset=${scrollSpeed.toFixed(2)}`, "info");
      pushStatus();
    }
  }
  // ── Auto stop disabled — resetIdleTimer commented out ──
  // resetIdleTimer();
}

export function vizSendText(text: string): void {
  if (isEditing) {
    addLog("EDIT MODE — text not sent", "info");
    return;
  }

  autoAdjustSpeed();

  if (autoScrollMode && autoPaused) {
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

  sendQueue.push(text);
  processSendQueue();
}

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
    // ── Auto stop disabled ──
    // resetIdleTimer();
    addLog("SCROLL: Started", "action");
  } else {
    autoPaused = false;
    isAnimating = false;
    // ── Auto stop disabled — idle timer commented out ──
    // if (idleTimer) {
    //   clearTimeout(idleTimer);
    //   idleTimer = null;
    // }
    stopScrollLoop();
    vizSend(batchDataPool([["SHOW_WAIT", "1"]]));
    addLog("SCROLL: Stopped", "action");
  }

  pushStatus();
}

export function vizSetSpeed(speed: number): void {
  const normalized = speed / 10;
  scrollSpeed = Math.max(0.1, Math.min(1.0, normalized));
  manualSpeedOverride = true;
  avgTextIntervalMs = 2000;
  lastTextTime = 0;
  addLog(`Speed manually set: ${Math.round(speed)}`, "info");
}

export function vizHardReset(): void {
  resetLogic();
  isLoaded = false;
  history = [];
  addLog("SYSTEM: Reset. Text cleared.", "action");
  pushStatus();
}

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
    autoScrollMode,
    autoDelayMs,
    history,
  };
}