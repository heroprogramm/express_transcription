import { getStoredConfig, saveStoredConfig } from "./store";

export interface AppConfig {
  soniox: { language: string; model: string; translate_to: string };
  output: { feed_file: string; session_log_dir: string; feed_delay_seconds: number };
}

const DEFAULT_CONFIG: AppConfig = {
  soniox: { language: "ur", model: "stt-rt-v4", translate_to: "en" },
  output: { feed_file: "feed.txt", session_log_dir: "sessions", feed_delay_seconds: 5 },
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

export function loadConfig(): ConfigResult {
  const stored = getStoredConfig();
  if (!stored) {
    return { config: DEFAULT_CONFIG, warnings: [] };
  }

  const config: AppConfig = {
    soniox: { ...DEFAULT_CONFIG.soniox, ...stored.soniox },
    output: { ...DEFAULT_CONFIG.output, ...stored.output },
  };

  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.warn(`[config] Invalid stored config, using defaults: ${errors.join("; ")}`);
    return { config: DEFAULT_CONFIG, warnings: errors };
  }

  return { config, warnings: [] };
}

export function saveConfigFields(
  fields: Partial<{ model: string; feed_delay_seconds: number }>,
): void {
  const { config } = loadConfig();

  if (fields.model !== undefined) {
    config.soniox = { ...config.soniox, model: fields.model };
  }
  if (fields.feed_delay_seconds !== undefined) {
    config.output = { ...config.output, feed_delay_seconds: fields.feed_delay_seconds };
  }

  saveStoredConfig(config);
}

export { DEFAULT_CONFIG };
