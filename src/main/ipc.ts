import { ipcMain, systemPreferences, shell } from "electron";
import type { AppConfig } from "./config";
import { getApiKey, saveApiKey, hasApiKey } from "./store";
import { startSession, stopSession, logTranslation } from "./session";
import { startMetricsCollection, stopMetricsCollection } from "./metrics";
import { getMainWindow } from "./window";

export function registerIpcHandlers(getConfig: () => AppConfig): void {
  ipcMain.handle("get-api-key", () => getApiKey());

  ipcMain.handle("save-api-key", (_event, key: unknown) => {
    if (typeof key !== "string") return;
    saveApiKey(key);
  });

  ipcMain.handle("has-api-key", () => hasApiKey());
  ipcMain.handle("get-config", () => getConfig());

  ipcMain.handle(
    "ensure-mic-access",
    async (): Promise<"granted" | "denied" | "opened-settings"> => {
      if (process.platform === "darwin") {
        const status = systemPreferences.getMediaAccessStatus("microphone");
        if (status === "granted") return "granted";
        if (status === "denied") {
          await shell.openExternal(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
          );
          return "opened-settings";
        }
        const granted = await systemPreferences.askForMediaAccess("microphone");
        return granted ? "granted" : "denied";
      }
      if (process.platform === "win32") {
        const status = systemPreferences.getMediaAccessStatus("microphone");
        if (status === "granted") return "granted";
        await shell.openExternal("ms-settings:privacy-microphone");
        return "opened-settings";
      }
      return "granted";
    },
  );

  ipcMain.handle("start-session", () => startSession(getConfig()));
  ipcMain.handle("stop-session", () => stopSession());

  ipcMain.handle("log-translation", (_event, timestamp: unknown, text: unknown) => {
    if (typeof timestamp !== "string" || typeof text !== "string") return;
    if (timestamp.length > 20 || text.length > 10_000) return;
    logTranslation(timestamp, text);
  });

  ipcMain.handle("log-translations-batch", (_event, batch: unknown) => {
    if (!Array.isArray(batch)) return;
    for (const item of batch) {
      if (typeof item?.ts !== "string" || typeof item?.text !== "string") continue;
      if (item.ts.length > 20 || item.text.length > 10_000) continue;
      logTranslation(item.ts, item.text);
    }
  });

  // ── Performance monitoring ──
  ipcMain.handle("perf:start", () => {
    const win = getMainWindow();
    if (win) startMetricsCollection(win);
  });

  ipcMain.handle("perf:stop", () => {
    stopMetricsCollection();
  });

  ipcMain.handle("perf:ping", () => Date.now());
}
