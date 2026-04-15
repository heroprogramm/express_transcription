import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { Play, Square, RotateCcw, MonitorPlay, Layers } from "lucide-solid";
import type { VizStatus } from "@/lib/types";
import { useAutoScroll } from "@/lib/use-auto-scroll";
import { showToast } from "@/components/Toast";
import Button from "@/components/Button";
import {
  vizLoadScene,
  vizContinue,
  vizToggleScroll,
  vizSetSpeed,
  vizHardReset,
  vizGetStatus,
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
  history: [],
};

/** Viz Engine control panel — replaces the old read-only OutputPane. */
export default function VizPane() {
  const [status, setStatus] = createSignal<VizStatus>(DEFAULT_STATUS);
  const [busy, setBusy] = createSignal(false);

  const history = () => status().history;

  let historyContainer: HTMLDivElement | undefined;
  const { onScroll } = useAutoScroll(
    () => historyContainer,
    () => history().length,
  );

  onMount(() => {
    const unsub = onVizStatus(setStatus);
    vizGetStatus()
      .then(setStatus)
      .catch(() => {});
    onCleanup(unsub);
  });

  function toastError(action: string, err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg = raw.replace(/^Error invoking remote method '[^']+': Error: /i, "");
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
    <div class="flex flex-col min-h-0 flex-1 overflow-hidden">
      {/* Header + Controls (single row) */}
      <div class="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
        <MonitorPlay size={16} class="text-tx-3 shrink-0" />
        <span class="text-[14px] font-semibold text-tx-3 tracking-wide shrink-0">Viz Engine</span>

        <div class="w-px h-5 bg-border shrink-0" />

        <Button variant="ghost" size="md" onClick={handleLoadScene} disabled={busy()}>
          <Layers size={14} />
          Load Scene
        </Button>
        <Button variant="ghost" size="md" onClick={handleContinue}>
          IN / OUT
        </Button>

        <Button
          variant={animating() ? "danger" : "primary"}
          size="md"
          onClick={handleToggleScroll}
          disabled={!canScroll()}
        >
          <Show
            when={!animating()}
            fallback={
              <>
                <Square size={14} /> Stop
              </>
            }
          >
            <Play size={14} /> Scroll
          </Show>
        </Button>
        <span class="text-[13px] text-tx-3 font-ui shrink-0">Ctrl+Space</span>

        <div class="flex-1" />

        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[14px] text-tx-3 font-ui">Speed</span>
          <div class="relative w-24 h-6 flex items-center">
            <div class="absolute left-0 right-0 h-1 rounded-full bg-border-lit">
              <div
                class="h-full rounded-full bg-blue"
                style={{ width: `${((status().scrollSpeed - 0.1) / 0.9) * 100}%` }}
              />
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={status().scrollSpeed}
              onInput={(e) => handleSpeedChange(Number(e.currentTarget.value))}
              class="capsule-slider absolute inset-0 w-full"
            />
          </div>
          <span class="text-[14px] text-tx-3 font-mono tabular-nums w-6 text-right">
            {status().scrollSpeed.toFixed(1)}
          </span>
        </div>

        <Show when={loaded()}>
          <span class="text-[12px] text-tx-3 font-mono tabular-nums bg-hover border border-border-lit rounded-full px-2.5 py-0.5 shrink-0">
            Slot {status().currentIdx}/{15}
          </span>
        </Show>

        <Button variant="ghost-danger" size="md" onClick={handleReset}>
          <RotateCcw size={14} />
          Reset
        </Button>

        <div class="w-px h-5 bg-border shrink-0" />

        <div class="flex items-center gap-1.5 shrink-0">
          <span
            class="w-[7px] h-[7px] rounded-full shrink-0 transition-colors"
            classList={{
              "bg-green": status().connected,
              "bg-tx-4": !status().connected,
            }}
          />
          <span class="text-[13px] text-tx-3 font-ui">
            {status().connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* History log */}
      <div
        ref={historyContainer}
        onScroll={onScroll}
        class="flex-1 overflow-y-auto px-3 py-2 transcript-scroll"
      >
        <Show
          when={history().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full -mt-4 gap-3">
              <MonitorPlay size={28} class="text-tx-4" />
              <div class="text-center">
                <p class="font-ui text-[16px] font-medium text-tx-3">Viz Engine controller</p>
                <p class="font-ui text-[14px] text-tx-4 mt-1.5">
                  Load a scene to begin. Translations auto-send to Viz.
                </p>
              </div>
            </div>
          }
        >
          <For each={history()}>
            {(entry) => (
              <div class="flex items-start gap-2 py-1 min-h-6">
                <span class="text-[12px] font-mono text-tx-4 tabular-nums shrink-0 pt-px">
                  {entry.time}
                </span>
                <span
                  class="text-[14px]"
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
