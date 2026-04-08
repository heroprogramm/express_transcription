import { ipcMain, systemPreferences, shell } from "electron";
import type { AppConfig } from "./config";
import { getApiKey, saveApiKey, hasApiKey } from "./store";
import { startSession, stopSession, logTranslation } from "./session";

export function registerIpcHandlers(getConfig: () => AppConfig): void {
  ipcMain.handle("get-api-key", () => getApiKey());
  ipcMain.handle("save-api-key", (_event, key: string) => saveApiKey(key));
  ipcMain.handle("has-api-key", () => hasApiKey());
  ipcMain.handle("get-config", () => getConfig());

  ipcMain.handle(
    "ensure-mic-access",
    async (): Promise<"granted" | "denied" | "opened-settings"> => {
      if (process.platform === "darwin") {
        const status = systemPreferences.getMediaAccessStatus("microphone");
        if (status === "granted") return "granted";
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
  ipcMain.handle("log-translation", (_event, timestamp: string, text: string) =>
    logTranslation(timestamp, text),
  );
}
