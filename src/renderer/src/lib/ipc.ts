import type { AppConfig } from "./types";

declare global {
  interface Window {
    electronAPI: {
      getApiKey: () => Promise<string | null>;
      saveApiKey: (key: string) => Promise<void>;
      hasApiKey: () => Promise<boolean>;
      getConfig: () => Promise<AppConfig>;
      startSession: () => Promise<void>;
      stopSession: () => Promise<void>;
      logTranslation: (timestamp: string, text: string) => Promise<void>;
      ensureMicAccess: () => Promise<"granted" | "denied" | "opened-settings">;
    };
  }
}

function getApi() {
  const api = window.electronAPI;
  if (!api) throw new Error("electronAPI not available — preload script may not have loaded");
  return api;
}

export async function getApiKey(): Promise<string | null> {
  return getApi().getApiKey();
}

export async function saveApiKey(key: string): Promise<void> {
  return getApi().saveApiKey(key);
}

export async function hasApiKey(): Promise<boolean> {
  return getApi().hasApiKey();
}

export async function getConfig(): Promise<AppConfig> {
  return getApi().getConfig();
}

export async function startSession(): Promise<void> {
  return getApi().startSession();
}

export async function stopSession(): Promise<void> {
  return getApi().stopSession();
}

export async function logTranslation(timestamp: string, text: string): Promise<void> {
  return getApi().logTranslation(timestamp, text);
}

export async function ensureMicAccess(): Promise<"granted" | "denied" | "opened-settings"> {
  return getApi().ensureMicAccess();
}
