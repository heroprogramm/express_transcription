import type { AppConfig, PerfSnapshot, VizStatus } from "@/lib/types";

declare global {
  interface Window {
    electronAPI: {
      getApiKey: () => Promise<string | null>;
      saveApiKey: (key: string) => Promise<void>;
      hasApiKey: () => Promise<boolean>;
      getConfig: () => Promise<{ config: AppConfig; warnings: string[] }>;
      getModels: () => Promise<Array<{ id: string; name: string }>>;
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
      copyToClipboard: (text: string) => void;
      onOpenSettings: (cb: () => void) => () => void;
      onUpdateStatus: (cb: (status: string, version?: string) => void) => () => void;
      restartForUpdate: () => void;
      vizLoadScene: () => Promise<void>;
      vizContinue: () => Promise<void>;
      vizSendText: (text: string) => Promise<void>;
      vizToggleScroll: (start: boolean) => Promise<void>;
      vizEditPause: () => Promise<void>;
      vizSetSpeed: (speed: number) => Promise<void>;
      vizHardReset: () => Promise<void>;
      vizReconnect: () => Promise<void>;
      vizGetStatus: () => Promise<VizStatus>;
      onVizStatus: (cb: (status: VizStatus) => void) => () => void;
    };
  }
}

function getApi() {
  const api = window.electronAPI;
  if (!api) throw new Error("electronAPI not available — preload script may not have loaded");
  return api;
}

/** Retrieve the stored Soniox API key, or null if not set. */
export async function getApiKey(): Promise<string | null> {
  return getApi().getApiKey();
}

/** Persist the Soniox API key to secure storage. */
export async function saveApiKey(key: string): Promise<void> {
  return getApi().saveApiKey(key);
}

/** Check whether a Soniox API key is configured. */
export async function hasApiKey(): Promise<boolean> {
  return getApi().hasApiKey();
}

/** Fetch available real-time models from the Soniox API. */
export async function getModels(): Promise<Array<{ id: string; name: string }>> {
  return getApi().getModels();
}

/** Load the current application config from disk. */
export async function getConfig(): Promise<{ config: AppConfig; warnings: string[] }> {
  return getApi().getConfig();
}

/** Merge partial config fields and persist to disk. */
export async function saveConfig(
  fields: Record<string, unknown>,
): Promise<{ config: AppConfig; warnings: string[] }> {
  return getApi().saveConfig(fields);
}

/** Signal the main process to start a new transcription session. */
export async function startSession(): Promise<void> {
  return getApi().startSession();
}

/** Signal the main process to stop the active transcription session. */
export async function stopSession(): Promise<void> {
  return getApi().stopSession();
}

/** Write a single translation entry to the session log. */
export async function logTranslation(timestamp: string, text: string): Promise<void> {
  return getApi().logTranslation(timestamp, text);
}

/** Write multiple translation entries to the session log in one IPC call. */
export async function logTranslationsBatch(
  batch: Array<{ ts: string; text: string }>,
): Promise<void> {
  return getApi().logTranslationsBatch(batch);
}

/** Request microphone permission, opening system settings if needed. */
export async function ensureMicAccess(): Promise<"granted" | "denied" | "opened-settings"> {
  return getApi().ensureMicAccess();
}

/** Start collecting performance snapshots in the main process. */
export async function perfStart(): Promise<void> {
  return getApi().perfStart();
}

/** Stop collecting performance snapshots in the main process. */
export async function perfStop(): Promise<void> {
  return getApi().perfStop();
}

/** Ping the main process and return the round-trip timestamp. */
export async function perfPing(): Promise<number> {
  return getApi().perfPing();
}

/** Subscribe to periodic performance snapshots. Returns an unsubscribe function. */
export function onPerfSnapshot(cb: (snapshot: PerfSnapshot) => void): () => void {
  return getApi().onPerfSnapshot(cb);
}

/** Copy text to the system clipboard via the main process. */
export function copyToClipboard(text: string): void {
  getApi().copyToClipboard(text);
}

/** Subscribe to the "open settings" event from the app menu. Returns an unsubscribe function. */
export function onOpenSettings(cb: () => void): () => void {
  return getApi().onOpenSettings(cb);
}

/** Subscribe to auto-update status events. Returns an unsubscribe function. */
export function onUpdateStatus(cb: (status: string, version?: string) => void): () => void {
  return getApi().onUpdateStatus(cb);
}

/** Quit the app and install the downloaded update. */
export function restartForUpdate(): void {
  getApi().restartForUpdate();
}

// ── Viz Engine ──

export function vizLoadScene(): Promise<void> {
  return getApi().vizLoadScene();
}

export function vizContinue(): Promise<void> {
  return getApi().vizContinue();
}

export function vizSendText(text: string): Promise<void> {
  return getApi().vizSendText(text);
}

export function vizToggleScroll(start: boolean): Promise<void> {
  return getApi().vizToggleScroll(start);
}

export function vizEditPause(): Promise<void> {
  return getApi().vizEditPause();
}

export function vizSetSpeed(speed: number): Promise<void> {
  return getApi().vizSetSpeed(speed);
}

export function vizHardReset(): Promise<void> {
  return getApi().vizHardReset();
}

export function vizReconnect(): Promise<void> {
  return getApi().vizReconnect();
}

export function vizGetStatus(): Promise<VizStatus> {
  return getApi().vizGetStatus();
}

export function onVizStatus(cb: (status: VizStatus) => void): () => void {
  return getApi().onVizStatus(cb);
}
