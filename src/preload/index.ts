import { contextBridge, ipcRenderer } from "electron";

interface AppConfig {
  soniox: { language: string; model: string; translate_to: string };
  output: { feed_file: string; session_log_dir: string };
}

contextBridge.exposeInMainWorld("electronAPI", {
  getApiKey: (): Promise<string | null> => ipcRenderer.invoke("get-api-key"),
  saveApiKey: (key: string): Promise<void> => ipcRenderer.invoke("save-api-key", key),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke("has-api-key"),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke("get-config"),
  startSession: (): Promise<void> => ipcRenderer.invoke("start-session"),
  stopSession: (): Promise<void> => ipcRenderer.invoke("stop-session"),
  logTranslation: (timestamp: string, text: string): Promise<void> =>
    ipcRenderer.invoke("log-translation", timestamp, text),
});
