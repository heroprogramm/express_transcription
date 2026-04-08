import { SonioxClient, type SpeechToTextAPIResponse, type Token } from "@soniox/speech-to-text-web";
import type { AppConfig } from "./types";
import { getApiKey, logTranslation } from "./ipc";

export interface SonioxCallbacks {
  onTranscript: (timestamp: string, text: string, isPartial: boolean) => void;
  onTranslation: (timestamp: string, text: string, latencyMs: number) => void;
  onError: (message: string, isApiKeyError: boolean) => void;
  onStateChange: (state: "started" | "stopped" | "loading") => void;
}

let client: SonioxClient | null = null;
let activeStream: MediaStream | null = null;
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
  const batch = logQueue;
  logQueue = [];
  for (const { ts, text } of batch) {
    logTranslation(ts, text).catch(() => {});
  }
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const secs = String(totalSec % 60).padStart(2, "0");
  const millis = String(ms % 1000).padStart(3, "0");
  return `${hours}:${mins}:${secs}.${millis}`;
}

function parseTokens(tokens: Token[]): {
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
    apiKey: async () => {
      const key = await getApiKey();
      if (!key) throw new Error("No Soniox API key configured");
      return key;
    },
    keepAlive: true,
    keepAliveInterval: 5000,
  });

  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
  };
  if (micDeviceId) {
    audioConstraints.deviceId = { exact: micDeviceId };
  }

  try {
    activeStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotReadableError" || name === "NotAllowedError") {
      const hint = navigator.userAgent.includes("Mac")
        ? "Check System Settings \u2192 Privacy & Security \u2192 Microphone."
        : "Check Settings \u2192 Privacy \u2192 Microphone.";
      const micErr = new Error(`Microphone not accessible. ${hint}`);
      micErr.name = "MicAccessError";
      throw micErr;
    }
    throw err;
  }

  startTime = Date.now();

  await client.start({
    model: config.soniox.model,
    languageHints: [config.soniox.language],
    enableEndpointDetection: true,
    translation: {
      type: "one_way",
      target_language: config.soniox.translate_to,
    },
    audioConstraints,
    stream: activeStream,
    onStarted: () => {
      callbacks.onStateChange("started");
    },
    onPartialResult: (result: SpeechToTextAPIResponse) => {
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
    },
    onFinished: () => {
      callbacks.onStateChange("stopped");
    },
    onError: (status, message, errorCode) => {
      stopActiveStream();
      const isApiKeyError =
        (status === "api_error" &&
          /api.key|unauthorized|invalid.*key|authentication/i.test(message)) ||
        /no soniox api key/i.test(message);
      const detail = errorCode ? `[${status} ${errorCode}] ${message}` : `[${status}] ${message}`;
      callbacks.onError(detail, isApiKeyError);
    },
  });
}

function stopActiveStream(): void {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
}

export function stopTranscription(): void {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
  flushLogQueue();
  stopActiveStream();
  if (client) {
    client.stop();
    client = null;
  }
}

export function cancelTranscription(): void {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
  flushLogQueue();
  stopActiveStream();
  if (client) {
    client.cancel();
    client = null;
  }
}
