export interface AppConfig {
  soniox: {
    language: string;
    model: string;
    translate_to: string;
  };
  output: {
    feed_file: string;
    session_log_dir: string;
    feed_delay_seconds: number;
  };
}

export interface TranscriptEntry {
  id: number;
  timestamp: string;
  text: string;
  isPartial: boolean;
}

export const EntryStatus = {
  Pending: "pending",
  Editing: "editing",
  Confirmed: "confirmed",
  Sent: "sent",
} as const;

export type EntryStatus = (typeof EntryStatus)[keyof typeof EntryStatus];

export interface TranslationEntry {
  id: number;
  timestamp: string;
  text: string;
  status: EntryStatus;
  createdAt: number;
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
