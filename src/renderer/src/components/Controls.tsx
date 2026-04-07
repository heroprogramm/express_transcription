import { createSignal, onMount, type Accessor } from "solid-js";
import ThemeToggle from "./ThemeToggle";

interface Props {
  running: Accessor<boolean>;
  onStart: (micDeviceId: string) => void;
  onStop: () => void;
  onClear: () => void;
  onSettings: () => void;
}

export default function Controls(props: Props) {
  const [mics, setMics] = createSignal<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = createSignal("");

  async function populateMics() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setMics(devices.filter((d) => d.kind === "audioinput"));
  }

  onMount(() => {
    populateMics();
    navigator.mediaDevices.addEventListener("devicechange", populateMics);
  });

  return (
    <div class="controls">
      <div class="controls-left">
        <div class="control-group">
          <label class="control-label">Microphone</label>
          <div class="select-wrap">
            <select
              disabled={props.running()}
              value={selectedMic()}
              onChange={(e) => setSelectedMic(e.currentTarget.value)}
            >
              <option value="">Default</option>
              {mics().map((mic, i) => (
                <option value={mic.deviceId}>
                  {mic.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
            <svg class="select-chevron" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
        </div>
      </div>
      <div class="controls-right">
        <button
          class="btn btn-primary"
          disabled={props.running()}
          onClick={() => props.onStart(selectedMic())}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <polygon points="4,2 14,8 4,14" fill="currentColor" />
          </svg>
          Start
        </button>
        <button
          class={`btn btn-danger ${props.running() ? "active" : ""}`}
          disabled={!props.running()}
          onClick={props.onStop}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
          </svg>
          Stop
        </button>
        <button class="btn btn-ghost" onClick={props.onClear}>Clear</button>
        <div class="controls-sep" />
        <button class="btn-icon" onClick={props.onSettings} aria-label="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}
