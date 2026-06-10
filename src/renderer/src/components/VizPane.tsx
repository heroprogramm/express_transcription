import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import {
  ChevronsDown,
  Pause,
  RotateCcw,
  RotateCw,
  MonitorPlay,
  Layers,
  ArrowRightLeft,
  LoaderCircle,
  WifiOff,
  TriangleAlert,
  Minus,
  Plus,
  Zap,
  Hand,
} from "lucide-solid";

const SPEED_MIN = 1;
const SPEED_MAX = 10;
const SPEED_STEP = 1;

const DELAY_MIN = 100;
const DELAY_MAX = 30000;
const DELAY_STEP = 1000;

import { type VizStatus, VizConnection } from "@/lib/types";
import { useAutoScroll } from "@/lib/use-auto-scroll";
import { showToast } from "@/components/Toast";
import Button from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  vizLoadScene,
  vizContinue,
  vizToggleScroll,
  vizSetSpeed,
  vizHardReset,
  vizReconnect,
  vizGetStatus,
  onVizStatus,
  saveConfig,
  getConfig,
  vizSetAutoMode,
} from "@/lib/ipc";

const DEFAULT_STATUS: VizStatus = {
  connection: VizConnection.Idle,
  isAnimating: false,
  isLoaded: false,
  loadedSceneName: null,
  hasData: false,
  autoPaused: false,
  currentIdx: 1,
  yPos: 0,
  scrollSpeed: 0.3,
  autoScrollMode: true,
  autoDelayMs: 1000,
  history: [],
};

const SceneState = {
  Unknown: "unknown",
  Missing: "missing",
  Wrong: "wrong",
  Ok: "ok",
  Loose: "loose",
} as const;
type SceneState = (typeof SceneState)[keyof typeof SceneState];

interface Props {
  expectedScenePath?: () => string;
}

export default function VizPane(props: Props) {
  const [status, setStatus] = createSignal<VizStatus>(DEFAULT_STATUS);
  const [busy, setBusy] = createSignal(false);
  const [scrollBusy, setScrollBusy] = createSignal(false);
  const [showResetConfirm, setShowResetConfirm] = createSignal(false);
  const [sendDelayMs, setSendDelayMs] = createSignal(1000);

  const history = () => status().history;

  let historyContainer: HTMLDivElement | undefined;
  const { onScroll } = useAutoScroll(
    () => historyContainer,
    () => history().length,
  );

  onMount(() => {
    const unsub = onVizStatus((s) => {
      setStatus(s);
      // Update delay display when in AUTO mode
      if (s.autoScrollMode && s.autoDelayMs) {
        setSendDelayMs(s.autoDelayMs);
      }
    });

    vizGetStatus()
      .then((s) => {
        setStatus(s);
        if (s.autoScrollMode && s.autoDelayMs) {
          setSendDelayMs(s.autoDelayMs);
        }
      })
      .catch((err) => {
        const raw = err instanceof Error ? err.message : String(err);
        const msg = raw.replace(/^Error invoking remote method '[^']+': Error: /i, "");
        showToast(`Viz status fetch failed: ${msg}`, "error");
      });

    getConfig()
      .then((result) => {
        setSendDelayMs(result.config.viz.send_delay_ms ?? 1000);
      })
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
    setScrollBusy(true);
    try {
      await vizToggleScroll(start);
    } catch (err) {
      toastError(start ? "Start Scroll" : "Stop Scroll", err);
    } finally {
      setScrollBusy(false);
    }
  }

  async function handleSpeedChange(value: number) {
    const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(value)));
    try {
      await vizSetSpeed(clamped);
      setStatus((prev) => ({ ...prev, scrollSpeed: clamped / 10 }));
    } catch (err) {
      toastError("Set Speed", err);
    }
  }

  function bumpSpeed(delta: number) {
    handleSpeedChange(Math.round(status().scrollSpeed * 10) + delta);
  }

  async function handleDelayChange(value: number) {
    const clamped = Math.min(DELAY_MAX, Math.max(DELAY_MIN, Math.round(value / DELAY_STEP) * DELAY_STEP));
    setSendDelayMs(clamped);
    try {
      await saveConfig({ viz_send_delay_ms: clamped });
    } catch (err) {
      toastError("Set Delay", err);
    }
  }

  function bumpDelay(delta: number) {
    handleDelayChange(sendDelayMs() + delta);
  }

  async function handleToggleAutoMode() {
    const newMode = !status().autoScrollMode;
    try {
      await vizSetAutoMode(newMode);
      setStatus((prev) => ({ ...prev, autoScrollMode: newMode }));
    } catch (err) {
      toastError("Set Mode", err);
    }
  }

  async function handleReconnect() {
    try {
      await vizReconnect();
    } catch (err) {
      toastError("Reconnect", err);
    }
  }

  async function doReset() {
    setShowResetConfirm(false);
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
  const paused = () => status().autoPaused;
  const canScroll = () => status().hasData;
  const connected = () => status().connection === VizConnection.Connected;
  const isAuto = () => status().autoScrollMode ?? true;

  const sceneName = (path: string | null): string => {
    if (!path) return "";
    const last = path.split("/").pop();
    return last && last.length > 0 ? last : path;
  };

  const sceneState = (): SceneState => {
    if (status().connection !== VizConnection.Connected) return SceneState.Unknown;
    const actual = status().loadedSceneName;
    const expected = (props.expectedScenePath?.() ?? "").trim();
    if (!actual) return SceneState.Missing;
    if (!expected) return SceneState.Loose;
    return actual === sceneName(expected) ? SceneState.Ok : SceneState.Wrong;
  };

  return (
    <div class="flex flex-col min-h-0 flex-1 overflow-hidden">
      <div class="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
        <MonitorPlay size={16} class="text-tx-3 shrink-0" />
        <span class="text-[14px] font-semibold text-tx-3 tracking-wide shrink-0">Viz Engine</span>

        <div class="w-px h-5 bg-border shrink-0" />

        <Button
          variant="ghost"
          size="md"
          onClick={handleLoadScene}
          disabled={!connected() || busy()}
        >
          <Show when={!busy()} fallback={<LoaderCircle size={14} class="animate-spin" />}>
            <Layers size={14} />
          </Show>
          {busy() ? "Loading…" : "Load Scene"}
        </Button>
        <Button variant="ghost" size="md" onClick={handleContinue} disabled={!connected()}>
          <ArrowRightLeft size={14} />
          IN / OUT
        </Button>

        <Button
          variant={animating() ? "danger" : "primary"}
          size="md"
          onClick={handleToggleScroll}
          disabled={!connected() || !canScroll() || scrollBusy()}
          title="Toggle scroll (Ctrl+Space)"
        >
          <Show
            when={!scrollBusy()}
            fallback={<><LoaderCircle size={14} class="animate-spin" /> Connecting…</>}
          >
            <Show
              when={!animating()}
              fallback={<><Pause size={14} fill="currentColor" /> Pause</>}
            >
              <ChevronsDown size={14} /> Scroll
            </Show>
          </Show>
        </Button>

        <Show when={paused()}>
          <span class="text-[12px] text-yellow font-ui italic shrink-0">Paused</span>
        </Show>

        {/* ── AUTO / MANUAL toggle ── */}
        <button
          type="button"
          onClick={handleToggleAutoMode}
          disabled={false}
          title={isAuto() ? "AUTO mode — click for MANUAL" : "MANUAL mode — click for AUTO"}
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none"
          classList={{
            "border-blue bg-blue/10 text-blue": isAuto(),
            "border-border-lit bg-surface text-tx-3": !isAuto(),
          }}
        >
          <Show when={isAuto()} fallback={<Hand size={12} />}>
            <Zap size={12} />
          </Show>
          {isAuto() ? "Auto" : "Manual"}
        </button>

        <div class="flex-1" />

        {/* Scene status */}
        <div class="flex items-center gap-2 shrink-0">
          <Show when={sceneState() === SceneState.Ok}>
            <span
              class="chip-tooltip flex items-center gap-2 text-[15px] font-ui font-semibold text-tx-1 bg-hover border border-border-lit rounded-full px-3.5 py-1 shrink-0 max-w-[360px]"
              data-tooltip={status().loadedSceneName ?? ""}
            >
              <Layers size={15} class="shrink-0 text-tx-3" />
              <span class="truncate">{status().loadedSceneName ?? ""}</span>
            </span>
          </Show>
          <Show when={sceneState() === SceneState.Loose}>
            <span
              class="chip-tooltip flex items-center gap-2 text-[15px] font-ui font-semibold text-tx-1 bg-hover border border-border-lit rounded-full px-3.5 py-1 shrink-0 max-w-[360px]"
              data-tooltip={`Loaded: ${status().loadedSceneName ?? ""}`}
            >
              <Layers size={15} class="shrink-0 text-tx-3" />
              <span class="truncate">{status().loadedSceneName ?? ""}</span>
            </span>
          </Show>
          <Show when={sceneState() === SceneState.Wrong}>
            <span
              class="chip-tooltip chip-warning flex items-center gap-2 text-[13px] font-ui font-medium rounded-full px-3 py-1 shrink-0 max-w-[280px]"
              data-tooltip={`Loaded: ${status().loadedSceneName ?? "(none)"}\nExpected: ${props.expectedScenePath?.() ?? "(unset)"}`}
            >
              <TriangleAlert size={14} class="shrink-0 chip-icon" />
              <span class="truncate">
                {status().loadedSceneName ? `Wrong scene: ${status().loadedSceneName}` : "Wrong scene"}
              </span>
            </span>
          </Show>
          <Show when={sceneState() === SceneState.Missing}>
            <span
              class="chip-tooltip chip-error flex items-center gap-2 text-[13px] font-ui font-medium rounded-full px-3 py-1 shrink-0"
              data-tooltip="Click Load Scene to load the configured scene."
            >
              <TriangleAlert size={14} class="shrink-0 chip-icon" />
              <span>No scene loaded</span>
            </span>
          </Show>
        </div>

        <div class="flex-1" />

        {/* Speed control */}
        <div
          class="flex items-center gap-2 shrink-0 transition-opacity"
          classList={{ "opacity-25": !connected() }}
        >
          <span class="text-[14px] text-tx-3 font-ui">Speed</span>
          <button
            type="button"
            onClick={() => bumpSpeed(-SPEED_STEP)}
            disabled={!connected() || Math.round(status().scrollSpeed * 10) <= SPEED_MIN}
            class="flex items-center justify-center w-6 h-6 rounded-md border border-border-lit bg-surface text-tx-2 hover:bg-hover disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Minus size={12} />
          </button>
          <div class="relative w-24 h-6 flex items-center">
            <div class="absolute left-0 right-0 h-1 rounded-full bg-border-lit">
              <div
                class="h-full rounded-full bg-blue"
                style={{
                  width: `${((Math.round(status().scrollSpeed * 10) - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100}%`,
                }}
              />
            </div>
            <input
              type="range"
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={SPEED_STEP}
              value={Math.round(status().scrollSpeed * 10)}
              disabled={!connected()}
              onInput={(e) => handleSpeedChange(Number(e.currentTarget.value))}
              class="capsule-slider absolute inset-0 w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => bumpSpeed(SPEED_STEP)}
            disabled={!connected() || Math.round(status().scrollSpeed * 10) >= SPEED_MAX}
            class="flex items-center justify-center w-6 h-6 rounded-md border border-border-lit bg-surface text-tx-2 hover:bg-hover disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Plus size={12} />
          </button>
          <span class="text-[15px] text-tx-2 font-mono font-semibold tabular-nums w-8 text-right cursor-default select-none">
            {Math.round(status().scrollSpeed * 10)}
          </span>
        </div>

        {/* Delay control */}
        <div class="w-px h-5 bg-border shrink-0" />
        <div
          class="flex items-center gap-2 shrink-0 transition-opacity"
          classList={{ "opacity-25": !connected() }}
          title="Delay between each text sent to Vizrt."
        >
          <span class="text-[14px] text-tx-3 font-ui">Delay</span>
          <button
            type="button"
            onClick={() => bumpDelay(-DELAY_STEP)}
            disabled={!connected() || isAuto() || sendDelayMs() <= DELAY_MIN}
            class="flex items-center justify-center w-6 h-6 rounded-md border border-border-lit bg-surface text-tx-2 hover:bg-hover disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Minus size={12} />
          </button>
          <span class="text-[15px] text-tx-2 font-mono font-semibold tabular-nums w-12 text-center cursor-default select-none">
            {(sendDelayMs() / 1000).toFixed(1)}
          </span>
          <button
            type="button"
            onClick={() => bumpDelay(DELAY_STEP)}
            disabled={!connected() || isAuto() || sendDelayMs() >= DELAY_MAX}
            class="flex items-center justify-center w-6 h-6 rounded-md border border-border-lit bg-surface text-tx-2 hover:bg-hover disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Plus size={12} />
          </button>
          <span class="text-[12px] text-tx-4 font-ui shrink-0">s</span>
        </div>

        <Show when={loaded()}>
          <span class="text-[12px] text-tx-3 font-mono tabular-nums bg-hover border border-border-lit rounded-full px-2.5 py-0.5 shrink-0">
            Slot {status().currentIdx}/{30}
          </span>
        </Show>

        <Button
          variant="ghost-danger"
          size="md"
          onClick={() => setShowResetConfirm(true)}
          disabled={!connected()}
        >
          <RotateCcw size={14} />
          Reset
        </Button>

        <div class="w-px h-5 bg-border shrink-0" />

        <Show when={status().connection !== VizConnection.Connected}>
          <Button
            variant="ghost"
            size="md"
            onClick={handleReconnect}
            disabled={
              status().connection === VizConnection.Connecting ||
              status().connection === VizConnection.Reconnecting
            }
          >
            <RotateCw size={14} />
            Reconnect
          </Button>
        </Show>

        <div
          class={`flex items-center justify-center gap-1.5 shrink-0 min-w-[135px] py-1.5 pl-3 pr-3.5 border rounded-full text-[12px] font-bold tracking-wider transition-all duration-300 badge-viz-${status().connection}`}
        >
          <Show
            when={status().connection !== VizConnection.Failed}
            fallback={<WifiOff size={12} class="shrink-0" />}
          >
            <span class="status-dot w-[7px] h-[7px] rounded-full shrink-0 transition-all duration-300" />
          </Show>
          <span>
            {
              {
                idle: "Disconnected",
                connecting: "Connecting\u2026",
                connected: "Connected",
                reconnecting: "Reconnecting\u2026",
                failed: "Connection Failed",
              }[status().connection]
            }
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
                <span
                  class="text-[12px] font-mono tabular-nums shrink-0 pt-px"
                  classList={{
                    "text-blue/60": entry.type === "action",
                    "text-tx-4": entry.type === "info",
                  }}
                >
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

      <ConfirmDialog
        open={showResetConfirm()}
        title="Hard Reset"
        message="Scroll will stop and all text will clear."
        confirmLabel="Reset"
        onConfirm={doReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}