import { join } from "path";
import * as fsp from "fs/promises";

export interface AppConfig {
  soniox: { language: string; model: string; translate_to: string };
  output: { feed_file: string; session_log_dir: string; feed_delay_seconds: number };
}

const DEFAULT_CONFIG: AppConfig = {
  soniox: { language: "ur", model: "stt-rt-v4", translate_to: "en" },
  output: { feed_file: "feed.txt", session_log_dir: "sessions", feed_delay_seconds: 10 },
};

function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];
  const { soniox, output } = config;

  if (!soniox.language || typeof soniox.language !== "string") {
    errors.push("soniox.language must be a non-empty string");
  }
  if (!soniox.model || typeof soniox.model !== "string") {
    errors.push("soniox.model must be a non-empty string");
  }
  if (!soniox.translate_to || typeof soniox.translate_to !== "string") {
    errors.push("soniox.translate_to must be a non-empty string");
  }
  if (!output.feed_file || typeof output.feed_file !== "string") {
    errors.push("output.feed_file must be a non-empty string");
  }
  if (!output.session_log_dir || typeof output.session_log_dir !== "string") {
    errors.push("output.session_log_dir must be a non-empty string");
  }
  if (typeof output.feed_delay_seconds !== "number" || output.feed_delay_seconds < 0) {
    errors.push("output.feed_delay_seconds must be a non-negative number");
  }

  return errors;
}

export interface ConfigResult {
  config: AppConfig;
  warnings: string[];
}

export async function loadConfig(): Promise<ConfigResult> {
  try {
    const configPath = join(__dirname, "..", "..", "config", "default.json");
    const raw = await fsp.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as AppConfig;
    const config: AppConfig = {
      soniox: { ...DEFAULT_CONFIG.soniox, ...parsed.soniox },
      output: { ...DEFAULT_CONFIG.output, ...parsed.output },
    };

    const errors = validateConfig(config);
    if (errors.length > 0) {
      console.warn(`[config] Invalid config, using defaults: ${errors.join("; ")}`);
      return { config: DEFAULT_CONFIG, warnings: errors };
    }

    return { config, warnings: [] };
  } catch (err) {
    const msg = `Could not load config file, using defaults: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`[config] ${msg}`);
    return { config: DEFAULT_CONFIG, warnings: [msg] };
  }
}

export async function saveConfigFields(
  fields: Partial<{ model: string; feed_delay_seconds: number }>,
): Promise<void> {
  const configPath = join(__dirname, "..", "..", "config", "default.json");
  const raw = await fsp.readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;

  if (fields.model !== undefined) {
    parsed.soniox = { ...parsed.soniox, model: fields.model };
  }
  if (fields.feed_delay_seconds !== undefined) {
    parsed.output = { ...parsed.output, feed_delay_seconds: fields.feed_delay_seconds };
  }

  await fsp.writeFile(configPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
}

export { DEFAULT_CONFIG };
