import { For, Show, type Accessor } from "solid-js";
import type { TranscriptEntry } from "@/lib/types";
import { useAutoScroll } from "@/lib/use-auto-scroll";
import AudioWaveform from "@/components/AudioWaveform";

function SpeechEmpty() {
  return (
    <div class="flex flex-col items-center justify-center h-full gap-4">
      <div class="empty-state-icon">
        <div class="flex items-center gap-[3px] h-6">
          {[0.3, 0.5, 0.8, 1, 0.8, 0.5, 0.3].map((h, i) => (
            <div
              class="waveform-bar-enhanced w-[3px] rounded-full"
              style={{
                height: `${h * 100}%`,
                "animation-delay": `${i * 0.25}s`,
                background: "var(--blue)",
              }}
            />
          ))}
        </div>
      </div>
      <div class="text-center">
        <p class="font-ui text-[14px] font-medium text-tx-3">AI-powered transcription</p>
        <p class="font-ui text-[12px] text-tx-4 mt-1.5">
          Press{" "}
          <kbd class="inline-block px-1.5 py-0.5 rounded bg-surface border border-border text-tx-3 font-semibold text-[11px]">
            Start
          </kbd>{" "}
          to begin
        </p>
      </div>
    </div>
  );
}

/** Props for the {@link SpeechPane} component. */
interface SpeechPaneProps {
  entries: Accessor<TranscriptEntry[]>;
  finalCount: Accessor<number>;
  live: Accessor<boolean>;
  micDeviceId: Accessor<string>;
}

/** RTL pane displaying live Urdu speech-to-text transcription entries. */
export default function SpeechPane(props: SpeechPaneProps) {
  let container: HTMLDivElement | undefined;
  const { onScroll } = useAutoScroll(
    () => container,
    () => props.entries().length,
  );

  return (
    <section
      class={`flex-1 flex flex-col min-w-0 overflow-hidden relative transition-all duration-500 ${props.live() ? "is-live" : ""}`}
    >
      <div class="flex justify-between items-center px-4 py-2.5 border-b border-border shrink-0">
        <div class="flex items-center gap-2.5">
          <h2 class="text-[13px] font-semibold text-tx-2 tracking-wide">Speech</h2>
          <Show when={props.live()}>
            <AudioWaveform active={props.live} micDeviceId={props.micDeviceId} />
          </Show>
        </div>
      </div>
      <div
        ref={container}
        onScroll={onScroll}
        class="transcript-scroll flex-1 overflow-y-auto px-4 py-2"
        dir="rtl"
      >
        <Show when={props.entries().length > 0} fallback={<SpeechEmpty />}>
          <For each={props.entries()}>
            {(entry) => (
              <div class="py-1">
                <div class="speech-card rounded-lg border border-border px-4 py-3">
                  <div class="flex justify-between items-center mb-1">
                    <div />
                    <span class="text-[10px] font-mono text-tx-4 tabular-nums">
                      {entry.timestamp}
                    </span>
                  </div>
                  <p class="font-urdu text-2xl leading-relaxed text-tx">{entry.text}</p>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}
