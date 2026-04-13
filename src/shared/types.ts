/** Application configuration for Soniox transcription and output settings. */
export interface AppConfig {
  soniox: { language: string; model: string; translate_to: string };
  output: { feed_file: string; session_log_dir: string; feed_delay_seconds: number };
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
