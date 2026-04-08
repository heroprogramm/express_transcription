import Store from "electron-store";

const store = new Store();
const STORE_KEY = "soniox_api_key";

export function getApiKey(): string | null {
  const envKey = process.env.SONIOX_API_KEY;
  if (envKey) return envKey;
  return (store.get(STORE_KEY) as string) || null;
}

export function saveApiKey(key: string): void {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    throw new Error("API key cannot be empty");
  }
  if (key.length > 512) {
    throw new Error("API key is too long");
  }
  store.set(STORE_KEY, key.trim());
}

export function hasApiKey(): boolean {
  return !!(process.env.SONIOX_API_KEY || store.get(STORE_KEY));
}
