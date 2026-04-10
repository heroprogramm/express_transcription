/** Application configuration for Soniox transcription and output settings. */
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

/** A single speech-to-text transcript entry from Soniox. */
export interface TranscriptEntry {
  id: number;
  timestamp: string;
  text: string;
  isPartial: boolean;
}

/** Lifecycle states for a translation entry: pending -> editing/confirmed -> sent. */
export const EntryStatus = {
  Pending: "pending",
  Editing: "editing",
  Confirmed: "confirmed",
  Sent: "sent",
} as const;

/** Union of all entry status string literals. */
export type EntryStatus = (typeof EntryStatus)[keyof typeof EntryStatus];

/** A translated text entry with its current lifecycle status. */
export interface TranslationEntry {
  id: number;
  timestamp: string;
  text: string;
  status: EntryStatus;
  createdAt: number;
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
