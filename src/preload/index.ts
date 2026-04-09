import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

interface AppConfig {
  soniox: { language: string; model: string; translate_to: string };
  output: { feed_file: string; session_log_dir: string; feed_delay_seconds: number };
}

interface ConfigResult {
  config: AppConfig;
  warnings: string[];
}

interface PerfSnapshot {
  ts: number;
  processes: Array<{
    pid: number;
    type: string;
    cpu: { percentCPUUsage: number };
    memory: { workingSetSize: number; privateBytes: number };
  }>;
  mainMemory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  eventLoopLagMs: number;
}

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
});
