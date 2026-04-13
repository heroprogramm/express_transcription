import { app } from "electron";
import { join, basename } from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import type { AppConfig } from "./config";
import { log, LogLevel } from "./logger";

let sessionFile: fs.WriteStream | null = null;
let feedPath = "";
let feedBuffer: string[] = [];
let feedFlushTimer: ReturnType<typeof setTimeout> | null = null;
const FEED_FLUSH_INTERVAL_MS = 200;

function scheduleFeedFlush(): void {
  if (feedFlushTimer) return;
  feedFlushTimer = setTimeout(flushFeed, FEED_FLUSH_INTERVAL_MS);
}

async function flushFeed(): Promise<void> {
  feedFlushTimer = null;
  if (!feedPath || feedBuffer.length === 0) return;
  const snapshot = feedBuffer;
  feedBuffer = [];
  const tmp = `${feedPath}.tmp`;
  try {
    await fsp.writeFile(tmp, snapshot.join(""));
  } catch (err) {
    log(LogLevel.Error, "session:feed-write-failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    feedBuffer = [...snapshot, ...feedBuffer];
    return;
  }
  try {
    await fsp.rename(tmp, feedPath);
  } catch (err) {
    log(LogLevel.Error, "session:feed-rename-failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    fsp.unlink(tmp).catch(() => {});
  }
}

/** Returns whether a session is currently active. */
export function isSessionActive(): boolean {
  return sessionFile !== null;
}

/** Opens a new timestamped session log file and sets up the feed output path. */
export async function startSession(config: AppConfig): Promise<void> {
  if (sessionFile) return;
  const dataDir = app.getPath("userData");
  const safeDirName = basename(config.output.session_log_dir);
  const sessionDir = join(dataDir, safeDirName);
  await fsp.mkdir(sessionDir, { recursive: true });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const sessionPath = join(sessionDir, `session_${ts}.txt`);
  sessionFile = fs.createWriteStream(sessionPath, { flags: "a" });

  const safeFeedName = basename(config.output.feed_file);
  feedPath = join(dataDir, safeFeedName);
  log(LogLevel.Info, "session:started", { sessionPath, feedPath });
}

/** Flushes pending feed writes and closes the session log file. */
export async function stopSession(): Promise<void> {
  if (feedFlushTimer) {
    clearTimeout(feedFlushTimer);
    feedFlushTimer = null;
  }
  await flushFeed();
  if (sessionFile) {
    await new Promise<void>((resolve) => {
      sessionFile!.end(() => resolve());
    });
    sessionFile = null;
  }
}

/** Writes a translated line to both the session log and the feed buffer. */
export function logTranslation(timestamp: string, text: string): void {
  const line = `[${timestamp}] ${text}\n`;
  if (sessionFile) sessionFile.write(line);
  if (feedPath) {
    feedBuffer.push(line);
    scheduleFeedFlush();
  }
}
