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
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="modal">
        <h2>Soniox API Key</h2>
        <p>Enter your Soniox API key to enable speech-to-text transcription.</p>
        <label>API Key</label>
        <input
          type="password"
          placeholder="Enter your Soniox API key"
          value={key()}
          onInput={(e) => setKey(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autofocus
        />
        {error() && <div class="modal-error">{error()}</div>}
        <div class="modal-actions">
          <button class="btn btn-ghost" onClick={props.onClose}>Cancel</button>
          <button class="btn btn-primary" onClick={handleSave} disabled={saving()}>
            {saving() ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
