import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { Settings as SettingsIcon, X, Save, Mic, MonitorPlay, FileOutput } from "lucide-solid";
import type { AppConfig } from "@/lib/types";
import { hasApiKey, saveApiKey, saveConfig } from "@/lib/ipc";
import { reportError } from "@/lib/errors";
import Button from "@/components/Button";

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
    feedDelay: String(props.config?.output.feed_delay_seconds ?? 10),
    vizHost: props.config?.viz.host ?? "127.0.0.1",
    vizPort: String(props.config?.viz.port ?? 6100),
    vizScenePath: props.config?.viz.scene_path ?? "",
    vizScrollSpeed: String(props.config?.viz.scroll_speed ?? 0.3),
  });
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  hasApiKey()
    .then(setKeyExists)
    .catch(() => {});

  async function handleSave() {
    const modelValue = fields.model.trim();
    if (!modelValue) {
      setTab("Soniox");
      setError("Model cannot be empty");
      return;
    }

    const delayNum = Number(fields.feedDelay);
    if (!fields.feedDelay.trim() || Number.isNaN(delayNum) || delayNum < 0) {
      setTab("Output");
      setError("Feed delay must be a non-negative number");
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
        feed_delay_seconds: delayNum,
        viz_host: fields.vizHost.trim(),
        viz_port: portNum,
        viz_scene_path: fields.vizScenePath.trim(),
        viz_scroll_speed: speedNum,
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
      <div class="animate-modal bg-raised border border-border rounded-md w-[600px] max-w-[90vw] shadow-[0_20px_60px_var(--bg)] flex flex-col max-h-[85vh]">
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
        <div class="overflow-y-auto px-7 py-5 h-[340px]">
          {/* ── Soniox tab ── */}
          <div class="flex flex-col gap-4" classList={{ hidden: tab() !== "Soniox" }}>
            <div>
              <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                Model
              </label>
              <input
                type="text"
                placeholder="stt-rt-v4"
                class={INPUT}
                ref={(el) => requestAnimationFrame(() => el.focus())}
                value={fields.model}
                onInput={(e) => setFields("model", e.currentTarget.value)}
                onKeyDown={handleKeyDown}
              />
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
              <p class="text-[10px] text-tx-4 mt-1">
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
          <div class="flex flex-col gap-4" classList={{ hidden: tab() !== "Output" }}>
            <div>
              <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                Feed Delay (seconds)
              </label>
              <input
                type="text"
                inputmode="numeric"
                placeholder="10"
                class={INPUT}
                value={fields.feedDelay}
                onInput={(e) => setFields("feedDelay", e.currentTarget.value)}
                onKeyDown={handleKeyDown}
              />
              <p class="text-[10px] text-tx-4 mt-1">
                Time to edit translations before they are sent to feed
              </p>
            </div>
          </div>

          {/* ── Viz Engine tab ── */}
          <div class="flex flex-col gap-4" classList={{ hidden: tab() !== "Viz Engine" }}>
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
              <p class="text-[10px] text-tx-4 mt-1">Scroll velocity per frame (0.1 – 1.0)</p>
            </div>
          </div>
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
