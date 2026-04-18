import { getStoredConfig, saveStoredConfig } from "./store";
import type { AppConfig, ConfigResult } from "../shared/types";

export type { AppConfig, ConfigResult };

const DEFAULT_CONFIG: AppConfig = {
  soniox: { language: "ur", model: "stt-rt-v4", translate_to: "en", endpoint_detection: false },
  output: { feed_file: "feed.txt", session_log_dir: "sessions", review_time_seconds: 10 },
  viz: {
    host: "127.0.0.1",
    port: 6100,
    scene_path: "EXPRESS_24_7/TRANSLATION_BB/Translation_BB",
    scroll_speed: 0.3,
    auto_pause_on_idle: true,
    auto_pause_on_idle_seconds: 10,
    auto_pause_on_edit: true,
  },
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
  if (typeof soniox.endpoint_detection !== "boolean") {
    errors.push("soniox.endpoint_detection must be a boolean");
  }
  if (!output.feed_file || typeof output.feed_file !== "string") {
    errors.push("output.feed_file must be a non-empty string");
  }
  if (!output.session_log_dir || typeof output.session_log_dir !== "string") {
    errors.push("output.session_log_dir must be a non-empty string");
  }
  if (typeof output.review_time_seconds !== "number" || output.review_time_seconds < 0) {
    errors.push("output.review_time_seconds must be a non-negative number");
  }

  const { viz } = config;
  if (!viz.host || typeof viz.host !== "string") {
    errors.push("viz.host must be a non-empty string");
  }
  if (typeof viz.port !== "number" || viz.port < 1 || viz.port > 65535) {
    errors.push("viz.port must be a number between 1 and 65535");
  }
  if (typeof viz.scene_path !== "string") {
    errors.push("viz.scene_path must be a string");
  }
  if (typeof viz.scroll_speed !== "number" || viz.scroll_speed < 0.1 || viz.scroll_speed > 1.0) {
    errors.push("viz.scroll_speed must be a number between 0.1 and 1.0");
  }
  if (typeof viz.auto_pause_on_idle !== "boolean") {
    errors.push("viz.auto_pause_on_idle must be a boolean");
  }
  if (typeof viz.auto_pause_on_idle_seconds !== "number" || viz.auto_pause_on_idle_seconds < 1) {
    errors.push("viz.auto_pause_on_idle_seconds must be a number >= 1");
  }
  if (typeof viz.auto_pause_on_edit !== "boolean") {
    errors.push("viz.auto_pause_on_edit must be a boolean");
  }

  return errors;
}

/** Loads config from the persistent store, falling back to defaults on missing or invalid values. */
export function loadConfig(): ConfigResult {
  const stored = getStoredConfig();
  if (!stored) {
    return { config: DEFAULT_CONFIG, warnings: [] };
  }

  const config: AppConfig = {
    soniox: { ...DEFAULT_CONFIG.soniox, ...stored.soniox },
    output: { ...DEFAULT_CONFIG.output, ...stored.output },
    viz: { ...DEFAULT_CONFIG.viz, ...stored.viz },
  };

  const errors = validateConfig(config);
  if (errors.length > 0) {
    // oxlint-disable-next-line no-console -- startup warning before logger is available
    console.warn(`[config] Invalid stored config, using defaults: ${errors.join("; ")}`);
    return { config: DEFAULT_CONFIG, warnings: errors };
  }

  return { config, warnings: [] };
}

/** Merges partial config updates into the current config, persists, and returns the result. */
export function saveConfigFields(
  fields: Partial<{
    model: string;
    endpoint_detection: boolean;
    review_time_seconds: number;
    viz_host: string;
    viz_port: number;
    viz_scene_path: string;
    viz_scroll_speed: number;
    viz_auto_pause_on_idle: boolean;
    viz_auto_pause_on_idle_seconds: number;
    viz_auto_pause_on_edit: boolean;
  }>,
): ConfigResult {
  const { config } = loadConfig();

  if (fields.model !== undefined) {
    config.soniox = { ...config.soniox, model: fields.model };
  }
  if (fields.endpoint_detection !== undefined) {
    config.soniox = { ...config.soniox, endpoint_detection: fields.endpoint_detection };
  }
  if (fields.review_time_seconds !== undefined) {
    config.output = { ...config.output, review_time_seconds: fields.review_time_seconds };
  }
  if (fields.viz_host !== undefined) {
    config.viz = { ...config.viz, host: fields.viz_host };
  }
  if (fields.viz_port !== undefined) {
    config.viz = { ...config.viz, port: fields.viz_port };
  }
  if (fields.viz_scene_path !== undefined) {
    config.viz = { ...config.viz, scene_path: fields.viz_scene_path };
  }
  if (fields.viz_scroll_speed !== undefined) {
    config.viz = { ...config.viz, scroll_speed: fields.viz_scroll_speed };
  }
  if (fields.viz_auto_pause_on_idle !== undefined) {
    config.viz = { ...config.viz, auto_pause_on_idle: fields.viz_auto_pause_on_idle };
  }
  if (fields.viz_auto_pause_on_idle_seconds !== undefined) {
    config.viz = {
      ...config.viz,
      auto_pause_on_idle_seconds: fields.viz_auto_pause_on_idle_seconds,
    };
  }
  if (fields.viz_auto_pause_on_edit !== undefined) {
    config.viz = { ...config.viz, auto_pause_on_edit: fields.viz_auto_pause_on_edit };
  }

  saveStoredConfig(config);
  return { config, warnings: [] };
}

/** Default configuration values used when no stored config exists or validation fails. */
export { DEFAULT_CONFIG };
