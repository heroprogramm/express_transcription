import type { AppConfig, PerfSnapshot, VizStatus, VizTestResult } from "@/lib/types";

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
      vizSetSpeed: (speed: number) => Promise<void>;
      vizHardReset: () => Promise<void>;
      vizReconnect: () => Promise<void>;
      vizTestConnection: (host: string, port: number) => Promise<VizTestResult>;
      vizGetStatus: () => Promise<VizStatus>;
      onVizStatus: (cb: (status: VizStatus) => void) => () => void;
      vizSetAutoMode: (auto: boolean) => Promise<void>;
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

export async function getModels(): Promise<Array<{ id: string; name: string }>> {
  return getApi().getModels();
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

export function copyToClipboard(text: string): void {
  getApi().copyToClipboard(text);
}

export function onOpenSettings(cb: () => void): () => void {
  return getApi().onOpenSettings(cb);
}

export function onUpdateStatus(cb: (status: string, version?: string) => void): () => void {
  return getApi().onUpdateStatus(cb);
}

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

export function vizSetSpeed(speed: number): Promise<void> {
  return getApi().vizSetSpeed(speed);
}

export function vizHardReset(): Promise<void> {
  return getApi().vizHardReset();
}

export function vizReconnect(): Promise<void> {
  return getApi().vizReconnect();
}

export function vizTestConnection(host: string, port: number): Promise<VizTestResult> {
  return getApi().vizTestConnection(host, port);
}

export function vizGetStatus(): Promise<VizStatus> {
  return getApi().vizGetStatus();
}

export function onVizStatus(cb: (status: VizStatus) => void): () => void {
  return getApi().onVizStatus(cb);
}

export function vizSetAutoMode(auto: boolean): Promise<void> {
  return getApi().vizSetAutoMode(auto);
}