import { createSignal } from "solid-js";
import { saveApiKey } from "../lib/ipc";
import Button from "./Button";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function SettingsModal(props: Props) {
  const [key, setKey] = createSignal("");
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  async function handleSave() {
    const value = key().trim();
    if (!value) {
      setError("API key cannot be empty");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveApiKey(value);
      props.onSaved();
      props.onClose();
    } catch (e) {
      setError(`Failed to save: ${e}`);
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
          <div class="w-9 h-9 rounded-lg bg-amber/10 flex items-center justify-center shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--amber)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
          </div>
          <div>
            <h2 class="text-base font-bold text-tx leading-tight">API Key</h2>
            <p class="text-[12px] text-tx-3 mt-0.5">Enter your Soniox key for speech-to-text.</p>
          </div>
        </div>
        <input
          type="password"
          placeholder="sk-..."
          class="bg-surface text-tx border border-border focus:border-border-focus focus:shadow-[0_0_0_3px_rgba(245,183,49,0.08)] w-full px-3.5 py-2.5 text-sm font-mono rounded-lg outline-none transition-all placeholder:text-tx-4"
          value={key()}
          onInput={(e) => setKey(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autofocus
        />
        {error() && <div class="text-xs text-red mt-2 font-medium">{error()}</div>}
        <div class="flex gap-2 mt-5 justify-end">
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving()}>
            {saving() ? "Saving\u2026" : "Save Key"}
          </Button>
        </div>
      </div>
    </div>
  );
}
