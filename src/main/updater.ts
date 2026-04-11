import pkg from "electron-updater";
const { autoUpdater } = pkg;
import { is } from "@electron-toolkit/utils";
import { getMainWindow } from "./window";
import { log, LogLevel } from "./logger";

declare const __GH_TOKEN__: string;

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
let isManualCheck = false;

function sendStatus(status: string, version?: string): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("update-status", status, version);
  }
}

/** Initialize auto-updater with background checks. Call once at app startup. */
export function initAutoUpdater(): void {
  if (is.dev) return;

  autoUpdater.setFeedURL({
    provider: "github",
    owner: "hamza-56",
    repo: "express-text",
    private: true,
    token: __GH_TOKEN__,
  });

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    log(LogLevel.Info, "updater:update-available", { version: info.version });
    sendStatus("downloading", info.version);
  });

  autoUpdater.on("update-downloaded", (info) => {
    log(LogLevel.Info, "updater:update-downloaded", { version: info.version });
    sendStatus("ready", info.version);
  });

  autoUpdater.on("update-not-available", () => {
    if (isManualCheck) {
      sendStatus("up-to-date");
      isManualCheck = false;
    }
  });

  autoUpdater.on("error", (err) => {
    log(LogLevel.Error, "updater:error", { message: err.message });
    if (isManualCheck) {
      sendStatus("error", err.message);
      isManualCheck = false;
    }
  });

  autoUpdater.checkForUpdates().catch((err: Error) => {
    log(LogLevel.Error, "updater:initial-check-failed", { message: err.message });
  });

  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      log(LogLevel.Error, "updater:periodic-check-failed", { message: err.message });
    });
  }, CHECK_INTERVAL_MS);
}

/** Trigger a manual update check (sends all statuses including up-to-date). */
export function checkForUpdatesManual(): void {
  isManualCheck = true;
  autoUpdater.checkForUpdates().catch((err: Error) => {
    log(LogLevel.Error, "updater:manual-check-failed", { message: err.message });
    sendStatus("error", err.message);
    isManualCheck = false;
  });
}

/** Quit and install the downloaded update. */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
