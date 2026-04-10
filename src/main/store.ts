import { safeStorage } from "electron";
import Store from "electron-store";
import type { AppConfig } from "./config";

const store = new Store();

const STORE_KEY_API = "soniox_api_key";
const STORE_KEY_CONFIG = "app_config";

// ── API Key (encrypted via OS keychain) ──

/** Retrieves and decrypts the Soniox API key from the OS keychain. */
export function getApiKey(): string | null {
  const stored = store.get(STORE_KEY_API) as string | undefined;
  if (!stored) return null;
  return safeStorage.decryptString(Buffer.from(stored, "base64"));
}

/** Encrypts and stores the Soniox API key via the OS keychain. Throws on empty or oversized keys. */
export function saveApiKey(key: string): void {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    throw new Error("API key cannot be empty");
  }
  if (key.length > 512) {
    throw new Error("API key is too long");
  }
  const encrypted = safeStorage.encryptString(key.trim()).toString("base64");
  store.set(STORE_KEY_API, encrypted);
}

/** Returns whether an API key has been stored. */
export function hasApiKey(): boolean {
  return !!store.get(STORE_KEY_API);
}

// ── App Config ──

/** Reads the raw app config from the electron-store, or null if not set. */
export function getStoredConfig(): Partial<AppConfig> | null {
  return (store.get(STORE_KEY_CONFIG) as Partial<AppConfig>) || null;
}

/** Persists the full app config to the electron-store. */
export function saveStoredConfig(config: AppConfig): void {
  store.set(STORE_KEY_CONFIG, config);
}
