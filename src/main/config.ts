import { join } from "path";
import * as fsp from "fs/promises";

export interface AppConfig {
  soniox: { language: string; model: string; translate_to: string };
  output: { feed_file: string; session_log_dir: string };
}

const DEFAULT_CONFIG: AppConfig = {
  soniox: { language: "ur", model: "stt-rt-v4", translate_to: "en" },
  output: { feed_file: "feed.txt", session_log_dir: "sessions" },
};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const configPath = join(__dirname, "..", "..", "config", "default.json");
    const raw = await fsp.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as AppConfig;
    return {
      soniox: { ...DEFAULT_CONFIG.soniox, ...parsed.soniox },
      output: { ...DEFAULT_CONFIG.output, ...parsed.output },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export { DEFAULT_CONFIG };
