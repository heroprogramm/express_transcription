import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { PerfSnapshot, VizStatus, VizLogEntry } from "../shared/types";

/** Exposes a safe, typed API surface to the renderer process via `window.electronAPI`. */
contextBridge.exposeInMainWorld("electronAPI", {
  getApiKey: (): Promise<string | null> => ipcRenderer.invoke("get-api-key"),
  saveApiKey: (key: string): Promise<void> => ipcRenderer.invoke("save-api-key", key),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke("has-api-key"),
  getConfig: (): Promise<ConfigResult> => ipcRenderer.invoke("get-config"),
  saveConfig: (fields: Record<string, unknown>): Promise<ConfigResult> =>
    ipcRenderer.invoke("save-config", fields),
  startSession: (): Promise<void> => ipcRenderer.invoke("start-session"),
  stopSession: (): Promise<void> => ipcRenderer.invoke("stop-session"),
  logTranslation: (timestamp: string, text: string): Promise<void> =>
    ipcRenderer.invoke("log-translation", timestamp, text),
  logTranslationsBatch: (batch: Array<{ ts: string; text: string }>): Promise<void> =>
    ipcRenderer.invoke("log-translations-batch", batch),
  ensureMicAccess: (): Promise<"granted" | "denied" | "opened-settings"> =>
    ipcRenderer.invoke("ensure-mic-access"),

  // ── Performance monitoring ──
  perfStart: (): Promise<void> => ipcRenderer.invoke("perf:start"),
  perfStop: (): Promise<void> => ipcRenderer.invoke("perf:stop"),
  perfPing: (): Promise<number> => ipcRenderer.invoke("perf:ping"),
  onPerfSnapshot: (cb: (snapshot: PerfSnapshot) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, snapshot: PerfSnapshot) => cb(snapshot);
    ipcRenderer.on("perf:snapshot", handler);
    return () => ipcRenderer.removeListener("perf:snapshot", handler);
  },
  copyToClipboard: (text: string): void => {
    ipcRenderer.invoke("clipboard:write", text);
  },
  onOpenSettings: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on("open-settings", handler);
    return () => ipcRenderer.removeListener("open-settings", handler);
  },
  onUpdateStatus: (cb: (status: string, version?: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, status: string, version?: string) =>
      cb(status, version);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },
  restartForUpdate: (): void => {
    ipcRenderer.send("restart-for-update");
  },

  // ── Viz Engine ──
  vizLoadScene: (): Promise<void> => ipcRenderer.invoke("viz:load-scene"),
  vizContinue: (): Promise<void> => ipcRenderer.invoke("viz:continue"),
  vizSendText: (text: string): Promise<void> => ipcRenderer.invoke("viz:send-text", text),
  vizToggleScroll: (start: boolean): Promise<void> =>
    ipcRenderer.invoke("viz:toggle-scroll", start),
  vizSetSpeed: (speed: number): Promise<void> => ipcRenderer.invoke("viz:set-speed", speed),
  vizHardReset: (): Promise<void> => ipcRenderer.invoke("viz:hard-reset"),
  vizGetStatus: (): Promise<VizStatus> => ipcRenderer.invoke("viz:get-status"),
  vizGetHistory: (): Promise<VizLogEntry[]> => ipcRenderer.invoke("viz:get-history"),
  onVizStatus: (cb: (status: VizStatus) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, status: VizStatus) => cb(status);
    ipcRenderer.on("viz:status", handler);
    return () => ipcRenderer.removeListener("viz:status", handler);
  },
});
