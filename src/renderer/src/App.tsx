import { createSignal, createMemo, onMount, onCleanup, Show, batch, lazy } from "solid-js";
import type { TranscriptEntry, TranslationEntry, AppConfig } from "./lib/types";
import { hasApiKey, getConfig, startSession, stopSession, ensureMicAccess } from "./lib/ipc";
import {
  startTranscription,
  stopTranscription,
  cancelTranscription,
  getWordCount,
} from "./lib/soniox";
import StatsBar from "./components/StatsBar";
import Controls from "./components/Controls";
import { SpeechPane, TranslationPane } from "./components/TranscriptPane";

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
      const micAccess = await ensureMicAccess();
      if (micAccess === "denied") {
        pushSttEntry({
          id: entryId++,
          timestamp: "",
          text: "[ERROR] Microphone access denied. Please grant permission and try again.",
          isPartial: false,
        });
        handleStopped();
        return;
      }
      if (micAccess === "opened-settings") {
        pushSttEntry({
          id: entryId++,
          timestamp: "",
          text: "[INFO] Please enable microphone access in Windows Settings, then try again.",
          isPartial: false,
        });
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

  const BADGE_CLASS = {
    standby: "badge-idle",
    loading: "badge-loading",
    live: "badge-live",
  } as const;

  const badgeClass = createMemo(() => BADGE_CLASS[status()]);

  return (
    <>
      <div class="grain fixed inset-0 pointer-events-none z-[9999] opacity-[0.02] light:opacity-[0.012] bg-repeat" />

      {/* Ambient floating orbs */}
      <div class={`ambient-orb ambient-orb-1 ${running() ? "is-active" : ""}`} />
      <div class={`ambient-orb ambient-orb-2 ${running() ? "is-active" : ""}`} />
      <div class={`ambient-orb ambient-orb-3 ${running() ? "is-active" : ""}`} />

      <header class="stagger-1 flex items-center justify-between h-[52px] px-5 bg-raised border-b border-border shrink-0 relative z-10">
        {/* Header underglow */}
        <div class={`header-underglow ${status() === "live" ? "is-live" : ""}`} />

        <div class="flex items-center gap-3">
          <div
            class={`brand-mark w-8 h-8 rounded-[7px] flex items-center justify-center font-ui font-extrabold text-[15px] text-bg light:text-white relative overflow-hidden ${running() ? "brand-mark-live" : ""}`}
          >
            <span>E</span>
            <div class="brand-mark-shine absolute inset-0" />
          </div>
          <div class="flex flex-col">
            <span class="text-[15px] font-bold text-tx tracking-wide leading-tight">
              ExpressText
            </span>
            <span class="text-[11px] font-medium text-tx-4 tracking-wider uppercase leading-tight">
              Transcribe & Translate
            </span>
          </div>

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

        {/* Flow arrow connecting panes */}
        <div class="flex items-center justify-center w-8 shrink-0">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            class={`text-tx-4 transition-all duration-300 ${running() ? "flow-arrow-live text-amber" : "opacity-50"}`}
          >
            <path
              d="M6 3l5 5-5 5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <TranslationPane entries={transEntries} live={running} />
      </main>

      <Show when={showSettings()}>
        <SettingsModal onClose={() => setShowSettings(false)} onSaved={() => {}} />
      </Show>
    </>
  );
}
