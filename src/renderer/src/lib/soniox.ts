import {
  SonioxClient,
  BrowserPermissionResolver,
  MicrophoneSource,
  AuthError,
  type Recording,
  type RealtimeResult,
  type RealtimeToken,
  type RecordingState,
} from "@soniox/client";
import type { AppConfig } from "./types";
import { getApiKey, logTranslationsBatch } from "./ipc";
import { reportError } from "./errors";

export interface SonioxCallbacks {
  onTranscript: (timestamp: string, text: string, isPartial: boolean) => void;
  onTranslation: (timestamp: string, text: string, latencyMs: number) => void;
  onError: (message: string, isApiKeyError: boolean) => void;
  onStateChange: (state: "started" | "stopped" | "loading") => void;
}

let client: SonioxClient | null = null;
let recording: Recording | null = null;
let startTime = 0;
let wordCount = 0;

// ── IPC batching ──
let logQueue: { ts: string; text: string }[] = [];
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;
const LOG_FLUSH_INTERVAL_MS = 200;

function queueLogTranslation(ts: string, text: string): void {
  logQueue.push({ ts, text });
  if (!logFlushTimer) {
    logFlushTimer = setTimeout(flushLogQueue, LOG_FLUSH_INTERVAL_MS);
  }
}

function flushLogQueue(): void {
  logFlushTimer = null;
  if (logQueue.length === 0) return;
  const batch = logQueue;
  logQueue = [];
  logTranslationsBatch(batch).catch((err) => {
    reportError("session", "Failed to log translation batch", err);
  });
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const secs = String(totalSec % 60).padStart(2, "0");
  return `${hours}:${mins}:${secs}`;
}

function parseTokens(tokens: RealtimeToken[]): {
  original: string;
  translated: string | null;
  isFinal: boolean;
} {
  const originalParts: string[] = [];
  const translatedParts: string[] = [];
  let isFinal = false;

  for (const t of tokens) {
    if (t.is_final) isFinal = true;
    if (t.text === "<end>") continue;
    if (t.translation_status === "translation") {
      translatedParts.push(t.text);
    } else {
      originalParts.push(t.text);
    }
  }

  return {
    original: originalParts.join(""),
    translated: translatedParts.length > 0 ? translatedParts.join("") : null,
    isFinal,
  };
}

export function getWordCount(): number {
  return wordCount;
}

export async function startTranscription(
  config: AppConfig,
  callbacks: SonioxCallbacks,
  micDeviceId?: string,
): Promise<void> {
  callbacks.onStateChange("loading");
  wordCount = 0;

  client = new SonioxClient({
    api_key: async () => {
      const key = await getApiKey();
      if (!key) throw new Error("No Soniox API key configured");
      return key;
    },
    permissions: new BrowserPermissionResolver(),
  });

  const source = new MicrophoneSource(
    micDeviceId ? { constraints: { deviceId: { exact: micDeviceId } } } : undefined,
  );

  function handleResult(result: RealtimeResult): void {
    const elapsed = Date.now() - startTime;
    const ts = formatTimestamp(elapsed);
    const { original, translated, isFinal } = parseTokens(result.tokens);

    if (original) {
      callbacks.onTranscript(ts, original, !isFinal);
    }

    if (translated) {
      if (isFinal) {
        wordCount += translated.split(/\s+/).filter(Boolean).length;
      }
      const latencyMs = elapsed - result.total_audio_proc_ms;
      callbacks.onTranslation(ts, translated, latencyMs);
      queueLogTranslation(ts, translated);
    }
  }

  function handleError(err: Error): void {
    const isApiKeyError = err instanceof AuthError || /no soniox api key/i.test(err.message);
    callbacks.onError(err.message, isApiKeyError);
  }

  recording = client.realtime.record({
    model: config.soniox.model,
    language_hints: [config.soniox.language],
    language_hints_strict: true,
    enable_endpoint_detection: true,
    translation: {
      type: "one_way",
      target_language: config.soniox.translate_to,
    },
    source,
  });

  recording.on("connected", () => {
    startTime = Date.now();
    callbacks.onStateChange("started");
  });
  recording.on("result", handleResult);
  recording.on("finished", () => callbacks.onStateChange("stopped"));
  recording.on("error", handleError);
}

function cleanup(): void {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
  flushLogQueue();
}

export function stopTranscription(): void {
  cleanup();
  if (recording) {
    recording.stop().catch(() => {});
    recording = null;
  }
  client = null;
}

export function cancelTranscription(): void {
  cleanup();
  if (recording) {
    recording.cancel();
    recording = null;
  }
  client = null;
}

export function getAudioHealth(): { active: boolean; state: RecordingState } {
  return {
    active: recording?.state === "recording",
    state: recording?.state ?? "idle",
  };
}
