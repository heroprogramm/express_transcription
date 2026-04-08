import { ipcMain } from "electron";
import type { AppConfig } from "./config";
import { getApiKey, saveApiKey, hasApiKey } from "./store";
import { startSession, stopSession, logTranslation } from "./session";

export function registerIpcHandlers(getConfig: () => AppConfig): void {
  ipcMain.handle("get-api-key", () => getApiKey());
  ipcMain.handle("save-api-key", (_event, key: string) => saveApiKey(key));
  ipcMain.handle("has-api-key", () => hasApiKey());
  ipcMain.handle("get-config", () => getConfig());

  ipcMain.handle("start-session", () => startSession(getConfig()));
  ipcMain.handle("stop-session", () => stopSession());
  ipcMain.handle("log-translation", (_event, timestamp: string, text: string) =>
    logTranslation(timestamp, text),
  );
}
