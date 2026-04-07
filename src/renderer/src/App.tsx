import { createSignal, onMount, onCleanup, Show } from "solid-js";
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
import SettingsModal from "./components/SettingsModal";

const MAX_ENTRIES = 500;

export default function App() {
  const [running, setRunning] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [, setKeyReady] = createSignal(false);
  const [config, setConfig] = createSignal<AppConfig | null>(null);

  // Status
  const [status, setStatus] = createSignal<"standby" | "loading" | "live">("standby");
  const [statusText, setStatusText] = createSignal("Standby");

  // Stats
  const [latency, setLatency] = createSignal("\u2014");
  const [words, setWords] = createSignal(0);
  const [uptime, setUptime] = createSignal("00:00");

  // Transcripts
  const [sttEntries, setSttEntries] = createSignal<TranscriptEntry[]>([]);
  const [transEntries, setTransEntries] = createSignal<TranslationEntry[]>([]);
  const [sttCount, setSttCount] = createSignal(0);
  const [transCount, setTransCount] = createSignal(0);

  let entryId = 0;
  let uptimeInterval: ReturnType<typeof setInterval> | undefined;
  let startTime = 0;

  onMount(async () => {
    // Apply saved theme
    document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";

    try {
      const cfg = await getConfig();
      setConfig(cfg);
    } catch {
      // Use defaults if config fails
    }

    const hasKey = await hasApiKey();
    setKeyReady(hasKey);
    if (!hasKey) setShowSettings(true);
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

  async function handleStart(_micDeviceId: string) {
    if (running()) return;
    const cfg = config();
    if (!cfg) return;

    setRunning(true);
    setStatus("loading");
    setStatusText("Starting\u2026");
    startTime = Date.now();

    try {
      await startSession();
      await startTranscription(cfg, {
        onTranscript(timestamp, text, isPartial) {
          if (!isPartial && !text.trim()) return;

          setSttEntries((prev) => {
            const next = [
              ...prev,
              { id: entryId++, timestamp, text, isPartial },
            ];
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
          });

          if (!isPartial) {
            setSttCount((c) => c + 1);
          }
        },
        onTranslation(timestamp, text) {
          setTransEntries((prev) => {
            const next = [
              ...prev,
              { id: entryId++, timestamp, text },
            ];
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
          });
          setTransCount((c) => c + 1);
          setWords(getWordCount());

          // Compute latency from timestamp
          const parts = timestamp.split(/[:.]/).map(Number);
          if (parts.length === 4) {
            const ms = parts[0] * 3600000 + parts[1] * 60000 + parts[2] * 1000 + parts[3];
            const elapsed = Date.now() - startTime;
            const lat = (elapsed - ms) / 1000;
            if (lat >= 0) setLatency(`${lat.toFixed(1)}s`);
          }
        },
        onError(message, isApiKeyError) {
          setSttEntries((prev) => [
            ...prev,
            { id: entryId++, timestamp: "", text: `[ERROR] ${message}`, isPartial: false },
          ]);
          if (isApiKeyError) {
            handleStopped();
            setShowSettings(true);
          }
        },
        onStateChange(state) {
          if (state === "started") {
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
      });
    } catch (e) {
      const msg = String(e);
      setSttEntries((prev) => [
        ...prev,
        { id: entryId++, timestamp: "", text: `[ERROR] ${msg}`, isPartial: false },
      ]);
      handleStopped();
      if (/api.key|unauthorized|invalid.*key|no soniox/i.test(msg)) {
        setShowSettings(true);
      }
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
    setSttEntries([]);
    setTransEntries([]);
    setSttCount(0);
    setTransCount(0);
    setWords(0);
    setLatency("\u2014");
    entryId = 0;
  }

  return (
    <>
      <div class="grain" />

      {/* Top Bar */}
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">
            <span>E</span>
            <div class="brand-mark-shine" />
          </div>
          <div class="brand-text">
            <span class="brand-name">Express 24/7</span>
            <span class="brand-sub">Live Transcription</span>
          </div>
        </div>

        <StatsBar latency={latency} words={words} uptime={uptime} />

        <div class="topbar-right">
          <div
            class={`status-badge ${status() === "live" ? "live" : status() === "loading" ? "loading" : ""}`}
          >
            <span class="status-dot" />
            <span>{statusText()}</span>
          </div>
        </div>
      </header>

      {/* Controls */}
      <Controls
        running={running}
        onStart={handleStart}
        onStop={handleStop}
        onClear={handleClear}
        onSettings={() => setShowSettings(true)}
      />

      {/* Main Content */}
      <main class="workspace">
        <SttPane entries={sttEntries} count={sttCount} />
        <TranslationPane entries={transEntries} count={transCount} />
      </main>

      {/* Settings Modal */}
      <Show when={showSettings()}>
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => setKeyReady(true)}
        />
      </Show>
    </>
  );
}
