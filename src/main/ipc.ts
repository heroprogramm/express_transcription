import { clipboard, ipcMain, systemPreferences, shell } from "electron";
import { type AppConfig, saveConfigFields } from "./config";
import { getApiKey, saveApiKey, hasApiKey } from "./store";
import { startSession, stopSession, logTranslation } from "./session";
import { startMetricsCollection, stopMetricsCollection } from "./metrics";
import { getMainWindow } from "./window";
import {
  vizLoadScene,
  vizContinue,
  vizSendText,
  vizToggleScroll,
  vizSetSpeed,
  vizHardReset,
  getVizStatus,
} from "./viz-engine";

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
      const updates: Partial<{
        model: string;
        endpoint_detection: boolean;
        feed_delay_seconds: number;
        viz_host: string;
        viz_port: number;
        viz_scene_path: string;
        viz_scroll_speed: number;
      }> = {};
      if (typeof f.model === "string") updates.model = f.model;
      if (typeof f.endpoint_detection === "boolean")
        updates.endpoint_detection = f.endpoint_detection;
      if (typeof f.feed_delay_seconds === "number")
        updates.feed_delay_seconds = f.feed_delay_seconds;
      if (typeof f.viz_host === "string") updates.viz_host = f.viz_host;
      if (typeof f.viz_port === "number") updates.viz_port = f.viz_port;
      if (typeof f.viz_scene_path === "string") updates.viz_scene_path = f.viz_scene_path;
      if (typeof f.viz_scroll_speed === "number") updates.viz_scroll_speed = f.viz_scroll_speed;
      const result = saveConfigFields(updates);
      setConfig(result.config);
      return result;
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
    if (typeof timestamp !== "string" || typeof text !== "string") {
      throw new Error("log-translation: timestamp and text must be strings");
    }
    if (timestamp.length > 20 || text.length > 10_000) {
      throw new Error("log-translation: timestamp max 20 chars, text max 10000 chars");
    }
    logTranslation(timestamp, text);
  });

  ipcMain.handle("log-translations-batch", (_event, batch: unknown) => {
    if (!Array.isArray(batch)) {
      throw new Error("log-translations-batch: batch must be an array");
    }
    const valid: { ts: string; text: string }[] = [];
    for (const item of batch) {
      if (typeof item?.ts !== "string" || typeof item?.text !== "string") continue;
      if (item.ts.length > 20 || item.text.length > 10_000) continue;
      valid.push({ ts: item.ts, text: item.text });
    }
    if (valid.length === 0 && batch.length > 0) {
      throw new Error("log-translations-batch: all items failed validation");
    }
    for (const item of valid) {
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

  ipcMain.handle("clipboard:write", (_event, text: unknown) => {
    if (typeof text !== "string") return;
    clipboard.writeText(text);
  });

  // ── Viz Engine ──
  ipcMain.handle("viz:load-scene", () => vizLoadScene());
  ipcMain.handle("viz:continue", () => vizContinue());

  ipcMain.handle("viz:send-text", (_event, text: unknown) => {
    if (typeof text !== "string") throw new Error("viz:send-text: text must be a string");
    if (text.length > 10_000) throw new Error("viz:send-text: text max 10000 chars");
    return vizSendText(text);
  });

  ipcMain.handle("viz:toggle-scroll", (_event, start: unknown) => {
    if (typeof start !== "boolean") throw new Error("viz:toggle-scroll: start must be a boolean");
    return vizToggleScroll(start);
  });

  ipcMain.handle("viz:set-speed", (_event, speed: unknown) => {
    if (typeof speed !== "number") throw new Error("viz:set-speed: speed must be a number");
    vizSetSpeed(speed);
  });

  ipcMain.handle("viz:hard-reset", () => vizHardReset());
  ipcMain.handle("viz:get-status", () => getVizStatus());
}
