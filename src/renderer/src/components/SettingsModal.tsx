import { createSignal } from "solid-js";
import { Settings as SettingsIcon, X, Save } from "lucide-solid";
import type { AppConfig } from "@/lib/types";
import { saveApiKey, saveConfig } from "@/lib/ipc";
import { reportError } from "@/lib/errors";
import Button from "@/components/Button";

interface Props {
  config: AppConfig | null;
  onClose: () => void;
  onSaved: (config: AppConfig) => void;
}

export default function SettingsModal(props: Props) {
  const [key, setKey] = createSignal("");
  const [model, setModel] = createSignal(props.config?.soniox.model ?? "stt-rt-v4");
  const [feedDelay, setFeedDelay] = createSignal(
    String(props.config?.output.feed_delay_seconds ?? 10),
  );
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  async function handleSave() {
    const modelValue = model().trim();
    if (!modelValue) {
      setError("Model cannot be empty");
      return;
    }

    const delayNum = Number(feedDelay());
    if (!feedDelay().trim() || Number.isNaN(delayNum) || delayNum < 0) {
      setError("Feed delay must be a non-negative number");
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
      });

      props.onSaved(result.config);
      props.onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      reportError("settings", msg);
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
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="animate-modal bg-raised border border-border rounded-md p-7 w-[400px] max-w-[90vw] shadow-[0_20px_60px_var(--bg)]">
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
                value={model()}
                onInput={(e) => setModel(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            <div>
              <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
                API Key
              </label>
              <input
                type="password"
                placeholder="sk-... (leave empty to keep current)"
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
              value={feedDelay()}
              onInput={(e) => setFeedDelay(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
            <p class="text-[10px] text-tx-4 mt-1">
              Time to edit translations before they are sent to feed
            </p>
          </div>
        </div>

        {error() && <div class="text-xs text-red mt-3 font-medium">{error()}</div>}
        <div class="flex items-center gap-2 mt-5 justify-between">
          <span class="kbd-hint text-[10px] text-tx-4 font-mono">
            <kbd class="kbd">Enter</kbd> save &middot; <kbd class="kbd">Esc</kbd> close
          </span>
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
