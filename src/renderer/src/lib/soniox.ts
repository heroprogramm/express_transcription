import { SonioxClient, type SpeechToTextAPIResponse, type Token } from "@soniox/speech-to-text-web";
import type { AppConfig } from "./types";
import { getApiKey, logTranslation } from "./tauri-bridge";

export interface SonioxCallbacks {
  onTranscript: (timestamp: string, text: string, isPartial: boolean) => void;
  onTranslation: (timestamp: string, text: string) => void;
  onError: (message: string, isApiKeyError: boolean) => void;
  onStateChange: (state: "started" | "stopped" | "loading") => void;
}

let client: SonioxClient | null = null;
let startTime = 0;
let wordCount = 0;

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
  hasEnd: boolean;
} {
  const originalParts: string[] = [];
  const translatedParts: string[] = [];
  let hasEnd = false;

  for (const t of tokens) {
    if (t.text === "<end>" || t.text === "<fin>") {
      hasEnd = true;
      continue;
    }
    if (t.translation_status === "translation") {
      translatedParts.push(t.text);
    } else {
      originalParts.push(t.text);
    }
  }

  return {
    original: originalParts.join(""),
    translated: translatedParts.length > 0 ? translatedParts.join("") : null,
    hasEnd,
  };
}

export function getWordCount(): number {
  return wordCount;
}

export function getStartTime(): number {
  return startTime;
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
    onStarted: () => {
      callbacks.onStateChange("started");
    },
    onPartialResult: (result: SpeechToTextAPIResponse) => {
      const elapsed = Date.now() - startTime;
      const ts = formatTimestamp(elapsed);
      const { original, translated, hasEnd } = parseTokens(result.tokens);
      const isPartial = !hasEnd;

      if (original) {
        callbacks.onTranscript(ts, original, isPartial);
      }

      if (translated) {
        wordCount += translated.split(/\s+/).filter(Boolean).length;
        callbacks.onTranslation(ts, translated);
        logTranslation(ts, translated).catch(() => {});
      }
    },
    onFinished: () => {
      callbacks.onStateChange("stopped");
    },
    onError: (status, message, errorCode) => {
      const isApiKeyError =
        status === "api_error" &&
        (errorCode === 401 || /api.key|unauthorized|invalid.*key|authentication/i.test(message));
      callbacks.onError(message, isApiKeyError);
    },
  });
}

export function stopTranscription(): void {
  if (client) {
    client.stop();
    client = null;
  }
}

export function cancelTranscription(): void {
  if (client) {
    client.cancel();
    client = null;
  }
}
