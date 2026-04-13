import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import { Play, Square, ChevronDown, Trash2 } from "lucide-solid";
import Button from "@/components/Button";

/** Props for the {@link Controls} component. */
interface Props {
  running: Accessor<boolean>;
  onStart: (micDeviceId: string) => void;
  onStop: () => void;
  onClear: () => void;
}

/** Toolbar with microphone selector and start/stop/clear session controls. */
export default function Controls(props: Props) {
  const [mics, setMics] = createSignal<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = createSignal("");

  async function populateMics() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setMics(devices.filter((d) => d.kind === "audioinput"));
  }

  function handleDeviceChange() {
    populateMics().catch(() => {});
  }

  onMount(() => {
    populateMics().catch(() => {});
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
  });

  onCleanup(() => {
    navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  });

  return (
    <div class="flex items-center justify-between h-13 px-3 pt-3 shrink-0">
      <div class="flex items-center gap-2.5">
        <label
          for="mic-select"
          class="text-[11px] font-semibold text-tx-4 tracking-wider uppercase whitespace-nowrap"
        >
          Mic
        </label>
        <div class="relative inline-flex items-center">
          <select
            id="mic-select"
            class="appearance-none bg-surface text-tx border border-border rounded-md px-2.5 py-[5px] pr-8 text-[13px] font-ui font-semibold cursor-pointer outline-none min-w-[130px] transition-all hover:bg-hover hover:border-border-lit focus:border-border-focus focus:shadow-[0_0_0_3px_var(--border)] disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={props.running()}
            value={selectedMic()}
            onChange={(e) => setSelectedMic(e.currentTarget.value)}
          >
            <option value="">Default</option>
            {mics().map((mic, i) => (
              <option value={mic.deviceId}>{mic.label || `Microphone ${i + 1}`}</option>
            ))}
          </select>
          <ChevronDown class="absolute right-2 w-3.5 h-3.5 text-tx-4 pointer-events-none" />
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <Button
          variant="primary"
          disabled={props.running()}
          onClick={() => props.onStart(selectedMic())}
          title="Start transcription (Space)"
        >
          <Play size={12} fill="currentColor" />
          Start
        </Button>

        <Button
          variant={props.running() ? "danger" : "ghost"}
          disabled={!props.running()}
          onClick={props.onStop}
          title="Stop transcription (Space)"
        >
          <Square size={12} fill="currentColor" />
          Stop
        </Button>

        <Button variant="ghost" onClick={props.onClear} class="!text-tx-2">
          <Trash2 size={12} />
          Clear
        </Button>
      </div>
    </div>
  );
}
