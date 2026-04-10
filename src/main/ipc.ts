import { ipcMain, systemPreferences, shell } from "electron";
import { type AppConfig, saveConfigFields, loadConfig } from "./config";
import { getApiKey, saveApiKey, hasApiKey } from "./store";
import { startSession, stopSession, logTranslation } from "./session";
import { startMetricsCollection, stopMetricsCollection } from "./metrics";
import { getMainWindow } from "./window";

/**
 * Registers all IPC handlers for renderer-to-main communication.
 * @param getConfig - Returns the current live config
 * @param setConfig - Updates the in-memory config after save
 * @param configWarnings - Validation warnings from initial config load
 */
export function registerIpcHandlers(
  getConfig: () => AppConfig,
  setConfig: (config: AppConfig) => void,
  configWarnings: string[] = [],
): void {
  ipcMain.handle("get-api-key", () => getApiKey());

  ipcMain.handle("save-api-key", (_event, key: unknown) => {
    if (typeof key !== "string") return;
    saveApiKey(key);
  });

  ipcMain.handle("has-api-key", () => hasApiKey());
  ipcMain.handle("get-config", () => ({
    config: getConfig(),
    warnings: configWarnings,
  }));

  ipcMain.handle(
    "save-config",
    (_event, fields: unknown): { config: AppConfig; warnings: string[] } => {
      if (!fields || typeof fields !== "object") throw new Error("Invalid config fields");
      const f = fields as Record<string, unknown>;
      const updates: Partial<{ model: string; feed_delay_seconds: number }> = {};
      if (typeof f.model === "string") updates.model = f.model;
      if (typeof f.feed_delay_seconds === "number")
        updates.feed_delay_seconds = f.feed_delay_seconds;
      saveConfigFields(updates);
      const result = loadConfig();
      setConfig(result.config);
      return { config: result.config, warnings: result.warnings };
    },
  );

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
