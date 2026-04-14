export type {
  AppConfig,
  ConfigResult,
  PerfSnapshot,
  VizStatus,
  VizLogEntry,
} from "../../../shared/types";

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
