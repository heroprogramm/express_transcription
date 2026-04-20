import {
  SonioxClient,
  BrowserPermissionResolver,
  MicrophoneSource,
  AuthError,
  BadRequestError,
  QuotaError,
  ConnectionError,
  NetworkError,
  type Recording,
  type RealtimeResult,
  type RecordingState,
} from "@soniox/client";
import type { AppConfig } from "@/lib/types";
import { getApiKey, logTranslationsBatch } from "@/lib/ipc";
import { reportError } from "@/lib/errors";
import { SONIOX_BASE_DELAY_MS, LOG_FLUSH_INTERVAL_MS } from "@shared/timings";

/** Callbacks invoked by the Soniox recording lifecycle. */
export interface SonioxCallbacks {
  onTranscript: (
    startTime: string,
    endTime: string | undefined,
    text: string,
    isPartial: boolean,
  ) => void;
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
let firstOriginalStartMs: number | undefined;
let lastOriginalEndMs: number | undefined;
let firstTranslatedStartMs: number | undefined;

// ── Reconnection state ──
const MAX_RETRIES = 5;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let activeConfig: AppConfig | null = null;
let activeCallbacks: SonioxCallbacks | null = null;
let activeMicDeviceId: string | undefined;

// ── IPC batching ──
let logQueue: { ts: string; text: string }[] = [];
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;

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
  firstOriginalStartMs = undefined;
  lastOriginalEndMs = undefined;
  firstTranslatedStartMs = undefined;
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
  return Math.min(SONIOX_BASE_DELAY_MS * 2 ** retryCount, 16000);
}

function attemptReconnect(): void {
  if (isInactive() || !activeConfig || !activeCallbacks || retryTimer) return;
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

function userFacingErrorMessage(err: Error): string {
  if (/no soniox api key/i.test(err.message)) return "No Soniox API key configured.";
  if (err instanceof AuthError) return "Invalid or expired API key. Please update it in Settings.";
  if (err instanceof BadRequestError) return "Bad request — check your transcription settings.";
  if (err instanceof QuotaError) {
    const statusCode = (err as QuotaError).statusCode;
    if (statusCode === 402) return "Payment required — your Soniox plan needs billing attention.";
    return "Too many requests — please wait a moment and try again.";
  }
  if (err instanceof NetworkError) {
    const statusCode = (err as NetworkError).statusCode;
    if (statusCode === 408) return "Request timed out — please try again.";
    if (statusCode === 503)
      return "Soniox service is temporarily unavailable. Please try again later.";
    return "Soniox server error — please try again later.";
  }
  if (err instanceof ConnectionError) return "Connection failed — check your internet connection.";
  return err.message;
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

    // Accumulate finals, collect current non-finals (reset each result).
    const nonFinalOriginal: string[] = [];
    const nonFinalTranslated: string[] = [];
    let partialOriginalStartMs: number | undefined;
    let partialOriginalEndMs: number | undefined;

    for (const token of result.tokens) {
      if (token.is_final) {
        if (token.translation_status === "translation") {
          if (firstTranslatedStartMs === undefined) firstTranslatedStartMs = token.start_ms;
          finalTranslatedParts.push(token.text);
        } else {
          if (firstOriginalStartMs === undefined) firstOriginalStartMs = token.start_ms;
          if (token.end_ms !== undefined) lastOriginalEndMs = token.end_ms;
          finalOriginalParts.push(token.text);
        }
      } else if (token.translation_status === "translation") {
        nonFinalTranslated.push(token.text);
      } else {
        if (partialOriginalStartMs === undefined) partialOriginalStartMs = token.start_ms;
        if (token.end_ms !== undefined) partialOriginalEndMs = token.end_ms;
        nonFinalOriginal.push(token.text);
      }
    }

    const fullOriginal = finalOriginalParts.join("") + nonFinalOriginal.join("");
    const fullTranslated = finalTranslatedParts.join("") + nonFinalTranslated.join("");

    if (fullOriginal) {
      const start = formatTimestamp(firstOriginalStartMs ?? partialOriginalStartMs ?? 0);
      const endMs = lastOriginalEndMs ?? partialOriginalEndMs;
      const end = endMs !== undefined ? formatTimestamp(endMs) : undefined;
      if (nonFinalOriginal.length === 0 && finalOriginalParts.length > 0) {
        callbacks.onTranscript(start, end, fullOriginal, false);
        finalOriginalParts = [];
        firstOriginalStartMs = undefined;
        lastOriginalEndMs = undefined;
      } else {
        callbacks.onTranscript(start, end, fullOriginal, true);
      }
    }

    if (nonFinalTranslated.length === 0 && finalTranslatedParts.length > 0) {
      wordCount += fullTranslated.split(/\s+/).filter(Boolean).length;
      const latencyMs = elapsed - result.total_audio_proc_ms;
      callbacks.onTranslation(
        formatTimestamp(firstTranslatedStartMs ?? 0),
        fullTranslated,
        latencyMs,
      );
      finalTranslatedParts = [];
      firstTranslatedStartMs = undefined;
    }
  }

  function handleError(err: Error): void {
    if (isInactive()) return;

    if (isTransientError(err) && retryCount < MAX_RETRIES) {
      attemptReconnect();
      return;
    }

    const isApiKeyError = err instanceof AuthError || /no soniox api key/i.test(err.message);
    callbacks.onError(userFacingErrorMessage(err), isApiKeyError);
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
