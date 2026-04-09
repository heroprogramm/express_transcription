import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import Button from "./Button";
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

  onCleanup(() => {
    navigator.mediaDevices.removeEventListener("devicechange", populateMics);
  });

  return (
    <div class="flex items-center justify-between h-13 px-5 bg-inset border-b border-border shrink-0 surface-inset">
      <div class="flex items-center gap-2.5">
        <label class="text-[11px] font-semibold text-tx-4 tracking-wider uppercase whitespace-nowrap">
          Mic
        </label>
        <div class="relative inline-flex items-center">
          <select
            class="appearance-none bg-surface text-tx border border-border rounded-md px-2.5 py-[5px] pr-8 text-[13px] font-ui font-semibold cursor-pointer outline-none min-w-[130px] transition-all hover:bg-hover hover:border-border-lit focus:border-border-focus focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)] disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={props.running()}
            value={selectedMic()}
            onChange={(e) => setSelectedMic(e.currentTarget.value)}
          >
            <option value="">Default</option>
            {mics().map((mic, i) => (
              <option value={mic.deviceId}>{mic.label || `Microphone ${i + 1}`}</option>
            ))}
          </select>
          <svg
            class="absolute right-2 w-3.5 h-3.5 text-tx-4 pointer-events-none"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <Button
          variant="primary"
          disabled={props.running()}
          onClick={() => props.onStart(selectedMic())}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
            <polygon points="4,2 14,8 4,14" fill="currentColor" />
          </svg>
          Start
        </Button>

        <Button
          variant={props.running() ? "danger" : "ghost"}
          disabled={!props.running()}
          onClick={props.onStop}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
            <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
          </svg>
          Stop
        </Button>

        <Button variant="ghost" onClick={props.onClear}>
          Clear
        </Button>

        <div class="w-px h-4 bg-border mx-0.5" />

        <Button variant="icon" onClick={props.onSettings} aria-label="Settings" class="gear-spin">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Button>

        <ThemeToggle />
      </div>
    </div>
  );
}
