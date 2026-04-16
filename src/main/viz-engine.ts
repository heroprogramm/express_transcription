import net from "net";
import type { BrowserWindow } from "electron";
import type { AppConfig, VizLogEntry, VizStatus } from "../shared/types";
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
let hasData = false;
let connected = false;

const MAX_HISTORY = 30;
const SLOT_COUNT = 15;
const SCROLL_INTERVAL_MS = 30;
const CMD_TIMEOUT_MS = 500;

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

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setKeepAlive(true);

    socket.connect(vizConfig!.port, vizConfig!.host, () => {
      cmdSocket = socket;
      cmdConnecting = false;
      connected = true;
      log(LogLevel.Info, "viz:cmd-connected");
      pushStatus();
      resolve(socket);
    });

    socket.on("error", (err: Error) => {
      log(LogLevel.Warn, "viz:cmd-error", { message: err.message });
      cmdConnecting = false;
      cmdSocket = null;
      connected = false;
      pushStatus();
      scheduleCmdReconnect();
      reject(err);
    });

    socket.on("close", () => {
      cmdConnecting = false;
      cmdSocket = null;
      connected = false;
      pushStatus();
      scheduleCmdReconnect();
    });
  });
}

function scheduleCmdReconnect(): void {
  if (cmdReconnectTimer) return;
  cmdReconnectTimer = setTimeout(() => {
    cmdReconnectTimer = null;
    if (!cmdSocket && vizConfig) {
      connectCmdSocket().catch(() => {});
    }
  }, 2000);
}

// ── TCP communication (uses persistent socket) ──

function vizTalk(cmd: string): Promise<string> {
  const terminated = cmd.endsWith("\0") ? cmd : `${cmd}\0`;

  return ensureCmdSocket().then(
    (socket) =>
      new Promise((resolve, reject) => {
        let responded = false;

        const timeout = setTimeout(() => {
          if (!responded) {
            responded = true;
            reject(new Error("Viz Engine command timed out"));
          }
        }, CMD_TIMEOUT_MS);

        const onData = (data: Buffer) => {
          if (!responded) {
            responded = true;
            clearTimeout(timeout);
            socket.removeListener("data", onData);
            resolve(data.toString("utf-8").trim());
          }
        };

        socket.on("data", onData);
        socket.write(Buffer.from(terminated, "utf-8"));
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

// ── Scroll engine ──

function connectScrollSocket(): Promise<void> {
  if (!vizConfig) return Promise.reject(new Error("No viz config"));

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setKeepAlive(true);

    socket.connect(vizConfig!.port, vizConfig!.host, () => {
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
  }, 2000);
}

function startScrollLoop(): void {
  if (scrollInterval) return;
  lastTickTime = performance.now();

  scrollInterval = setInterval(() => {
    if (!isAnimating || !scrollSocket || scrollSocket.destroyed) return;

    const now = performance.now();
    const elapsed = now - lastTickTime;
    lastTickTime = now;

    yPos += scrollSpeed * (elapsed / SCROLL_INTERVAL_MS);
    const cmd = `0 MAIN_SCENE*FUNCTION*DataPool*Data SET ScrollY=${yPos.toFixed(2)};\0`;
    scrollSocket.write(Buffer.from(cmd, "utf-8"));
  }, SCROLL_INTERVAL_MS);
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
  yPos = 0.0;
  currentIdx = 1;
  hasData = false;
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
}

/** Update config at runtime (e.g. after settings save). */
export function vizUpdateConfig(config: AppConfig["viz"]): void {
  vizConfig = config;
  scrollSpeed = config.scroll_speed;
}

/** Clean up all sockets and intervals on app quit. */
export function vizCleanup(): void {
  stopScrollLoop();
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
  connected = false;
}

/** Load the configured scene into Viz Engine. */
export async function vizLoadScene(): Promise<void> {
  if (!vizConfig) return;
  await vizTalk(`-1 RENDERER*MAIN_LAYER SET_OBJECT SCENE*${vizConfig.scene_path}`);
  resetLogic();
  isLoaded = true;
  history = [];
  addLog("LOAD: Scene loaded. Translations will auto-send.", "action");
  pushStatus();
}

/** Toggle Viz Director animation (IN/OUT). */
export async function vizContinue(): Promise<void> {
  await vizTalk("-1 RENDERER*MAIN_LAYER*STAGE*DIRECTOR*Default CONTINUE");
  addLog("ACTION: Animation Toggle (IN/OUT)", "action");
}

/** Send a text string to the next available Viz DataPool slot (single TCP write). */
export function vizSendText(text: string): void {
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

    isAnimating = true;
    vizSend(batchDataPool([["SHOW_WAIT", "0"]]));
    startScrollLoop();
    addLog("SCROLL: Started", "action");
  } else {
    isAnimating = false;
    stopScrollLoop();
    vizSend(batchDataPool([["SHOW_WAIT", "1"]]));
    addLog("SCROLL: Stopped", "action");
  }

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
    connected,
    isAnimating,
    isLoaded,
    hasData,
    currentIdx,
    yPos,
    scrollSpeed,
    history,
  };
}
