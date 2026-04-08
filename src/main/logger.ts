type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, tag: string, data: Record<string, unknown> = {}): void {
  const entry = { ts: new Date().toISOString(), level, tag, ...data };
  const out = level === "error" ? console.error : console.log;
  out(JSON.stringify(entry));
}
