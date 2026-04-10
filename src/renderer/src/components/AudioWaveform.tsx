import { createSignal, onCleanup, createEffect, type Accessor } from "solid-js";
import { startAudioLevel, stopAudioLevel } from "@/lib/audio-level";

const BAR_COUNT = 20;

interface Props {
  active: Accessor<boolean>;
  micDeviceId: Accessor<string>;
}

export default function AudioWaveform(props: Props) {
  const [bars, setBars] = createSignal<number[]>(Array.from({ length: BAR_COUNT }, () => 0));

  createEffect(() => {
    if (props.active()) {
      startAudioLevel(props.micDeviceId() || undefined, BAR_COUNT, setBars).catch(() => {});
    } else {
      stopAudioLevel();
      setBars(Array.from({ length: BAR_COUNT }, () => 0));
    }
  });

  onCleanup(() => stopAudioLevel());

  return (
    <div class="flex items-center gap-[1.5px] h-4">
      {bars().map((level) => (
        <div class="w-[2px] rounded-full bg-tx-3" style={{ height: `${level * 100}%` }} />
      ))}
    </div>
  );
}
