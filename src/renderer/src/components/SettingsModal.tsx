import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { Settings as SettingsIcon, X, Save } from "lucide-solid";
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

/** Modal dialog for editing Soniox API key, model, and output feed delay settings. */
export default function SettingsModal(props: Props) {
  const [key, setKey] = createSignal("");
  const [keyExists, setKeyExists] = createSignal(false);
  const [fields, setFields] = createStore({
    model: props.config?.soniox.model ?? "stt-rt-v4",
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
      setError("Model cannot be empty");
      return;
    }

    const delayNum = Number(fields.feedDelay);
    if (!fields.feedDelay.trim() || Number.isNaN(delayNum) || delayNum < 0) {
      setError("Feed delay must be a non-negative number");
      return;
    }

    const portNum = Number(fields.vizPort);
    if (!fields.vizPort.trim() || Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError("Viz port must be a number between 1 and 65535");
      return;
    }

    const speedNum = Number(fields.vizScrollSpeed);
    if (Number.isNaN(speedNum) || speedNum < 0.1 || speedNum > 1.0) {
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
      <div class="animate-modal bg-raised border border-border rounded-md p-7 w-[560px] max-w-[90vw] shadow-[0_20px_60px_var(--bg)]">
        <div class="flex items-center gap-3 mb-5">
          <div class="w-9 h-9 rounded-md bg-surface flex items-center justify-center shrink-0">
            <SettingsIcon size={18} class="text-tx-3" />
          </div>
          <div>
            <h2 class="text-base font-bold text-tx leading-tight">Settings</h2>
            <p class="text-[12px] text-tx-3 mt-0.5">Manage your preferences</p>
          </div>
        </div>

        {/* ── Soniox section ── */}
        <div class="mb-5">
          <h3 class="text-[10px] font-bold text-tx-4 tracking-widest uppercase mb-3">Soniox</h3>
          <div class="flex flex-col gap-4">
            <div>
              <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                Model
              </label>
              <input
                type="text"
                placeholder="stt-rt-v4"
                class="settings-input bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-md outline-none transition-all placeholder:text-tx-4"
                ref={(el) => requestAnimationFrame(() => el.focus())}
                value={fields.model}
                onInput={(e) => setFields("model", e.currentTarget.value)}
                onKeyDown={handleKeyDown}
              />
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
                class="settings-input bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-md outline-none transition-all placeholder:text-tx-4"
                value={key()}
                onInput={(e) => setKey(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>
        </div>

        {/* ── Output section ── */}
        <div class="border-t border-border pt-5">
          <h3 class="text-[10px] font-bold text-tx-4 tracking-widest uppercase mb-3">Output</h3>
          <div>
            <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
              Feed Delay (seconds)
            </label>
            <input
              type="text"
              inputmode="numeric"
              placeholder="10"
              class="settings-input bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-md outline-none transition-all placeholder:text-tx-4"
              value={fields.feedDelay}
              onInput={(e) => setFields("feedDelay", e.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
            <p class="text-[10px] text-tx-4 mt-1">
              Time to edit translations before they are sent to feed
            </p>
          </div>
        </div>

        {/* ── Viz Engine section ── */}
        <div class="border-t border-border pt-5 mt-5">
          <h3 class="text-[10px] font-bold text-tx-4 tracking-widest uppercase mb-3">Viz Engine</h3>
          <div class="flex flex-col gap-4">
            <div class="flex gap-3">
              <div class="flex-1">
                <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                  Host
                </label>
                <input
                  type="text"
                  placeholder="127.0.0.1"
                  class="settings-input bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-md outline-none transition-all placeholder:text-tx-4"
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
                  class="settings-input bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-md outline-none transition-all placeholder:text-tx-4"
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
                class="settings-input bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-md outline-none transition-all placeholder:text-tx-4"
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
                class="settings-input bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-md outline-none transition-all placeholder:text-tx-4"
                value={fields.vizScrollSpeed}
                onInput={(e) => setFields("vizScrollSpeed", e.currentTarget.value)}
                onKeyDown={handleKeyDown}
              />
              <p class="text-[10px] text-tx-4 mt-1">Scroll velocity per frame (0.1 – 1.0)</p>
            </div>
          </div>
        </div>

        {error() && <div class="text-xs text-red mt-3 font-medium">{error()}</div>}
        <div class="flex items-center gap-2 mt-5 justify-end">
          <div class="flex gap-2">
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
