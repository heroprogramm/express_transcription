/** Application configuration for Soniox transcription and output settings. */
export interface AppConfig {
  soniox: { language: string; model: string; translate_to: string; endpoint_detection: boolean };
  output: { feed_file: string; session_log_dir: string; review_time_seconds: number };
  viz: {
    host: string;
    port: number;
    scene_path: string;
    scroll_speed: number;
    auto_pause_on_idle: boolean;
    auto_pause_on_idle_seconds: number;
  };
}

/** Viz Engine TCP connection lifecycle state. */
export const VizConnection = {
  Idle: "idle",
  Connecting: "connecting",
  Connected: "connected",
  Reconnecting: "reconnecting",
  Failed: "failed",
} as const;
export type VizConnection = (typeof VizConnection)[keyof typeof VizConnection];

/** Point-in-time snapshot of the Viz Engine controller state, pushed to the renderer via IPC. */
export interface VizStatus {
  connection: VizConnection;
  isAnimating: boolean;
  isLoaded: boolean;
  /** Authoritative scene name reported by the Viz Engine (null if nothing is loaded or unknown). */
  loadedSceneName: string | null;
  hasData: boolean;
  autoPaused: boolean;
  currentIdx: number;
  yPos: number;
  scrollSpeed: number;
  history: VizLogEntry[];
}

/** A single entry in the Viz Engine action/event history log. */
export interface VizLogEntry {
  time: string;
  msg: string;
  type: "info" | "action";
}

/** Result of loading config: the resolved config plus any validation warnings. */
export interface ConfigResult {
  config: AppConfig;
  warnings: string[];
}

/** Point-in-time snapshot of CPU, memory, and event-loop metrics from the main process. */
export interface PerfSnapshot {
  ts: number;
  processes: Array<{
    pid: number;
    type: string;
    cpu: { percentCPUUsage: number };
    memory: { workingSetSize: number; privateBytes: number };
  }>;
  mainMemory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  eventLoopLagMs: number;
}
