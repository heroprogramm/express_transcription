import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  Show,
  lazy,
  ErrorBoundary,
} from "solid-js";
import { Settings } from "lucide-solid";
import { secondsToMs, type AppConfig, VizConnection } from "@/lib/types";
import {
  hasApiKey,
  getConfig,
  startSession,
  stopSession,
  ensureMicAccess,
  onOpenSettings,
  onUpdateStatus,
  restartForUpdate,
  vizSendText,
  vizToggleScroll,
  vizGetStatus,
  copyToClipboard,
} from "@/lib/ipc";
import { startTranscription, stopTranscription, cancelTranscription } from "@/lib/soniox";
import { createPerfMonitor } from "@/lib/perf";
import { createEntryManager } from "@/lib/entry-manager";
import StatsBar from "@/components/StatsBar";
import Controls from "@/components/Controls";
import Button from "@/components/Button";
import ThemeToggle from "@/components/ThemeToggle";
import SpeechPane from "@/components/SpeechPane";
import TranslationPane from "@/components/TranslationPane";
import VizPane from "@/components/VizPane";
import ResizeHandle from "@/components/ResizeHandle";
import ToastContainer, { showToast } from "@/components/Toast";
import { reportError, capturePromise } from "@/lib/errors";
import logoDarkSrc from "@/assets/logo-dark.png";
import logoLightSrc from "@/assets/logo.png";

const SettingsModal = lazy(() => import("@/components/SettingsModal"));
const PerfOverlay = lazy(() => import("@/components/PerfOverlay"));

/** Root application component managing transcription sessions, layout, and global state. */
export default function App() {
  const [running, setRunning] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [config, setConfig] = createSignal<AppConfig | null>(null);
  const [activeMicId, setActiveMicId] = createSignal("");

  const [status, setStatus] = createSignal<"standby" | "loading" | "live">("standby");
  const [statusText, setStatusText] = createSignal("Standby");
  const [uptime, setUptime] = createSignal("00:00:00");

  const [hSplit, setHSplit] = createSignal(50);
  const [vSplit, setVSplit] = createSignal(60);

  let mainRef: HTMLElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let uptimeInterval: ReturnType<typeof setInterval> | undefined;
  let startTime = 0;

  function reviewTimeMs(): number {
    return secondsToMs(config()?.output.review_time_seconds ?? 10);
  }

  const entries = createEntryManager(reviewTimeMs);
  const perf = createPerfMonitor();

  // ── Viz Engine auto-send ──
  let lastVizSentCount = 0;
  createEffect(() => {
    const sent = entries.sentEntries();
    if (sent.length > lastVizSentCount) {
      for (let i = lastVizSentCount; i < sent.length; i++) {
        vizSendText(sent[i].text).catch((err) =>
          reportError("viz", err instanceof Error ? err.message : String(err)),
        );
      }
      lastVizSentCount = sent.length;
    }
  });

  // ── Resize handlers ──

  function onHResize(delta: number) {
    if (!mainRef) return;
    const width = mainRef.clientWidth;
    setHSplit((prev) => Math.max(20, Math.min(80, prev + (delta / width) * 100)));
  }

  function onVResize(delta: number) {
    if (!containerRef) return;
    const height = containerRef.clientHeight;
    setVSplit((prev) => Math.max(30, Math.min(85, prev + (delta / height) * 100)));
  }

  // ── Keyboard ──

  function onKeyDown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
      e.preventDefault();
      perf.toggle();
    }
    // Ctrl+Space: toggle Viz scroll
    if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
      e.preventDefault();
      vizGetStatus()
        .then((s) => {
          if (s.connection === VizConnection.Connected && s.hasData) {
            vizToggleScroll(!s.isAnimating).catch(() => {});
          }
        })
        .catch(() => {});
      return;
    }
    const tag = (e.target as HTMLElement)?.tagName;
    if (
      e.key === " " &&
      tag !== "INPUT" &&
      tag !== "TEXTAREA" &&
      tag !== "SELECT" &&
      tag !== "BUTTON"
    ) {
      e.preventDefault();
      if (running()) {
        handleStop();
      } else {
        handleStart(activeMicId());
      }
    }
  }

  // ── Lifecycle ──

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

  const cleanupSettingsListener = onOpenSettings(() => setShowSettings(true));

  const cleanupUpdateListener = onUpdateStatus((status, detail) => {
    if (status === "downloading") {
      showToast(`Downloading update${detail ? ` v${detail}` : ""}\u2026`, "info");
    } else if (status === "ready") {
      showToast(`Update${detail ? ` v${detail}` : ""} ready \u2014 restart to apply`, "info", {
        label: "Restart",
        onClick: () => restartForUpdate(),
      });
    } else if (status === "up-to-date") {
      showToast("You\u2019re on the latest version", "info");
    } else if (status === "error") {
      showToast(`Update check failed${detail ? `: ${detail}` : ""}`, "error");
    }
  });

  onCleanup(() => {
    cleanupSettingsListener();
    cleanupUpdateListener();
    document.removeEventListener("keydown", onKeyDown);
    if (uptimeInterval) clearInterval(uptimeInterval);
    cancelTranscription();
  });

  // ── Uptime ──

  function updateUptime() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const hrs = String(Math.floor(elapsed / 3600)).padStart(2, "0");
    const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    setUptime(`${hrs}:${mins}:${secs}`);
  }

  // ── Session control ──

  async function handleStart(micDeviceId: string) {
    if (running()) return;
    const cfg = config();
    if (!cfg) return;
    setActiveMicId(micDeviceId);

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
          onTranscript: entries.pushStt,
          onTranslation: entries.pushTranslation,
          onError(message, isApiKeyError) {
            reportError("network", message);
            handleStopped();
            if (isApiKeyError) {
              setShowSettings(true);
            }
          },
          onStateChange(state) {
            if (state === "started") {
              if (!uptimeInterval) {
                startTime = Date.now();
                updateUptime();
                uptimeInterval = setInterval(updateUptime, 1000);
              }
              setStatus("live");
              setStatusText("On Air");
            } else if (state === "stopped") {
              handleStopped();
            } else if (state === "loading") {
              setStatus("loading");
              setStatusText("Loading\u2026");
            } else if (state === "reconnecting") {
              setStatus("loading");
              setStatusText("Reconnecting\u2026");
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
    entries.flushPending();
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

  // ── Render ──

  const BADGE_CLASS = {
    standby: "badge-idle",
    loading: "badge-loading",
    live: "badge-live",
  } as const;

  const badgeClass = createMemo(() => BADGE_CLASS[status()]);

  return (
    <>
      <header class="stagger-1 flex items-center justify-between h-[60px] px-5 bg-raised shrink-0 relative z-10">
        <div class="flex items-center gap-3">
          <img
            src={logoDarkSrc}
            alt="Express 24/7"
            class="h-8 w-auto object-contain dark:block light:hidden"
            draggable={false}
          />
          <img
            src={logoLightSrc}
            alt="Express 24/7"
            class="h-8 w-auto object-contain dark:hidden light:block"
            draggable={false}
          />

          <div class="w-px h-6 bg-border mx-1" />

          <StatsBar
            latency={entries.latency}
            lines={() => entries.sentEntries().length}
            uptime={uptime}
            live={running}
          />
        </div>

        <div class="flex items-center gap-3">
          <ThemeToggle />

          <Button
            variant="icon"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            class="gear-spin"
          >
            <Settings size={18} />
          </Button>

          <div class="w-px h-6 bg-border" />

          <div
            class={`flex items-center justify-center gap-1.5 shrink-0 min-w-[135px] py-1.5 pl-3 pr-3.5 border rounded-full text-[12px] font-bold tracking-wider transition-all duration-300 ${badgeClass()}`}
          >
            <span class="status-dot w-[7px] h-[7px] rounded-full shrink-0 transition-all duration-300" />
            <span>{statusText()}</span>
          </div>
        </div>
      </header>

      <div
        ref={containerRef}
        class="stagger-2 flex flex-col flex-1 min-h-0 bg-bg relative overflow-hidden"
      >
        <Controls
          running={running}
          onStart={handleStart}
          onStop={handleStop}
          onCopyAll={() => {
            const text = entries
              .transEntries()
              .map((e) => e.text)
              .join("\n");
            if (text) copyToClipboard(text);
          }}
          onClear={() => {
            entries.clear();
            lastVizSentCount = 0;
          }}
        />
        <main
          ref={mainRef}
          class="flex min-h-0 overflow-hidden pt-2 px-2 gap-0"
          style={{ flex: String(vSplit()) }}
        >
          <div style={{ flex: String(hSplit()) }} class="min-w-0 flex">
            <SpeechPane
              entries={entries.sttEntries}
              finalCount={entries.sttCount}
              live={running}
              micDeviceId={activeMicId}
            />
          </div>

          <ResizeHandle direction="horizontal" onResize={onHResize} />

          <div style={{ flex: String(100 - hSplit()) }} class="min-w-0 flex">
            <TranslationPane
              entries={entries.transEntries}
              live={running}
              tickForEntry={entries.tickForEntry}
              reviewTimeMs={entries.reviewTimeMs}
              onStartEdit={entries.startEdit}
              onSaveEdit={entries.saveEdit}
              onCancelEdit={entries.cancelEdit}
              onEditChange={entries.onEditChange}
            />
          </div>
        </main>

        <div class="partial-bar-wrapper" classList={{ open: running() }}>
          <div class="partial-bar shrink-0 px-4 py-3 relative" dir="rtl">
            <div class="partial-bar-border" />
            <p
              class="font-urdu text-xl leading-loose italic"
              classList={{
                "text-tx-3": !!entries.sttPartial(),
                "text-tx-4": !entries.sttPartial(),
              }}
            >
              {entries.sttPartial() || "\u200F\u2026"}
            </p>
          </div>
        </div>

        <ResizeHandle direction="vertical" onResize={onVResize} />

        <div style={{ flex: String(100 - vSplit()) }} class="min-h-0 flex flex-col">
          <VizPane expectedScenePath={() => config()?.viz.scene_path ?? ""} />
        </div>

        <span
          class="pointer-events-none select-none absolute bottom-[35%] right-6 font-urdu text-[10rem] leading-none text-tx opacity-[0.04] z-0"
          aria-hidden="true"
        >
          ایکسپریس<sup class="text-[3rem] align-super">24/7</sup>
        </span>
      </div>

      <ToastContainer />

      <Show when={showSettings()}>
        <ErrorBoundary
          fallback={() => {
            setShowSettings(false);
            return <></>;
          }}
        >
          <SettingsModal
            config={config()}
            onClose={() => setShowSettings(false)}
            onSaved={(c) => setConfig(c)}
          />
        </ErrorBoundary>
      </Show>

      <Show when={perf.enabled()}>
        <ErrorBoundary
          fallback={() => {
            perf.toggle();
            return <></>;
          }}
        >
          <PerfOverlay
            fps={perf.fps}
            ipcRtt={perf.ipcRtt}
            mainCpu={perf.mainCpu}
            rendererCpu={perf.rendererCpu}
            mainMemory={perf.mainMemory}
            rendererMemory={perf.rendererMemory}
            eventLoopLag={perf.eventLoopLag}
            latency={entries.latency}
            words={entries.words}
            uptime={uptime}
            onClose={perf.toggle}
          />
        </ErrorBoundary>
      </Show>
    </>
  );
}
