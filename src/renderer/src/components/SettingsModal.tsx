import { createSignal } from "solid-js";
import type { AppConfig } from "../lib/types";
import { saveApiKey, saveConfig } from "../lib/ipc";
import { reportError } from "../lib/errors";
import Button from "./Button";

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
      class="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="animate-modal bg-raised border border-border rounded-xl p-7 w-[400px] max-w-[90vw] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div class="flex items-center gap-3 mb-5">
          <div class="w-9 h-9 rounded-lg bg-surface flex items-center justify-center shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="text-tx-3"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div>
            <h2 class="text-base font-bold text-tx leading-tight">Settings</h2>
            <p class="text-[12px] text-tx-3 mt-0.5">Configure API and transcription</p>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <div>
            <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
              Soniox Model
            </label>
            <input
              type="text"
              placeholder="stt-rt-v4"
              class="bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-lg outline-none transition-all placeholder:text-tx-4"
              value={model()}
              onInput={(e) => setModel(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              autofocus
            />
          </div>

          <div>
            <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
              Soniox API Key
            </label>
            <input
              type="password"
              placeholder="sk-... (leave empty to keep current)"
              class="bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-lg outline-none transition-all placeholder:text-tx-4"
              value={key()}
              onInput={(e) => setKey(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div>
            <label class="text-[11px] font-semibold text-tx-3 tracking-wider uppercase mb-1.5 block">
              Feed Delay (seconds)
            </label>
            <input
              type="text"
              inputmode="numeric"
              placeholder="10"
              class="bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-lg outline-none transition-all placeholder:text-tx-4"
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
        <div class="flex gap-2 mt-5 justify-end">
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving()}>
            {saving() ? "Saving\u2026" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
