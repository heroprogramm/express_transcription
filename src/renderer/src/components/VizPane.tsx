import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { Play, Square, RotateCcw, MonitorPlay, Layers } from "lucide-solid";
import type { VizStatus, VizLogEntry } from "@/lib/types";
import { showToast } from "@/components/Toast";
import Button from "@/components/Button";
import {
  vizLoadScene,
  vizContinue,
  vizToggleScroll,
  vizSetSpeed,
  vizHardReset,
  vizGetStatus,
  vizGetHistory,
  onVizStatus,
} from "@/lib/ipc";

const DEFAULT_STATUS: VizStatus = {
  connected: false,
  isAnimating: false,
  isLoaded: false,
  hasData: false,
  currentIdx: 1,
  yPos: 0,
  scrollSpeed: 0.3,
};

/** Viz Engine control panel — replaces the old read-only OutputPane. */
export default function VizPane() {
  const [status, setStatus] = createSignal<VizStatus>(DEFAULT_STATUS);
  const [history, setHistory] = createSignal<VizLogEntry[]>([]);
  const [busy, setBusy] = createSignal(false);

  let historyInterval: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    const unsub = onVizStatus(setStatus);

    vizGetStatus()
      .then(setStatus)
      .catch(() => {});
    vizGetHistory()
      .then(setHistory)
      .catch(() => {});

    historyInterval = setInterval(() => {
      vizGetHistory()
        .then(setHistory)
        .catch(() => {});
    }, 1000);

    onCleanup(() => {
      unsub();
      if (historyInterval) clearInterval(historyInterval);
    });
  });

  function toastError(action: string, err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Viz ${action} failed: ${msg}`, "error");
  }

  async function handleLoadScene() {
    setBusy(true);
    try {
      await vizLoadScene();
      const s = await vizGetStatus();
      setStatus(s);
    } catch (err) {
      toastError("Load Scene", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleContinue() {
    try {
      await vizContinue();
    } catch (err) {
      toastError("Continue", err);
    }
  }

  async function handleToggleScroll() {
    const start = !status().isAnimating;
    try {
      await vizToggleScroll(start);
    } catch (err) {
      toastError(start ? "Start Scroll" : "Stop Scroll", err);
    }
  }

  async function handleSpeedChange(value: number) {
    try {
      await vizSetSpeed(value);
      setStatus((prev) => ({ ...prev, scrollSpeed: value }));
    } catch (err) {
      toastError("Set Speed", err);
    }
  }

  async function handleReset() {
    if (!confirm("Hard Reset? Scroll will stop and all text will clear.")) return;
    try {
      await vizHardReset();
      const s = await vizGetStatus();
      setStatus(s);
    } catch (err) {
      toastError("Reset", err);
    }
  }

  const loaded = () => status().isLoaded;
  const animating = () => status().isAnimating;
  const canScroll = () => loaded() && status().hasData;

  return (
    <div class="surface-raised bg-raised border border-border rounded-md flex flex-col min-h-0 flex-1 overflow-hidden">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div class="flex items-center gap-2">
          <MonitorPlay size={14} class="text-tx-3" />
          <span class="text-[13px] font-semibold text-tx-2 tracking-wide">Viz Engine</span>
        </div>
        <div class="flex items-center gap-3">
          <Show when={loaded()}>
            <span class="text-[10px] text-tx-3 font-mono tabular-nums bg-hover border border-border-lit rounded-full px-2 py-0.5">
              Slot {status().currentIdx}/{15}
            </span>
          </Show>
          <div class="flex items-center gap-1.5">
            <span
              class="w-[7px] h-[7px] rounded-full shrink-0 transition-colors"
              classList={{
                "bg-green": status().connected,
                "bg-tx-4": !status().connected,
              }}
            />
            <span class="text-[10px] text-tx-3 font-ui">
              {status().connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div class="px-4 py-3 border-b border-border shrink-0 flex flex-col gap-3">
        {/* Row 1: Scene controls */}
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleLoadScene} disabled={busy()}>
            <Layers size={12} />
            Load Scene
          </Button>
          <Button variant="ghost" size="sm" onClick={handleContinue}>
            IN / OUT
          </Button>

          <div class="flex-1" />

          <Button variant="ghost-danger" size="sm" onClick={handleReset}>
            <RotateCcw size={12} />
            Reset
          </Button>
        </div>

        {/* Row 2: Scroll controls + speed */}
        <div class="flex items-center gap-3">
          <Button
            variant={animating() ? "danger" : "primary"}
            size="sm"
            onClick={handleToggleScroll}
            disabled={!canScroll()}
          >
            <Show
              when={!animating()}
              fallback={
                <>
                  <Square size={12} /> Stop Scroll
                </>
              }
            >
              <Play size={12} /> Start Scroll
            </Show>
          </Button>

          <span class="text-[10px] text-tx-4 font-ui">Ctrl+Space</span>

          <div class="flex-1" />

          <div class="flex items-center gap-2">
            <span class="text-[10px] text-tx-4 font-ui shrink-0">Speed</span>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={status().scrollSpeed}
              onInput={(e) => handleSpeedChange(Number(e.currentTarget.value))}
              class="w-24 accent-[var(--green)]"
            />
            <span class="text-[11px] text-tx-2 font-mono tabular-nums w-6 text-right">
              {status().scrollSpeed.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* History log */}
      <div class="flex-1 overflow-y-auto px-3 py-2 transcript-scroll">
        <Show
          when={history().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full -mt-4 gap-3">
              <MonitorPlay size={24} class="text-tx-4" />
              <div class="text-center">
                <p class="font-ui text-[14px] font-medium text-tx-3">Viz Engine controller</p>
                <p class="font-ui text-[12px] text-tx-4 mt-1.5">
                  Load a scene to begin. Translations auto-send to Viz.
                </p>
              </div>
            </div>
          }
        >
          <For each={history()}>
            {(entry, i) => (
              <div
                class={`flex items-start gap-2 py-1 min-h-6 ${i() % 2 === 1 ? "bg-[var(--bg-surface)]/40" : ""}`}
              >
                <span class="text-[10px] font-mono text-tx-4 tabular-nums shrink-0 pt-px">
                  {entry.time}
                </span>
                <span
                  class="text-[12px]"
                  classList={{
                    "text-tx-3 italic": entry.type === "action",
                    "text-tx-2": entry.type === "info",
                  }}
                >
                  {entry.msg}
                </span>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
