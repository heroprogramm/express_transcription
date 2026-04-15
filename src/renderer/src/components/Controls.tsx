import { createSignal, onMount, onCleanup, Show, type Accessor } from "solid-js";
import { Play, Square, ChevronDown, Trash2, Mic } from "lucide-solid";
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
  const [open, setOpen] = createSignal(false);
  let dropdownRef!: HTMLDivElement;

  const selectedLabel = () => {
    const id = selectedMic();
    if (!id) return "Default";
    const mic = mics().find((m) => m.deviceId === id);
    return mic?.label || "Microphone";
  };

  function select(deviceId: string) {
    setSelectedMic(deviceId);
    setOpen(false);
  }

  async function populateMics() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setMics(devices.filter((d) => d.kind === "audioinput"));
  }

  function handleDeviceChange() {
    populateMics().catch(() => {});
  }

  function handleClickOutside(e: MouseEvent) {
    if (open() && !dropdownRef.contains(e.target as Node)) {
      setOpen(false);
    }
  }

  onMount(() => {
    populateMics().catch(() => {});
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    document.addEventListener("mousedown", handleClickOutside);
  });

  onCleanup(() => {
    navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    document.removeEventListener("mousedown", handleClickOutside);
  });

  return (
    <div class="flex items-center justify-between px-3 py-3 shrink-0">
      <div ref={dropdownRef} class="relative flex items-center gap-2.5">
        <button
          type="button"
          class="inline-flex items-center gap-3 bg-surface text-tx border border-border rounded-lg pl-4 pr-3 h-[48px] text-[15px] font-ui font-semibold cursor-pointer outline-none min-w-[320px] transition-all hover:bg-hover hover:border-border-lit focus:border-border-focus focus:shadow-[0_0_0_3px_var(--border)] disabled:opacity-30 disabled:cursor-not-allowed"
          disabled={props.running()}
          onClick={() => setOpen((v) => !v)}
        >
          <Mic size={16} class="shrink-0 text-tx-3" />
          <span class="truncate flex-1 text-left">{selectedLabel()}</span>
          <ChevronDown
            size={14}
            class={`shrink-0 text-tx-4 transition-transform ${open() ? "rotate-180" : ""}`}
          />
        </button>

        <Show when={open()}>
          <div class="absolute top-full left-0 mt-1 z-50 min-w-[280px] max-h-[240px] overflow-y-auto rounded-lg border border-border-lit bg-surface shadow-lg py-1.5">
            <button
              type="button"
              class={`w-full text-left px-4 py-2.5 text-[14px] font-ui cursor-pointer transition-colors hover:bg-hover ${selectedMic() === "" ? "text-accent font-semibold" : "text-tx"}`}
              onClick={() => select("")}
            >
              Default
            </button>
            {mics().map((mic, i) => (
              <button
                type="button"
                class={`w-full text-left px-4 py-2.5 text-[14px] font-ui cursor-pointer transition-colors hover:bg-hover ${selectedMic() === mic.deviceId ? "text-accent font-semibold" : "text-tx"}`}
                onClick={() => select(mic.deviceId)}
              >
                {mic.label || `Microphone ${i + 1}`}
              </button>
            ))}
          </div>
        </Show>
      </div>

      <div class="flex items-center gap-2">
        <Button
          variant="success"
          size="lg"
          disabled={props.running()}
          onClick={() => props.onStart(selectedMic())}
          title="Start transcription (Space)"
        >
          <Play size={14} fill="currentColor" />
          Start
        </Button>

        <Button
          variant={props.running() ? "danger" : "ghost"}
          size="lg"
          disabled={!props.running()}
          onClick={props.onStop}
          title="Stop transcription (Space)"
        >
          <Square size={14} fill="currentColor" />
          Stop
        </Button>

        <Button variant="ghost" size="lg" onClick={props.onClear} class="!text-tx-2">
          <Trash2 size={14} />
          Clear
        </Button>
      </div>
    </div>
  );
}
