import { app, session } from "electron";
import { loadConfig, DEFAULT_CONFIG, type AppConfig } from "./config";
import { createWindow, getMainWindow } from "./window";
import { registerIpcHandlers } from "./ipc";

// ── Single instance lock ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ── Process error handlers ──
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

// ── App state ──
let appConfig: AppConfig = DEFAULT_CONFIG;

registerIpcHandlers(() => appConfig);

// ── App lifecycle ──
app.whenReady().then(async () => {
  appConfig = await loadConfig();

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media";
  });

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
  console.error("[render-process-gone]", details.reason);
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
  createWindow();
});
