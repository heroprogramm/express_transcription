import { createSignal, createMemo, onMount, onCleanup, Show, batch, lazy } from "solid-js";
import type { TranscriptEntry, TranslationEntry, AppConfig } from "./lib/types";
import { hasApiKey, getConfig, startSession, stopSession } from "./lib/tauri-bridge";
import {
  startTranscription,
  stopTranscription,
  cancelTranscription,
  getWordCount,
} from "./lib/soniox";
import StatsBar from "./components/StatsBar";
import Controls from "./components/Controls";
import { SttPane, TranslationPane } from "./components/TranscriptPane";

const SettingsModal = lazy(() => import("./components/SettingsModal"));

const MAX_ENTRIES = 500;

export default function App() {
  const [running, setRunning] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [config, setConfig] = createSignal<AppConfig | null>(null);

  const [status, setStatus] = createSignal<"standby" | "loading" | "live">("standby");
  const [statusText, setStatusText] = createSignal("Standby");

  const [latency, setLatency] = createSignal("\u2014");
  const [words, setWords] = createSignal(0);
  const [uptime, setUptime] = createSignal("00:00");

  const [sttEntries, setSttEntries] = createSignal<TranscriptEntry[]>([]);
  const [transEntries, setTransEntries] = createSignal<TranslationEntry[]>([]);
  const [sttCount, setSttCount] = createSignal(0);

  let entryId = 0;
  let uptimeInterval: ReturnType<typeof setInterval> | undefined;
  let startTime = 0;

  onMount(async () => {
    document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";
    try {
      setConfig(await getConfig());
    } catch {}
    if (!(await hasApiKey())) setShowSettings(true);
  });

  onCleanup(() => {
    if (uptimeInterval) clearInterval(uptimeInterval);
    cancelTranscription();
  });

  function updateUptime() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    setUptime(`${mins}:${secs}`);
  }

  function pushSttEntry(entry: TranscriptEntry) {
    setSttEntries((prev) => {
      if (prev.length >= MAX_ENTRIES) {
        const next = prev.slice(-(MAX_ENTRIES - 1));
        next.push(entry);
        return next;
      }
      return [...prev, entry];
    });
  }

  function pushTransEntry(entry: TranslationEntry) {
    setTransEntries((prev) => {
      if (prev.length >= MAX_ENTRIES) {
        const next = prev.slice(-(MAX_ENTRIES - 1));
        next.push(entry);
        return next;
      }
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
              if (latencyMs >= 0) {
                setLatency(`${(latencyMs / 1000).toFixed(1)}s`);
              }
            });
          },
          onError(message, isApiKeyError) {
            pushSttEntry({
              id: entryId++,
              timestamp: "",
              text: `[ERROR] ${message}`,
              isPartial: false,
            });
            if (isApiKeyError) {
              handleStopped();
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
    } catch (e) {
      const msg = String(e);
      pushSttEntry({ id: entryId++, timestamp: "", text: `[ERROR] ${msg}`, isPartial: false });
      handleStopped();
      if (/api.key|unauthorized|invalid.*key|no soniox/i.test(msg)) setShowSettings(true);
    }
  }

  function handleStop() {
    stopTranscription();
    stopSession().catch(() => {});
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

  const badgeClass = createMemo(() =>
    status() === "live" ? "badge-live" : status() === "loading" ? "badge-loading" : "",
  );

  return (
    <>
      <div class="grain fixed inset-0 pointer-events-none z-[9999] opacity-[0.025] light:opacity-[0.015] bg-repeat" />

      <header class="flex items-center justify-between h-[60px] px-6 bg-raised border-b border-border shrink-0 relative z-10">
        <div class="flex items-center gap-3.5">
          <div class="brand-mark w-9 h-9 rounded-md flex items-center justify-center font-ui font-extrabold text-[17px] text-bg light:text-white relative overflow-hidden">
            <span>E</span>
            <div class="brand-mark-shine absolute inset-0" />
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="text-[15px] font-bold text-tx tracking-wide">Express 24/7</span>
            <span class="text-[11px] font-medium text-tx-3 tracking-wide">Live Transcription</span>
          </div>
        </div>

        <StatsBar latency={latency} words={words} uptime={uptime} />

        <div class="flex items-center gap-2.5">
          <div
            class={`flex items-center gap-2 py-[7px] pl-3 pr-4 border border-border-lit rounded-full bg-surface text-xs font-bold tracking-wider text-tx-3 transition-all duration-400 ${badgeClass()}`}
          >
            <span class="status-dot w-2 h-2 rounded-full bg-tx-4 shrink-0 transition-all duration-400" />
            <span>{statusText()}</span>
          </div>
        </div>
      </header>

      <Controls
        running={running}
        onStart={handleStart}
        onStop={handleStop}
        onClear={handleClear}
        onSettings={() => setShowSettings(true)}
      />

      <main class="flex flex-1 min-h-0 overflow-hidden p-4 gap-4 bg-bg">
        <SttPane entries={sttEntries} finalCount={sttCount} />
        <TranslationPane entries={transEntries} />
      </main>

      <Show when={showSettings()}>
        <SettingsModal onClose={() => setShowSettings(false)} onSaved={() => {}} />
      </Show>
    </>
  );
}
