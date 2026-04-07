import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getApiKey: (): Promise<string | null> => ipcRenderer.invoke("get-api-key"),
  saveApiKey: (key: string): Promise<void> => ipcRenderer.invoke("save-api-key", key),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke("has-api-key"),
  getConfig: (): Promise<any> => ipcRenderer.invoke("get-config"),
  startSession: (): Promise<void> => ipcRenderer.invoke("start-session"),
  stopSession: (): Promise<void> => ipcRenderer.invoke("stop-session"),
  logTranslation: (timestamp: string, text: string): Promise<void> =>
    ipcRenderer.invoke("log-translation", timestamp, text),
});
