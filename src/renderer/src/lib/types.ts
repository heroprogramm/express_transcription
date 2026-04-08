export interface AppConfig {
  soniox: {
    language: string;
    model: string;
    translate_to: string;
  };
  output: {
    feed_file: string;
    session_log_dir: string;
  };
}

export interface TranscriptEntry {
  id: number;
  timestamp: string;
  text: string;
  isPartial: boolean;
}

export interface TranslationEntry {
  id: number;
  timestamp: string;
  text: string;
}

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
