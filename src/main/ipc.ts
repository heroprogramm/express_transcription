import { clipboard, ipcMain, net, systemPreferences, shell } from "electron";
import { type AppConfig, saveConfigFields } from "./config";
import { getApiKey, saveApiKey, hasApiKey } from "./store";
import { log, LogLevel } from "./logger";
import { startSession, stopSession, logTranslation } from "./session";
import { startMetricsCollection, stopMetricsCollection } from "./metrics";
import { getMainWindow } from "./window";
import {
  vizLoadScene,
  vizContinue,
  vizSendText,
  vizToggleScroll,
  vizEditPause,
  vizSetSpeed,
  vizHardReset,
  vizReconnect,
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

  ipcMain.handle("get-models", async (): Promise<Array<{ id: string; name: string }>> => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("No API key configured");

    const resp = await net.fetch("https://api.soniox.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      log(LogLevel.Warn, "ipc:get-models-failed", { status: resp.status, body: text });
      throw new Error(`Failed to fetch models (${resp.status})`);
    }
    const data = (await resp.json()) as {
      models: Array<{ id: string; name: string; transcription_mode: string }>;
    };
    return data.models
      .filter((m) => m.transcription_mode === "real_time")
      .map((m) => ({ id: m.id, name: m.name }));
  });
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
        review_time_seconds: number;
        viz_host: string;
        viz_port: number;
        viz_scene_path: string;
        viz_scroll_speed: number;
        viz_auto_pause_on_idle: boolean;
        viz_auto_pause_on_idle_seconds: number;
        viz_auto_pause_on_edit: boolean;
      }> = {};
      if (typeof f.model === "string") {
        if (!f.model.trim()) throw new Error("save-config: model cannot be empty");
        updates.model = f.model;
      }
      if (typeof f.endpoint_detection === "boolean")
        updates.endpoint_detection = f.endpoint_detection;
      if (typeof f.review_time_seconds === "number") {
        if (f.review_time_seconds < 0)
          throw new Error("save-config: review_time_seconds must be non-negative");
        updates.review_time_seconds = f.review_time_seconds;
      }
      if (typeof f.viz_host === "string") {
        if (!f.viz_host.trim()) throw new Error("save-config: viz_host cannot be empty");
        updates.viz_host = f.viz_host;
      }
      if (typeof f.viz_port === "number") {
        if (f.viz_port < 1 || f.viz_port > 65535)
          throw new Error("save-config: viz_port must be between 1 and 65535");
        updates.viz_port = f.viz_port;
      }
      if (typeof f.viz_scene_path === "string") updates.viz_scene_path = f.viz_scene_path;
      if (typeof f.viz_scroll_speed === "number") {
        if (f.viz_scroll_speed < 0.1 || f.viz_scroll_speed > 1.0)
          throw new Error("save-config: viz_scroll_speed must be between 0.1 and 1.0");
        updates.viz_scroll_speed = f.viz_scroll_speed;
      }
      if (typeof f.viz_auto_pause_on_idle === "boolean")
        updates.viz_auto_pause_on_idle = f.viz_auto_pause_on_idle;
      if (typeof f.viz_auto_pause_on_idle_seconds === "number") {
        if (f.viz_auto_pause_on_idle_seconds < 1)
          throw new Error("save-config: viz_auto_pause_on_idle_seconds must be at least 1");
        updates.viz_auto_pause_on_idle_seconds = f.viz_auto_pause_on_idle_seconds;
      }
      if (typeof f.viz_auto_pause_on_edit === "boolean")
        updates.viz_auto_pause_on_edit = f.viz_auto_pause_on_edit;
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

  ipcMain.handle("viz:edit-pause", () => vizEditPause());

  ipcMain.handle("viz:set-speed", (_event, speed: unknown) => {
    if (typeof speed !== "number") throw new Error("viz:set-speed: speed must be a number");
    vizSetSpeed(speed);
  });

  ipcMain.handle("viz:hard-reset", () => vizHardReset());
  ipcMain.handle("viz:reconnect", () => vizReconnect());
  ipcMain.handle("viz:get-status", () => getVizStatus());
}
