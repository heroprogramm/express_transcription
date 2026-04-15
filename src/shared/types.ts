/** Application configuration for Soniox transcription and output settings. */
export interface AppConfig {
  soniox: { language: string; model: string; translate_to: string; endpoint_detection: boolean };
  output: { feed_file: string; session_log_dir: string; feed_delay_seconds: number };
  viz: { host: string; port: number; scene_path: string; scroll_speed: number };
}

/** Point-in-time snapshot of the Viz Engine controller state, pushed to the renderer via IPC. */
export interface VizStatus {
  connected: boolean;
  isAnimating: boolean;
  isLoaded: boolean;
  hasData: boolean;
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
