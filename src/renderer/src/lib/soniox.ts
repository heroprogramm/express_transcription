import {
  SonioxClient,
  BrowserPermissionResolver,
  MicrophoneSource,
  AuthError,
  ConnectionError,
  NetworkError,
  type Recording,
  type RealtimeResult,
  type RecordingState,
} from "@soniox/client";
import type { AppConfig } from "@/lib/types";
import { getApiKey, logTranslationsBatch } from "@/lib/ipc";
import { reportError } from "@/lib/errors";

/** Callbacks invoked by the Soniox recording lifecycle. */
export interface SonioxCallbacks {
  onTranscript: (timestamp: string, text: string, isPartial: boolean) => void;
  onTranslation: (timestamp: string, text: string, latencyMs: number) => void;
  onError: (message: string, isApiKeyError: boolean) => void;
  onStateChange: (state: "started" | "stopped" | "loading" | "reconnecting") => void;
}

// ── State machine ──
const SonioxState = {
  Idle: "idle",
  Connecting: "connecting",
  Recording: "recording",
  Stopping: "stopping",
} as const;
type SonioxState = (typeof SonioxState)[keyof typeof SonioxState];
let state: SonioxState = SonioxState.Idle;
const isInactive = () => state === SonioxState.Idle || state === SonioxState.Stopping;

let client: SonioxClient | null = null;
let recording: Recording | null = null;
let startTime = 0;
let wordCount = 0;

// ── Token accumulation (finals are returned once, non-finals replace each result) ──
let finalOriginalParts: string[] = [];
let finalTranslatedParts: string[] = [];

// ── Reconnection state ──
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let activeConfig: AppConfig | null = null;
let activeCallbacks: SonioxCallbacks | null = null;
let activeMicDeviceId: string | undefined;

// ── IPC batching ──
let logQueue: { ts: string; text: string }[] = [];
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;
const LOG_FLUSH_INTERVAL_MS = 200;

/** Queue a translation entry for batched IPC logging (flushes every 200ms). */
export function queueLogTranslation(ts: string, text: string): void {
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

function resetTokenAccumulators(): void {
  finalOriginalParts = [];
  finalTranslatedParts = [];
}

/** Return the cumulative number of translated words since the session started. */
export function getWordCount(): number {
  return wordCount;
}

function isTransientError(err: Error): boolean {
  if (err instanceof ConnectionError || err instanceof NetworkError) return true;
  // 503: server-side early termination — "Cannot continue request (code N)"
  return /cannot continue request/i.test(err.message);
}

function retryDelayMs(): number {
  return Math.min(BASE_DELAY_MS * 2 ** retryCount, 16000);
}

function attemptReconnect(): void {
  if (isInactive() || !activeConfig || !activeCallbacks) return;
  if (retryCount >= MAX_RETRIES) {
    activeCallbacks.onError(`Connection lost after ${MAX_RETRIES} reconnection attempts`, false);
    state = SonioxState.Idle;
    activeCallbacks.onStateChange("stopped");
    resetRetryState();
    return;
  }

  const delay = retryDelayMs();
  retryCount++;
  activeCallbacks.onStateChange("reconnecting");

  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (isInactive() || !activeConfig || !activeCallbacks) return;
    connectRecording(activeConfig, activeCallbacks, activeMicDeviceId);
  }, delay);
}

function resetRetryState(): void {
  retryCount = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function connectRecording(
  config: AppConfig,
  callbacks: SonioxCallbacks,
  micDeviceId?: string,
): void {
  if (!client) return;

  const source = new MicrophoneSource(
    micDeviceId ? { constraints: { deviceId: { exact: micDeviceId } } } : undefined,
  );

  function handleResult(result: RealtimeResult): void {
    const elapsed = Date.now() - startTime;
    const ts = formatTimestamp(elapsed);

    // Accumulate finals, collect current non-finals (reset each result).
    const nonFinalOriginal: string[] = [];
    const nonFinalTranslated: string[] = [];

    for (const token of result.tokens) {
      if (token.is_final) {
        if (token.translation_status === "translation") {
          finalTranslatedParts.push(token.text);
        } else {
          finalOriginalParts.push(token.text);
        }
      } else if (token.translation_status === "translation") {
        nonFinalTranslated.push(token.text);
      } else {
        nonFinalOriginal.push(token.text);
      }
    }

    const fullOriginal = finalOriginalParts.join("") + nonFinalOriginal.join("");
    const fullTranslated = finalTranslatedParts.join("") + nonFinalTranslated.join("");

    if (fullOriginal) {
      if (nonFinalOriginal.length === 0 && finalOriginalParts.length > 0) {
        callbacks.onTranscript(ts, fullOriginal, false);
        finalOriginalParts = [];
      } else {
        callbacks.onTranscript(ts, fullOriginal, true);
      }
    }

    if (nonFinalTranslated.length === 0 && finalTranslatedParts.length > 0) {
      wordCount += fullTranslated.split(/\s+/).filter(Boolean).length;
      const latencyMs = elapsed - result.total_audio_proc_ms;
      callbacks.onTranslation(ts, fullTranslated, latencyMs);
      finalTranslatedParts = [];
    }
  }

  function handleError(err: Error): void {
    if (isInactive()) return;

    if (isTransientError(err) && retryCount < MAX_RETRIES) {
      attemptReconnect();
      return;
    }

    const isApiKeyError = err instanceof AuthError || /no soniox api key/i.test(err.message);
    callbacks.onError(err.message, isApiKeyError);
    state = SonioxState.Idle;
    callbacks.onStateChange("stopped");
    resetRetryState();
  }

  recording = client.realtime.record({
    model: config.soniox.model,
    language_hints: [config.soniox.language],
    language_hints_strict: true,
    enable_endpoint_detection: config.soniox.endpoint_detection,
    translation: {
      type: "one_way",
      target_language: config.soniox.translate_to,
    },
    source,
  });

  recording.on("connected", () => {
    if (retryCount > 0) {
      retryCount = 0;
    } else {
      startTime = Date.now();
    }
    state = SonioxState.Recording;
    callbacks.onStateChange("started");
  });
  recording.on("result", handleResult);
  recording.on("finished", () => {
    if (state === SonioxState.Recording && retryCount === 0) {
      state = SonioxState.Idle;
      callbacks.onStateChange("stopped");
    }
  });
  recording.on("error", handleError);
}

/**
 * Initialize the Soniox client and begin real-time transcription.
 * Handles automatic reconnection on transient network errors.
 */
export async function startTranscription(
  config: AppConfig,
  callbacks: SonioxCallbacks,
  micDeviceId?: string,
): Promise<void> {
  if (state !== SonioxState.Idle) return;
  state = SonioxState.Connecting;
  callbacks.onStateChange("loading");
  wordCount = 0;
  resetTokenAccumulators();
  resetRetryState();

  activeConfig = config;
  activeCallbacks = callbacks;
  activeMicDeviceId = micDeviceId;

  client = new SonioxClient({
    api_key: async () => {
      const key = await getApiKey();
      if (!key) throw new Error("No Soniox API key configured");
      return key;
    },
    permissions: new BrowserPermissionResolver(),
  });

  connectRecording(config, callbacks, micDeviceId);
}

function cleanup(): void {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
  flushLogQueue();
  resetTokenAccumulators();
  resetRetryState();
  activeConfig = null;
  activeCallbacks = null;
  activeMicDeviceId = undefined;
}

/** Gracefully stop the active recording and flush pending log entries. */
export function stopTranscription(): void {
  if (state === SonioxState.Idle) return;
  state = SonioxState.Stopping;
  cleanup();
  if (recording) {
    recording.stop().catch(() => {});
    recording = null;
  }
  client = null;
  state = SonioxState.Idle;
}

/** Pause audio capture; the SDK sends keepalive messages to prevent timeout. */
export function pauseTranscription(): void {
  if (state !== SonioxState.Recording || !recording) return;
  recording.pause();
}

/** Resume audio capture after a pause. */
export function resumeTranscription(): void {
  if (!recording || recording.state !== "paused") return;
  recording.resume();
}

/** Immediately cancel the active recording without waiting for final results. */
export function cancelTranscription(): void {
  if (state === SonioxState.Idle) return;
  state = SonioxState.Stopping;
  cleanup();
  if (recording) {
    recording.cancel();
    recording = null;
  }
  client = null;
  state = SonioxState.Idle;
}

/** Return whether the microphone is actively recording and its current state. */
export function getAudioHealth(): { active: boolean; state: RecordingState } {
  return {
    active: state === SonioxState.Recording,
    state: recording?.state ?? "idle",
  };
}
