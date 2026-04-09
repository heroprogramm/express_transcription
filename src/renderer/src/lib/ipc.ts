import type { AppConfig, PerfSnapshot } from "./types";

declare global {
  interface Window {
    electronAPI: {
      getApiKey: () => Promise<string | null>;
      saveApiKey: (key: string) => Promise<void>;
      hasApiKey: () => Promise<boolean>;
      getConfig: () => Promise<{ config: AppConfig; warnings: string[] }>;
      saveConfig: (
        fields: Record<string, unknown>,
      ) => Promise<{ config: AppConfig; warnings: string[] }>;
      startSession: () => Promise<void>;
      stopSession: () => Promise<void>;
      logTranslation: (timestamp: string, text: string) => Promise<void>;
      logTranslationsBatch: (batch: Array<{ ts: string; text: string }>) => Promise<void>;
      ensureMicAccess: () => Promise<"granted" | "denied" | "opened-settings">;
      perfStart: () => Promise<void>;
      perfStop: () => Promise<void>;
      perfPing: () => Promise<number>;
      onPerfSnapshot: (cb: (snapshot: PerfSnapshot) => void) => () => void;
      onOpenSettings: (cb: () => void) => () => void;
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

export async function getConfig(): Promise<{ config: AppConfig; warnings: string[] }> {
  return getApi().getConfig();
}

export async function saveConfig(
  fields: Record<string, unknown>,
): Promise<{ config: AppConfig; warnings: string[] }> {
  return getApi().saveConfig(fields);
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

export async function logTranslationsBatch(
  batch: Array<{ ts: string; text: string }>,
): Promise<void> {
  return getApi().logTranslationsBatch(batch);
}

export async function ensureMicAccess(): Promise<"granted" | "denied" | "opened-settings"> {
  return getApi().ensureMicAccess();
}

export async function perfStart(): Promise<void> {
  return getApi().perfStart();
}

export async function perfStop(): Promise<void> {
  return getApi().perfStop();
}

export async function perfPing(): Promise<number> {
  return getApi().perfPing();
}

export function onPerfSnapshot(cb: (snapshot: PerfSnapshot) => void): () => void {
  return getApi().onPerfSnapshot(cb);
}

export function onOpenSettings(cb: () => void): () => void {
  return getApi().onOpenSettings(cb);
}
