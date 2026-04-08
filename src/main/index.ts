import { app, session } from "electron";
import { loadConfig, DEFAULT_CONFIG, type AppConfig } from "./config";
import { createWindow, getMainWindow } from "./window";
import { registerIpcHandlers } from "./ipc";
import { log } from "./logger";

// ── Single instance lock ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ── Process error handlers ──
process.on("uncaughtException", (err) => {
  log("error", "uncaughtException", { message: err.message, stack: err.stack });
});
process.on("unhandledRejection", (reason) => {
  log("error", "unhandledRejection", {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// ── App state ──
let appConfig: AppConfig = DEFAULT_CONFIG;

registerIpcHandlers(() => appConfig);

// ── App lifecycle ──
app.whenReady().then(async () => {
  appConfig = await loadConfig();

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  createWindow();
});

app.on("window-all-closed", () => app.quit());

app.on("second-instance", () => {
  const win = getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("render-process-gone", (_event, _webContents, details) => {
  log("error", "render-process-gone", {
    reason: details.reason,
    exitCode: details.exitCode,
  });
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
  createWindow();
});
