export const LogLevel = {
  Info: "info",
  Warn: "warn",
  Error: "error",
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export function log(level: LogLevel, tag: string, data: Record<string, unknown> = {}): void {
  const entry = { ts: new Date().toISOString(), level, tag, ...data };
  const out = level === LogLevel.Error ? console.error : console.log;
  out(JSON.stringify(entry));
}
