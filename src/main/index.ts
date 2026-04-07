import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import Store from "electron-store";
import * as fs from "fs";

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

function loadConfig(): AppConfig {
  try {
    const configPath = join(__dirname, "..", "..", "config", "default.toml");
    const raw = fs.readFileSync(configPath, "utf-8");
    const config: Record<string, Record<string, string>> = {};
    let section = "";
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      const sm = trimmed.match(/^\[(\w+)\]$/);
      if (sm) {
        section = sm[1];
        config[section] = {};
        continue;
      }
      const kv = trimmed.match(/^(\w+)\s*=\s*"(.+)"$/);
      if (kv && section) config[section][kv[1]] = kv[2];
    }
    return config as unknown as AppConfig;
  } catch {
    return {
      soniox: { language: "ur", model: "stt-rt-v4", translate_to: "en" },
      output: { feed_file: "feed.txt", session_log_dir: "sessions" },
    };
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
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
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
  store.set(STORE_KEY, key);
});

ipcMain.handle("has-api-key", (): boolean => {
  return !!(process.env.SONIOX_API_KEY || store.get(STORE_KEY));
});

ipcMain.handle("get-config", (): AppConfig => appConfig);

ipcMain.handle("start-session", () => {
  const dataDir = app.getPath("userData");
  const sessionDir = join(dataDir, appConfig.output.session_log_dir);
  fs.mkdirSync(sessionDir, { recursive: true });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const sessionPath = join(sessionDir, `session_${ts}.txt`);
  sessionFile = fs.createWriteStream(sessionPath, { flags: "a" });

  feedPath = join(dataDir, appConfig.output.feed_file);
  console.log(`Session log: ${sessionPath}`);
  console.log(`Feed file: ${feedPath}`);
});

ipcMain.handle("stop-session", () => {
  if (sessionFile) {
    sessionFile.end();
    sessionFile = null;
  }
});

ipcMain.handle("log-translation", (_event, timestamp: string, text: string) => {
  if (sessionFile) sessionFile.write(`[${timestamp}] ${text}\n`);
  if (feedPath) {
    const tmp = `${feedPath}.tmp`;
    fs.writeFileSync(tmp, `[${timestamp}] ${text}\n`);
    fs.renameSync(tmp, feedPath);
  }
});
