import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import {
  ChevronsDown,
  Square,
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
} from "lucide-solid";

const SPEED_MIN = 0.1;
const SPEED_MAX = 1.0;
const SPEED_STEP = 0.05;
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
  history: [],
};

/** Detection state for the scene loaded on the Viz Engine, relative to the configured scene_path. */
const SceneState = {
  /** Not connected, or the engine hasn't reported yet — no warning shown. */
  Unknown: "unknown",
  /** Connected, but no scene is loaded on the engine. */
  Missing: "missing",
  /** Connected, scene loaded, but it isn't the configured one. */
  Wrong: "wrong",
  /** Loaded scene matches the configured scene. */
  Ok: "ok",
  /** Loaded scene exists, but no expected path is configured to compare against. */
  Loose: "loose",
} as const;
type SceneState = (typeof SceneState)[keyof typeof SceneState];

interface Props {
  /** Configured scene path; used to detect when a different (or no) scene is loaded on the engine. */
  expectedScenePath?: () => string;
}

/** Viz Engine control panel — replaces the old read-only OutputPane. */
export default function VizPane(props: Props) {
  const [status, setStatus] = createSignal<VizStatus>(DEFAULT_STATUS);
  const [busy, setBusy] = createSignal(false);
  const [scrollBusy, setScrollBusy] = createSignal(false);
  const [showResetConfirm, setShowResetConfirm] = createSignal(false);

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
      .catch((err) => {
        const raw = err instanceof Error ? err.message : String(err);
        const msg = raw.replace(/^Error invoking remote method '[^']+': Error: /i, "");
        showToast(`Viz status fetch failed: ${msg}`, "error");
      });
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
    const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(value * 100) / 100));
    try {
      await vizSetSpeed(clamped);
      setStatus((prev) => ({ ...prev, scrollSpeed: clamped }));
    } catch (err) {
      toastError("Set Speed", err);
    }
  }

  function bumpSpeed(delta: number) {
    handleSpeedChange(status().scrollSpeed + delta);
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

  const sceneName = (path: string | null): string => {
    if (!path) return "";
    const last = path.split("/").pop();
    return last && last.length > 0 ? last : path;
  };

  /** Scene detection state derived from the engine's reported scene name; see SceneState for cases. */
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
      {/* Header + Controls (single row) */}
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
            fallback={
              <>
                <LoaderCircle size={14} class="animate-spin" /> Connecting…
              </>
            }
          >
            <Show
              when={!animating()}
              fallback={
                <>
                  <Square size={14} /> Stop
                </>
              }
            >
              <ChevronsDown size={14} /> Scroll
            </Show>
          </Show>
        </Button>
        <Show when={paused()}>
          <span class="text-[12px] text-yellow font-ui italic shrink-0">Paused</span>
        </Show>

        <div class="flex-1" />

        {/* Centered scene status — loaded scene name (OK/Loose) or warning chip (Wrong/Missing). All four states are mutually exclusive on sceneState(). */}
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
              data-tooltip={`Loaded: ${status().loadedSceneName ?? ""}\n(no scene_path configured to compare)`}
            >
              <Layers size={15} class="shrink-0 text-tx-3" />
              <span class="truncate">{status().loadedSceneName ?? ""}</span>
            </span>
          </Show>

          <Show when={sceneState() === SceneState.Wrong}>
            <span
              class="chip-tooltip chip-warning flex items-center gap-2 text-[13px] font-ui font-medium rounded-full px-3 py-1 shrink-0 max-w-[280px]"
              data-tooltip={`Loaded scene: ${status().loadedSceneName ?? "(none)"}\nExpected: ${props.expectedScenePath?.() ?? "(unset)"}`}
            >
              <TriangleAlert size={14} class="shrink-0 chip-icon" />
              <span class="truncate">
                {status().loadedSceneName
                  ? `Wrong scene: ${status().loadedSceneName}`
                  : "Wrong scene"}
              </span>
            </span>
          </Show>

          <Show when={sceneState() === SceneState.Missing}>
            <span
              class="chip-tooltip chip-error flex items-center gap-2 text-[13px] font-ui font-medium rounded-full px-3 py-1 shrink-0"
              data-tooltip="Click Load Scene to load the configured scene on the Viz Engine."
            >
              <TriangleAlert size={14} class="shrink-0 chip-icon" />
              <span>No scene loaded</span>
            </span>
          </Show>
        </div>

        <div class="flex-1" />

        <div
          class="flex items-center gap-2 shrink-0 transition-opacity"
          classList={{ "opacity-25": !connected() }}
        >
          <span class="text-[14px] text-tx-3 font-ui">Speed</span>
          <button
            type="button"
            onClick={() => bumpSpeed(-SPEED_STEP)}
            disabled={!connected() || status().scrollSpeed <= SPEED_MIN + 1e-6}
            class="flex items-center justify-center w-6 h-6 rounded-md border border-border-lit bg-surface text-tx-2 hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Decrease speed"
          >
            <Minus size={12} />
          </button>
          <div class="relative w-24 h-6 flex items-center">
            <div class="absolute left-0 right-0 h-1 rounded-full bg-border-lit">
              <div
                class="h-full rounded-full bg-blue"
                style={{
                  width: `${((status().scrollSpeed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100}%`,
                }}
              />
            </div>
            <input
              type="range"
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={SPEED_STEP}
              value={status().scrollSpeed}
              disabled={!connected()}
              onInput={(e) => handleSpeedChange(Number(e.currentTarget.value))}
              class="capsule-slider absolute inset-0 w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => bumpSpeed(SPEED_STEP)}
            disabled={!connected() || status().scrollSpeed >= SPEED_MAX - 1e-6}
            class="flex items-center justify-center w-6 h-6 rounded-md border border-border-lit bg-surface text-tx-2 hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Increase speed"
          >
            <Plus size={12} />
          </button>
          <span class="text-[15px] text-tx-2 font-mono font-semibold tabular-nums w-8 text-right">
            {status().scrollSpeed.toFixed(2)}
          </span>
        </div>

        <Show when={loaded()}>
          <span class="text-[12px] text-tx-3 font-mono tabular-nums bg-hover border border-border-lit rounded-full px-2.5 py-0.5 shrink-0">
            Slot {status().currentIdx}/{15}
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
            title="Reconnect to Viz Engine"
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
