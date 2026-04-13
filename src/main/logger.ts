/** Severity levels for structured log output. */
export const LogLevel = {
  Info: "info",
  Warn: "warn",
  Error: "error",
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** Emits a structured JSON log line to stdout (or stderr for errors). */
export function log(level: LogLevel, tag: string, data: Record<string, unknown> = {}): void {
  const entry = { ts: new Date().toISOString(), level, tag, ...data };
  // oxlint-disable-next-line no-console -- structured logger is the only sanctioned console output
  const out = level === LogLevel.Error ? console.error : console.log;
  out(JSON.stringify(entry));
}
