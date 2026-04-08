import { app } from "electron";
import { join, basename } from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import type { AppConfig } from "./config";

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
  const lastLine = feedBuffer[feedBuffer.length - 1];
  feedBuffer = [];
  const tmp = `${feedPath}.tmp`;
  try {
    await fsp.writeFile(tmp, lastLine);
    await fsp.rename(tmp, feedPath);
  } catch {}
}

export function startSession(config: AppConfig): void {
  const dataDir = app.getPath("userData");
  const safeDirName = basename(config.output.session_log_dir);
  const sessionDir = join(dataDir, safeDirName);
  fs.mkdirSync(sessionDir, { recursive: true });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const sessionPath = join(sessionDir, `session_${ts}.txt`);
  sessionFile = fs.createWriteStream(sessionPath, { flags: "a" });

  const safeFeedName = basename(config.output.feed_file);
  feedPath = join(dataDir, safeFeedName);
  console.log(`Session log: ${sessionPath}`);
  console.log(`Feed file: ${feedPath}`);
}

export async function stopSession(): Promise<void> {
  if (feedFlushTimer) {
    clearTimeout(feedFlushTimer);
    feedFlushTimer = null;
  }
  await flushFeed();
  if (sessionFile) {
    sessionFile.end();
    sessionFile = null;
  }
}

export function logTranslation(timestamp: string, text: string): void {
  const line = `[${timestamp}] ${text}\n`;
  if (sessionFile) sessionFile.write(line);
  if (feedPath) {
    feedBuffer.push(line);
    scheduleFeedFlush();
  }
}
