import { createSignal, createMemo, onMount, onCleanup, Show, batch, lazy } from "solid-js";
import type { TranscriptEntry, TranslationEntry, AppConfig } from "./lib/types";
import { hasApiKey, getConfig, startSession, stopSession, ensureMicAccess } from "./lib/ipc";
import {
  startTranscription,
  stopTranscription,
  cancelTranscription,
  getWordCount,
} from "./lib/soniox";
import { createPerfMonitor } from "./lib/perf";
import StatsBar from "./components/StatsBar";
import Controls from "./components/Controls";
import { SpeechPane, TranslationPane } from "./components/TranscriptPane";
import ToastContainer from "./components/Toast";
import { reportError, capturePromise } from "./lib/errors";
import logoDarkSrc from "./assets/logo-dark.png";
import logoLightSrc from "./assets/logo.png";

const SettingsModal = lazy(() => import("./components/SettingsModal"));
const PerfOverlay = lazy(() => import("./components/PerfOverlay"));

const MAX_ENTRIES = 500;

export default function App() {
  const [running, setRunning] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [config, setConfig] = createSignal<AppConfig | null>(null);

  const [status, setStatus] = createSignal<"standby" | "loading" | "live">("standby");
  const [statusText, setStatusText] = createSignal("Standby");

  const [latency, setLatency] = createSignal("\u2014");
  const [words, setWords] = createSignal(0);
  const [uptime, setUptime] = createSignal("00:00:00");

  const [sttEntries, setSttEntries] = createSignal<TranscriptEntry[]>([]);
  const [transEntries, setTransEntries] = createSignal<TranslationEntry[]>([]);
  const [sttCount, setSttCount] = createSignal(0);

  const perf = createPerfMonitor();

  let entryId = 0;
  let uptimeInterval: ReturnType<typeof setInterval> | undefined;
  let startTime = 0;

  function onKeyDown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
      e.preventDefault();
      perf.toggle();
    }
  }

  onMount(async () => {
    document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";
    document.addEventListener("keydown", onKeyDown);
    try {
      setConfig(await getConfig());
    } catch (err) {
      reportError("config", "Failed to load config, using defaults.", err);
    }
    if (!(await hasApiKey())) setShowSettings(true);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", onKeyDown);
    if (uptimeInterval) clearInterval(uptimeInterval);
    cancelTranscription();
  });

  function updateUptime() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const hrs = String(Math.floor(elapsed / 3600)).padStart(2, "0");
    const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    setUptime(`${hrs}:${mins}:${secs}`);
  }

  function pushSttEntry(entry: TranscriptEntry) {
    setSttEntries((prev) => {
      if (prev.length >= MAX_ENTRIES) prev.shift();
      return [...prev, entry];
    });
  }

  function pushTransEntry(entry: TranslationEntry) {
    setTransEntries((prev) => {
      if (prev.length >= MAX_ENTRIES) prev.shift();
      return [...prev, entry];
    });
  }

  async function handleStart(micDeviceId: string) {
    if (running()) return;
    const cfg = config();
    if (!cfg) return;

    setRunning(true);
    setStatus("loading");
    setStatusText("Starting\u2026");

    try {
      const micAccess = await ensureMicAccess();
      if (micAccess === "denied") {
        reportError("mic", "Microphone access denied. Please grant permission and try again.");
        handleStopped();
        return;
      }
      if (micAccess === "opened-settings") {
        reportError("mic", "Please enable microphone access in Settings, then try again.");
        handleStopped();
        return;
      }

      await startSession();
      await startTranscription(
        cfg,
        {
          onTranscript(timestamp, text, isPartial) {
            if (!isPartial && !text.trim()) return;
            pushSttEntry({ id: entryId++, timestamp, text, isPartial });
            if (!isPartial) setSttCount((c) => c + 1);
          },
          onTranslation(timestamp, text, latencyMs) {
            batch(() => {
              pushTransEntry({ id: entryId++, timestamp, text });
              setWords(getWordCount());
              setLatency(`${(Math.abs(latencyMs) / 1000).toFixed(1)}s`);
            });
          },
          onError(message, isApiKeyError) {
            reportError("network", message);
            handleStopped();
            if (isApiKeyError) {
              setShowSettings(true);
            }
          },
          onStateChange(state) {
            if (state === "started") {
              startTime = Date.now();
              setStatus("live");
              setStatusText("On Air");
              uptimeInterval = setInterval(updateUptime, 1000);
            } else if (state === "stopped") {
              handleStopped();
            } else if (state === "loading") {
              setStatus("loading");
              setStatusText("Loading\u2026");
            }
          },
        },
        micDeviceId || undefined,
      );
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      const isApiKeyError = /api.key|unauthorized|invalid.*key|no soniox/i.test(err.message);
      reportError(isApiKeyError ? "api-key" : "unknown", err.message, e);
      if (isApiKeyError) setShowSettings(true);
      handleStopped();
    }
  }

  function handleStop() {
    stopTranscription();
    capturePromise("session", stopSession());
    handleStopped();
  }

  function handleStopped() {
    setRunning(false);
    setStatus("standby");
    setStatusText("Standby");
    if (uptimeInterval) {
      clearInterval(uptimeInterval);
      uptimeInterval = undefined;
    }
  }

  function handleClear() {
    batch(() => {
      setSttEntries([]);
      setTransEntries([]);
      setSttCount(0);
      setWords(0);
      setLatency("\u2014");
    });
    entryId = 0;
  }

  const BADGE_CLASS = {
    standby: "badge-idle",
    loading: "badge-loading",
    live: "badge-live",
  } as const;

  const badgeClass = createMemo(() => BADGE_CLASS[status()]);

  return (
    <>
      <header class="stagger-1 flex items-center justify-between h-[60px] px-5 bg-raised border-b border-border shrink-0 relative z-10 surface-raised-sm">
        <div class="flex items-center gap-3">
          <img
            src={logoDarkSrc}
            alt="Express 24/7"
            class="h-10 w-auto object-contain dark:block light:hidden"
          />
          <img
            src={logoLightSrc}
            alt="Express 24/7"
            class="h-10 w-auto object-contain dark:hidden light:block"
          />

          <div class="w-px h-6 bg-border mx-1" />

          <StatsBar latency={latency} words={words} uptime={uptime} live={running} />
        </div>

        <div class="flex items-center gap-2">
          <div
            class={`flex items-center gap-1.5 py-1.5 pl-3 pr-3.5 border rounded-full text-[12px] font-bold tracking-wider transition-all duration-300 ${badgeClass()}`}
          >
            <span class="status-dot w-[7px] h-[7px] rounded-full shrink-0 transition-all duration-300" />
            <span>{statusText()}</span>
          </div>
        </div>
      </header>

      <div class="stagger-2">
        <Controls
          running={running}
          onStart={handleStart}
          onStop={handleStop}
          onClear={handleClear}
          onSettings={() => setShowSettings(true)}
        />
      </div>

      <main class="stagger-3 flex flex-1 min-h-0 overflow-hidden p-3 gap-0 bg-bg">
        <SpeechPane entries={sttEntries} finalCount={sttCount} live={running} />

        <div class="w-3 shrink-0" />

        <TranslationPane entries={transEntries} live={running} />
      </main>

      <ToastContainer />

      <Show when={showSettings()}>
        <SettingsModal onClose={() => setShowSettings(false)} onSaved={() => {}} />
      </Show>

      <Show when={perf.enabled()}>
        <PerfOverlay
          fps={perf.fps}
          ipcRtt={perf.ipcRtt}
          mainCpu={perf.mainCpu}
          rendererCpu={perf.rendererCpu}
          mainMemory={perf.mainMemory}
          rendererMemory={perf.rendererMemory}
          eventLoopLag={perf.eventLoopLag}
          latency={latency}
          words={words}
          uptime={uptime}
          onClose={perf.toggle}
        />
      </Show>
    </>
  );
}
