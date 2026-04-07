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
    <div class="flex items-center justify-between h-14 px-6 bg-inset border-b border-border shrink-0">
      <div class="flex gap-5">
        <div class="flex items-center gap-2.5">
          <label class="text-[11px] font-semibold text-tx-3 tracking-wide whitespace-nowrap">Microphone</label>
          <div class="relative inline-flex items-center">
            <select
              class="rounded-md px-3 py-[7px] pr-9 text-[13px] font-ui font-semibold cursor-pointer outline-none min-w-[145px] transition-all"
              disabled={props.running()}
              value={selectedMic()}
              onChange={(e) => setSelectedMic(e.currentTarget.value)}
            >
              <option value="">Default</option>
              {mics().map((mic, i) => (
                <option value={mic.deviceId}>{mic.label || `Microphone ${i + 1}`}</option>
              ))}
            </select>
            <svg class="absolute right-2.5 w-4 h-4 text-tx-3 pointer-events-none" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="btn-primary h-[38px] px-5 text-[13px] font-semibold border-none rounded-md cursor-pointer font-ui inline-flex items-center gap-[7px] transition-all tracking-tight disabled:opacity-25 disabled:cursor-not-allowed disabled:pointer-events-none"
          disabled={props.running()}
          onClick={() => props.onStart(selectedMic())}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <polygon points="4,2 14,8 4,14" fill="currentColor" />
          </svg>
          Start
        </button>

        <button
          class={`h-[38px] px-5 text-[13px] font-semibold rounded-md cursor-pointer font-ui inline-flex items-center gap-[7px] transition-all tracking-tight disabled:opacity-25 disabled:cursor-not-allowed disabled:pointer-events-none bg-surface text-tx-3 border border-border btn-danger ${props.running() ? "active" : ""}`}
          disabled={!props.running()}
          onClick={props.onStop}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
          </svg>
          Stop
        </button>

        <button
          class="h-[38px] px-5 text-[13px] font-semibold rounded-md cursor-pointer font-ui inline-flex items-center gap-[7px] transition-all bg-transparent text-tx-3 border border-border hover:bg-surface hover:text-tx-2 hover:border-border-lit"
          onClick={props.onClear}
        >
          Clear
        </button>

        <div class="w-px h-5 bg-border mx-1" />

        <button
          class="w-[34px] h-[34px] rounded-full border border-border bg-surface text-tx-3 cursor-pointer flex items-center justify-center transition-all shrink-0 hover:bg-hover hover:text-tx-2 hover:border-border-lit"
          onClick={props.onSettings}
          aria-label="Settings"
        >
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
