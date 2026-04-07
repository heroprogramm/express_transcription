import { createSignal } from "solid-js";
import { saveApiKey } from "../lib/tauri-bridge";

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
      <div class="bg-raised border border-border rounded-[14px] p-8 w-[420px] max-w-[90vw] shadow-2xl">
        <h2 class="text-lg font-bold text-tx mb-1">Soniox API Key</h2>
        <p class="text-[13px] text-tx-3 mb-6">
          Enter your Soniox API key to enable speech-to-text transcription.
        </p>
        <label class="block text-xs font-semibold text-tx-2 mb-1">API Key</label>
        <input
          type="password"
          placeholder="Enter your Soniox API key"
          class="bg-surface text-tx border border-border focus:border-border-focus w-full px-3.5 py-2.5 text-sm font-mono rounded-md outline-none transition-colors"
          value={key()}
          onInput={(e) => setKey(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autofocus
        />
        {error() && <div class="text-xs text-red mt-2">{error()}</div>}
        <div class="flex gap-2 mt-6 justify-end">
          <button
            class="h-[38px] px-5 text-[13px] font-semibold rounded-md cursor-pointer font-ui inline-flex items-center transition-all bg-transparent text-tx-3 border border-border hover:bg-surface hover:text-tx-2"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            class="bg-green-soft text-white shadow-[0_1px_4px_rgba(52,211,153,0.2)] hover:not-disabled:bg-green hover:not-disabled:shadow-[0_2px_12px_rgba(52,211,153,0.3)] hover:not-disabled:-translate-y-px h-[38px] px-5 text-[13px] font-semibold border-none rounded-md cursor-pointer font-ui inline-flex items-center transition-all disabled:opacity-25 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving()}
          >
            {saving() ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
