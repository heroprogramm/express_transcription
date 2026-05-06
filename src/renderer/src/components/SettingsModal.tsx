import { createSignal, createEffect, on, onCleanup, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import {
  Settings as SettingsIcon,
  X,
  Save,
  Mic,
  MonitorPlay,
  FileOutput,
  LoaderCircle,
  Plug,
  CircleCheck,
  CircleX,
  ChevronDown,
} from "lucide-solid";
import type { AppConfig } from "@/lib/types";
import { hasApiKey, saveApiKey, saveConfig, getModels, vizTestConnection } from "@/lib/ipc";
import { reportError } from "@/lib/errors";
import Button from "@/components/Button";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "success"; elapsedMs: number }
  | { kind: "error"; message: string };

/** Props for the {@link SettingsModal} component. */
interface Props {
  config: AppConfig | null;
  onClose: () => void;
  onSaved: (config: AppConfig) => void;
}

const TABS = ["Soniox", "Output", "Viz Engine"] as const;
type Tab = (typeof TABS)[number];

const INPUT =
  "settings-input bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-md outline-none transition-all placeholder:text-tx-4";

/** Modal dialog for editing application settings across multiple tabs. */
export default function SettingsModal(props: Props) {
  const [tab, setTab] = createSignal<Tab>("Soniox");
  const [key, setKey] = createSignal("");
  const [keyExists, setKeyExists] = createSignal(false);
  const [fields, setFields] = createStore({
    model: props.config?.soniox.model ?? "stt-rt-v4",
    endpointDetection: props.config?.soniox.endpoint_detection ?? false,
    reviewTime: String(props.config?.output.review_time_seconds ?? 10),
    vizHost: props.config?.viz.host ?? "127.0.0.1",
    vizPort: String(props.config?.viz.port ?? 6100),
    vizScenePath: props.config?.viz.scene_path ?? "",
    vizScrollSpeed: String(props.config?.viz.scroll_speed ?? 0.3),
    autoPauseOnIdle: props.config?.viz.auto_pause_on_idle ?? true,
    autoPauseOnIdleSeconds: String(props.config?.viz.auto_pause_on_idle_seconds ?? 10),
  });
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [contentHeight, setContentHeight] = createSignal<number | undefined>();
  const [models, setModels] = createSignal<Array<{ id: string; name: string }>>([]);
  const [modelsLoading, setModelsLoading] = createSignal(false);
  const [testState, setTestState] = createSignal<TestState>({ kind: "idle" });
  const [modelMenuOpen, setModelMenuOpen] = createSignal(false);
  let modelMenuRef: HTMLDivElement | undefined;

  function onDocClick(e: MouseEvent) {
    if (!modelMenuOpen()) return;
    if (modelMenuRef && !modelMenuRef.contains(e.target as Node)) {
      setModelMenuOpen(false);
    }
  }
  document.addEventListener("mousedown", onDocClick);
  onCleanup(() => document.removeEventListener("mousedown", onDocClick));
  const tabRefs: Partial<Record<Tab, HTMLDivElement>> = {};

  // Reset the test result whenever host or port changes so a stale badge
  // doesn't suggest the latest input is verified.
  createEffect(
    on(
      () => [fields.vizHost, fields.vizPort],
      () => setTestState({ kind: "idle" }),
      { defer: true },
    ),
  );

  // Re-measure the Viz tab when the result badge appears/disappears,
  // since the explicit height is what drives scroll vs. natural fit.
  createEffect(
    on(testState, () => requestAnimationFrame(() => measureTab(tab())), { defer: true }),
  );

  function measureTab(t: Tab): void {
    const el = tabRefs[t];
    if (el) setContentHeight(el.scrollHeight);
  }

  createEffect(on(tab, (t) => measureTab(t)));

  hasApiKey()
    .then(setKeyExists)
    .catch((err) => reportError("config", "Failed to check API key status", err));

  function fetchModels(): void {
    setModelsLoading(true);
    getModels()
      .then((m) => {
        setModels(m);
        setModelsLoading(false);
        // Re-measure after model list renders
        requestAnimationFrame(() => measureTab(tab()));
      })
      .catch((err) => {
        setModelsLoading(false);
        reportError("config", "Failed to fetch models", err);
      });
  }

  fetchModels();

  async function handleSave() {
    const modelValue = fields.model.trim();
    if (!modelValue) {
      setTab("Soniox");
      setError("Model cannot be empty");
      return;
    }

    const delayNum = Number(fields.reviewTime);
    if (!fields.reviewTime.trim() || Number.isNaN(delayNum) || delayNum < 0) {
      setTab("Output");
      setError("Review time must be a non-negative number");
      return;
    }

    const portNum = Number(fields.vizPort);
    if (!fields.vizPort.trim() || Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setTab("Viz Engine");
      setError("Viz port must be a number between 1 and 65535");
      return;
    }

    const speedNum = Number(fields.vizScrollSpeed);
    if (Number.isNaN(speedNum) || speedNum < 0.1 || speedNum > 1.0) {
      setTab("Viz Engine");
      setError("Viz scroll speed must be between 0.1 and 1.0");
      return;
    }

    const idleSecondsNum = Number(fields.autoPauseOnIdleSeconds);
    if (Number.isNaN(idleSecondsNum) || idleSecondsNum < 1) {
      setTab("Viz Engine");
      setError("Auto-pause idle time must be at least 1 second");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const keyValue = key().trim();
      if (keyValue) {
        await saveApiKey(keyValue);
      }

      const result = await saveConfig({
        model: modelValue,
        endpoint_detection: fields.endpointDetection,
        review_time_seconds: delayNum,
        viz_host: fields.vizHost.trim(),
        viz_port: portNum,
        viz_scene_path: fields.vizScenePath.trim(),
        viz_scroll_speed: speedNum,
        viz_auto_pause_on_idle: fields.autoPauseOnIdle,
        viz_auto_pause_on_idle_seconds: idleSecondsNum,
      });

      props.onSaved(result.config);
      props.onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      reportError("config", msg);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") props.onClose();
  }

  async function handleTestConnection() {
    const host = fields.vizHost.trim();
    if (!host) {
      setTestState({ kind: "error", message: "Host cannot be empty" });
      return;
    }
    const portNum = Number(fields.vizPort);
    if (!fields.vizPort.trim() || Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setTestState({ kind: "error", message: "Port must be between 1 and 65535" });
      return;
    }

    setTestState({ kind: "testing" });
    try {
      const result = await vizTestConnection(host, portNum);
      if (result.ok) {
        setTestState({ kind: "success", elapsedMs: result.elapsedMs });
      } else {
        setTestState({ kind: "error", message: result.error });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestState({ kind: "error", message: msg });
    }
  }

  const tabIcon = (t: Tab) =>
    t === "Soniox" ? (
      <Mic size={14} />
    ) : t === "Output" ? (
      <FileOutput size={14} />
    ) : (
      <MonitorPlay size={14} />
    );

  return (
    <div
      class="fixed inset-0 z-[1000] bg-bg/80 backdrop-blur-sm flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="animate-modal bg-raised border border-border rounded-lg w-[600px] max-w-[90vw] shadow-[0_20px_60px_var(--bg)] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div class="flex items-center gap-3 px-7 pt-6 pb-4 shrink-0">
          <div class="w-9 h-9 rounded-md bg-surface flex items-center justify-center shrink-0">
            <SettingsIcon size={18} class="text-tx-3" />
          </div>
          <div>
            <h2 class="text-base font-bold text-tx leading-tight">Settings</h2>
            <p class="text-[12px] text-tx-3 mt-0.5">Manage your preferences</p>
          </div>
        </div>

        {/* Tabs */}
        <div class="flex gap-1 px-7 shrink-0">
          {TABS.map((t) => (
            <button
              class="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-t-md border-b-2 transition-colors cursor-pointer outline-none"
              classList={{
                "border-[var(--blue)] text-tx": tab() === t,
                "border-transparent text-tx-3 hover:text-tx-2 hover:bg-surface/50": tab() !== t,
              }}
              onClick={() => {
                setTab(t);
                setError("");
              }}
            >
              {tabIcon(t)}
              {t}
            </button>
          ))}
        </div>
        <div class="border-b border-border shrink-0" />

        {/* Tab content */}
        <div class="relative">
          <div
            class="overflow-y-auto overflow-x-hidden px-7 py-5 transcript-scroll"
            style={{
              height: contentHeight() !== undefined ? `${contentHeight()! + 40}px` : "auto",
              "max-height": "calc(85vh - 220px)",
              transition: "height 200ms ease",
            }}
          >
            {/* ── Soniox tab ── */}
            <div
              ref={(el) => {
                tabRefs["Soniox"] = el;
                requestAnimationFrame(() => measureTab(tab()));
              }}
              class="flex flex-col gap-4"
              classList={{ hidden: tab() !== "Soniox" }}
            >
              <div>
                <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                  Model
                </label>
                {modelsLoading() ? (
                  <div class="flex items-center gap-2 text-tx-3 text-sm py-2.5 px-3.5">
                    <LoaderCircle size={14} class="animate-spin" />
                    Loading models…
                  </div>
                ) : models().length > 0 ? (
                  <div class="relative" ref={modelMenuRef}>
                    <button
                      type="button"
                      ref={(el) => requestAnimationFrame(() => el.focus())}
                      onClick={() => setModelMenuOpen((v) => !v)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" && modelMenuOpen()) {
                          e.stopPropagation();
                          setModelMenuOpen(false);
                          return;
                        }
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setModelMenuOpen((v) => !v);
                          return;
                        }
                        handleKeyDown(e);
                      }}
                      class={`${INPUT} appearance-none cursor-pointer pr-9 text-left flex items-center`}
                    >
                      <span class="truncate">
                        {(() => {
                          const m = models().find((x) => x.id === fields.model);
                          return m ? `${m.name} (${m.id})` : `${fields.model} (current)`;
                        })()}
                      </span>
                      <ChevronDown
                        size={16}
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-tx-3 pointer-events-none transition-transform"
                        classList={{ "rotate-180": modelMenuOpen() }}
                      />
                    </button>
                    <Show when={modelMenuOpen()}>
                      <div
                        role="listbox"
                        class="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-lg border border-border-lit bg-surface shadow-lg py-1.5"
                      >
                        <For each={models()}>
                          {(m) => (
                            <div
                              role="option"
                              aria-selected={fields.model === m.id}
                              onClick={() => {
                                setFields("model", m.id);
                                setModelMenuOpen(false);
                              }}
                              class="px-4 py-2.5 text-[14px] font-ui cursor-pointer transition-colors hover:bg-hover"
                              classList={{
                                "text-blue font-semibold": fields.model === m.id,
                                "text-tx": fields.model !== m.id,
                              }}
                            >
                              {m.name} ({m.id})
                            </div>
                          )}
                        </For>
                        <Show when={!models().some((m) => m.id === fields.model)}>
                          <div
                            role="option"
                            aria-selected={true}
                            class="px-4 py-2.5 text-[14px] font-ui text-blue font-semibold"
                          >
                            {fields.model} (current)
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="stt-rt-v4"
                    class={INPUT}
                    ref={(el) => requestAnimationFrame(() => el.focus())}
                    value={fields.model}
                    onInput={(e) => setFields("model", e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                  />
                )}
              </div>

              <div>
                <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                  Endpoint Detection
                </label>
                <label class="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fields.endpointDetection}
                    onChange={(e) => setFields("endpointDetection", e.currentTarget.checked)}
                    class="w-4 h-4 rounded border border-border bg-surface accent-[var(--blue)] cursor-pointer"
                  />
                  <span class="text-sm text-tx">Enabled</span>
                </label>
                <p class="text-[10px] text-tx-3 mt-1">
                  Segment transcription at natural speech pauses
                </p>
              </div>

              <div>
                <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                  API Key
                </label>
                <input
                  type="password"
                  placeholder={
                    keyExists()
                      ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (leave empty to keep)"
                      : "Enter your Soniox API key"
                  }
                  class={INPUT}
                  value={key()}
                  onInput={(e) => setKey(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>

            {/* ── Output tab ── */}
            <div
              ref={(el) => (tabRefs["Output"] = el)}
              class="flex flex-col gap-4"
              classList={{ hidden: tab() !== "Output" }}
            >
              <div>
                <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                  Review Time (seconds)
                </label>
                <input
                  type="text"
                  inputmode="numeric"
                  placeholder="10"
                  class={INPUT}
                  value={fields.reviewTime}
                  onInput={(e) => setFields("reviewTime", e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                />
                <p class="text-[10px] text-tx-3 mt-1">
                  Time to review translations before they are auto-confirmed
                </p>
              </div>
            </div>

            {/* ── Viz Engine tab ── */}
            <div
              ref={(el) => (tabRefs["Viz Engine"] = el)}
              class="flex flex-col gap-4"
              classList={{ hidden: tab() !== "Viz Engine" }}
            >
              <div class="flex gap-3">
                <div class="flex-1">
                  <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                    Host
                  </label>
                  <input
                    type="text"
                    placeholder="127.0.0.1"
                    class={INPUT}
                    value={fields.vizHost}
                    onInput={(e) => setFields("vizHost", e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <div class="w-24">
                  <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                    Port
                  </label>
                  <input
                    type="text"
                    inputmode="numeric"
                    placeholder="6100"
                    class={INPUT}
                    value={fields.vizPort}
                    onInput={(e) => setFields("vizPort", e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              </div>
              <div class="flex items-center gap-3">
                <Button
                  variant="ghost"
                  onClick={handleTestConnection}
                  disabled={testState().kind === "testing"}
                >
                  {testState().kind === "testing" ? (
                    <LoaderCircle size={14} class="animate-spin" />
                  ) : (
                    <Plug size={14} />
                  )}
                  {testState().kind === "testing" ? "Testing…" : "Test Connection"}
                </Button>
                {(() => {
                  const s = testState();
                  if (s.kind === "success") {
                    return (
                      <span class="flex items-center gap-1.5 text-[13px] text-green font-medium">
                        <CircleCheck size={14} />
                        Connected ({s.elapsedMs} ms)
                      </span>
                    );
                  }
                  if (s.kind === "error") {
                    return (
                      <span class="flex items-center gap-1.5 text-[13px] text-red font-medium">
                        <CircleX size={14} />
                        {s.message}
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                  Scene Path
                </label>
                <input
                  type="text"
                  placeholder="EXPRESS_24_7/TRANSLATION_BB/Translation_BB"
                  class={INPUT}
                  value={fields.vizScenePath}
                  onInput={(e) => setFields("vizScenePath", e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
              <div>
                <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                  Default Scroll Speed
                </label>
                <input
                  type="text"
                  inputmode="decimal"
                  placeholder="0.3"
                  class={INPUT}
                  value={fields.vizScrollSpeed}
                  onInput={(e) => setFields("vizScrollSpeed", e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                />
                <p class="text-[10px] text-tx-3 mt-1">Scroll velocity per frame (0.1 – 1.0)</p>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                  Auto-Pause on Idle
                </label>
                <label class="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fields.autoPauseOnIdle}
                    onChange={(e) => setFields("autoPauseOnIdle", e.currentTarget.checked)}
                    class="w-4 h-4 rounded border border-border bg-surface accent-[var(--blue)] cursor-pointer"
                  />
                  <span class="text-sm text-tx">Enabled</span>
                </label>
                <p class="text-[10px] text-tx-3 mt-1">Pause viz scroll when no new text arrives</p>
                <div class="mt-2">
                  <label class="text-[10px] text-tx-3 mb-1 block">Idle timeout (seconds)</label>
                  <input
                    type="text"
                    inputmode="numeric"
                    placeholder="10"
                    class={INPUT}
                    value={fields.autoPauseOnIdleSeconds}
                    onInput={(e) => setFields("autoPauseOnIdleSeconds", e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!fields.autoPauseOnIdle}
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-raised to-transparent" />
        </div>

        {/* Footer */}
        <div class="shrink-0 px-7 pb-6 pt-3">
          {error() && <div class="text-xs text-red mb-3 font-medium">{error()}</div>}
          <div class="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={props.onClose}>
              <X size={14} />
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving()}>
              <Save size={14} />
              {saving() ? "Saving\u2026" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
