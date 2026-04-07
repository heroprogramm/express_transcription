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
    };
  }
}

const api = window.electronAPI;

export async function getApiKey(): Promise<string | null> {
  return api.getApiKey();
}

export async function saveApiKey(key: string): Promise<void> {
  return api.saveApiKey(key);
}

export async function hasApiKey(): Promise<boolean> {
  return api.hasApiKey();
}

export async function getConfig(): Promise<AppConfig> {
  return api.getConfig();
}

export async function startSession(): Promise<void> {
  return api.startSession();
}

export async function stopSession(): Promise<void> {
  return api.stopSession();
}

export async function logTranslation(timestamp: string, text: string): Promise<void> {
  return api.logTranslation(timestamp, text);
}
