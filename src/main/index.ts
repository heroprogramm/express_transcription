import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join, basename } from "path";
import { is } from "@electron-toolkit/utils";
import Store from "electron-store";
import * as fs from "fs";
import * as fsp from "fs/promises";

const store = new Store();
const STORE_KEY = "soniox_api_key";

let mainWindow: BrowserWindow | null = null;
let sessionFile: fs.WriteStream | null = null;
let feedPath = "";

// ── Config ──
interface AppConfig {
  soniox: { language: string; model: string; translate_to: string };
  output: { feed_file: string; session_log_dir: string };
}

const DEFAULT_CONFIG: AppConfig = {
  soniox: { language: "ur", model: "stt-rt-v4", translate_to: "en" },
  output: { feed_file: "feed.txt", session_log_dir: "sessions" },
};

function loadConfig(): AppConfig {
  try {
    const configPath = join(__dirname, "..", "..", "config", "default.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as AppConfig;
    return {
      soniox: { ...DEFAULT_CONFIG.soniox, ...parsed.soniox },
      output: { ...DEFAULT_CONFIG.output, ...parsed.output },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

const appConfig = loadConfig();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Express 24/7 — Live Transcription",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler((details) => {
    const url = details.url;
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

// ── IPC Handlers ──

ipcMain.handle("get-api-key", (): string | null => {
  const envKey = process.env.SONIOX_API_KEY;
  if (envKey) return envKey;
  return (store.get(STORE_KEY) as string) || null;
});

ipcMain.handle("save-api-key", (_event, key: string) => {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    throw new Error("API key cannot be empty");
  }
  if (key.length > 512) {
    throw new Error("API key is too long");
  }
  store.set(STORE_KEY, key.trim());
});

ipcMain.handle("has-api-key", (): boolean => {
  return !!(process.env.SONIOX_API_KEY || store.get(STORE_KEY));
});

ipcMain.handle("get-config", (): AppConfig => appConfig);

ipcMain.handle("start-session", () => {
  const dataDir = app.getPath("userData");
  const safeDirName = basename(appConfig.output.session_log_dir);
  const sessionDir = join(dataDir, safeDirName);
  fs.mkdirSync(sessionDir, { recursive: true });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const sessionPath = join(sessionDir, `session_${ts}.txt`);
  sessionFile = fs.createWriteStream(sessionPath, { flags: "a" });

  const safeFeedName = basename(appConfig.output.feed_file);
  feedPath = join(dataDir, safeFeedName);
  console.log(`Session log: ${sessionPath}`);
  console.log(`Feed file: ${feedPath}`);
});

ipcMain.handle("stop-session", () => {
  if (sessionFile) {
    sessionFile.end();
    sessionFile = null;
  }
});

ipcMain.handle("log-translation", async (_event, timestamp: string, text: string) => {
  if (sessionFile) sessionFile.write(`[${timestamp}] ${text}\n`);
  if (feedPath) {
    const tmp = `${feedPath}.tmp`;
    await fsp.writeFile(tmp, `[${timestamp}] ${text}\n`);
    await fsp.rename(tmp, feedPath);
  }
});
