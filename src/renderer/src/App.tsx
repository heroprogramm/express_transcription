import { createSignal, createMemo, onMount, onCleanup, Show, batch, lazy } from "solid-js";
import type { TranscriptEntry, TranslationEntry, AppConfig } from "./lib/types";
import { hasApiKey, getConfig, startSession, stopSession, ensureMicAccess } from "./lib/ipc";
import {
  startTranscription,
  stopTranscription,
  cancelTranscription,
  getWordCount,
  queueLogTranslation,
} from "./lib/soniox";
import { createPerfMonitor } from "./lib/perf";
import StatsBar from "./components/StatsBar";
import Controls from "./components/Controls";
import Button from "./components/Button";
import ThemeToggle from "./components/ThemeToggle";
import { SpeechPane, TranslationPane } from "./components/TranscriptPane";
import OutputPane from "./components/OutputPane";
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

  const entryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextWriteIndex = 0;

  function feedDelayMs(): number {
    return (config()?.output.feed_delay_seconds ?? 10) * 1000;
  }

  function drainConfirmedQueue(): void {
    const entries = transEntries();
    const toSend: number[] = [];
    while (nextWriteIndex < entries.length && entries[nextWriteIndex].status === "confirmed") {
      const e = entries[nextWriteIndex];
      queueLogTranslation(e.timestamp, e.text);
      toSend.push(e.id);
      nextWriteIndex++;
    }
    if (toSend.length > 0) {
      const ids = new Set(toSend);
      setTransEntries((prev) =>
        prev.map((e) => (ids.has(e.id) ? { ...e, status: "sent" as const } : e)),
      );
    }
  }

  function updateEntryStatus(
    id: number,
    status: "pending" | "editing" | "confirmed" | "sent",
    text?: string,
  ): void {
    setTransEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status, ...(text !== undefined ? { text } : {}) } : e,
      ),
    );
  }

  function confirmEntry(id: number): void {
    entryTimers.delete(id);
    updateEntryStatus(id, "confirmed");
    drainConfirmedQueue();
  }

  function startEditEntry(id: number): void {
    const timer = entryTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      entryTimers.delete(id);
    }
    updateEntryStatus(id, "editing");
  }

  function saveEditEntry(id: number, text: string): void {
    updateEntryStatus(id, "confirmed", text);
    entryTimers.delete(id);
    drainConfirmedQueue();
  }

  function cancelEditEntry(id: number): void {
    updateEntryStatus(id, "pending");
    const timer = setTimeout(() => confirmEntry(id), feedDelayMs());
    entryTimers.set(id, timer);
  }

  function flushPendingEntries(): void {
    for (const [, timer] of entryTimers) clearTimeout(timer);
    entryTimers.clear();
    setTransEntries((prev) =>
      prev.map((e) =>
        e.status === "pending" || e.status === "editing"
          ? { ...e, status: "confirmed" as const }
          : e,
      ),
    );
    drainConfirmedQueue();
  }

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
      const result = await getConfig();
      setConfig(result.config);
      for (const warning of result.warnings) {
        reportError("config", warning);
      }
    } catch (err) {
      reportError("config", "Failed to load config, using defaults.", err);
    }
    if (!(await hasApiKey())) setShowSettings(true);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", onKeyDown);
    if (uptimeInterval) clearInterval(uptimeInterval);
    for (const [, timer] of entryTimers) clearTimeout(timer);
    entryTimers.clear();
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
            const thisId = entryId++;
            batch(() => {
              pushTransEntry({
                id: thisId,
                timestamp,
                text,
                status: "pending",
                createdAt: Date.now(),
              });
              setWords(getWordCount());
              setLatency(`${(Math.abs(latencyMs) / 1000).toFixed(1)}s`);
            });
            const timer = setTimeout(() => confirmEntry(thisId), feedDelayMs());
            entryTimers.set(thisId, timer);
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
    flushPendingEntries();
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
    for (const [, timer] of entryTimers) clearTimeout(timer);
    entryTimers.clear();
    nextWriteIndex = 0;
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

        <div class="flex items-center gap-3">
          <Button
            variant="icon"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            class="gear-spin"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Button>

          <ThemeToggle />

          <div class="w-px h-6 bg-border" />

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
        />
      </div>

      <div class="stagger-3 flex flex-col flex-1 min-h-0 bg-bg">
        <main class="flex min-h-0 overflow-hidden p-3 gap-0" style={{ flex: "7" }}>
          <SpeechPane entries={sttEntries} finalCount={sttCount} live={running} />

          <div class="w-3 shrink-0" />

          <TranslationPane
            entries={transEntries}
            live={running}
            feedDelayMs={feedDelayMs}
            onStartEdit={startEditEntry}
            onSaveEdit={saveEditEntry}
            onCancelEdit={cancelEditEntry}
          />
        </main>

        <OutputPane entries={transEntries} />
      </div>

      <ToastContainer />

      <Show when={showSettings()}>
        <SettingsModal
          config={config()}
          onClose={() => setShowSettings(false)}
          onSaved={(c) => setConfig(c)}
        />
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
