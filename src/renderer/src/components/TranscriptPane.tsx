import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  For,
  Show,
  type Accessor,
} from "solid-js";
import { Check, X } from "lucide-solid";
import { EntryStatus, type TranscriptEntry, type TranslationEntry } from "@/lib/types";
import { useVirtualList } from "@/lib/virtual-list";
import AudioWaveform from "@/components/AudioWaveform";

const STT_ITEM_HEIGHT = 48;
const TRANS_ITEM_HEIGHT = 48;

function SpeechEmpty() {
  return (
    <div class="flex flex-col items-center justify-center h-full -mt-12 gap-4">
      <div class="empty-state-icon">
        <div class="flex items-end gap-[3px] h-6">
          {[0.5, 0.8, 0.4, 1, 0.6, 0.9, 0.3].map((h, i) => (
            <div
              class="waveform-bar-enhanced w-[3px] rounded-full bg-tx-3"
              style={{
                height: `${h * 100}%`,
                "animation-delay": `${i * 0.25}s`,
              }}
            />
          ))}
        </div>
      </div>
      <div class="text-center">
        <p class="font-ui text-[13px] font-medium text-tx-3">Waiting for audio input</p>
        <p class="font-ui text-[11px] text-tx-4 mt-1">Press Start to begin transcription</p>
      </div>
    </div>
  );
}

function TranslationEmpty() {
  return (
    <div class="flex flex-col items-center justify-center h-full -mt-12 gap-4">
      <div class="empty-state-icon">
        <svg
          class="animate-[spin_20s_linear_infinite]"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--burgundy)"
          stroke-width="1"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </div>
      <div class="text-center">
        <p class="font-ui text-[13px] font-medium text-tx-3">Translations will appear here</p>
        <p class="font-ui text-[11px] text-tx-4 mt-1">Speech is translated in real time</p>
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

/** Virtualized RTL pane displaying live Urdu speech-to-text transcription entries. */
export function SpeechPane(props: SpeechPaneProps) {
  let container: HTMLDivElement | undefined;
  const vl = useVirtualList(props.entries, () => container, STT_ITEM_HEIGHT);

  return (
    <section
      class={`surface-raised flex-1 flex flex-col min-w-0 bg-raised border border-border rounded-md overflow-hidden relative transition-all duration-500 ${props.live() ? "is-live" : ""}`}
    >
      <div class="flex justify-between items-center px-4 py-2.5 border-b border-border shrink-0">
        <div class="flex items-center gap-2.5">
          <h2 class="text-[12px] font-bold text-tx-2 tracking-wider uppercase">Speech</h2>
          <Show when={props.live()}>
            <AudioWaveform active={props.live} micDeviceId={props.micDeviceId} />
          </Show>
        </div>
        <span class="text-[11px] text-tx-4 font-mono tabular-nums">
          <Show when={props.finalCount() > 0}>{props.finalCount()} lines</Show>
        </span>
      </div>
      <div
        ref={container}
        onScroll={vl.onScroll}
        class="transcript-scroll flex-1 overflow-y-auto px-4 font-mono text-sm leading-relaxed break-words"
        dir="rtl"
      >
        <Show when={props.entries().length > 0} fallback={<SpeechEmpty />}>
          <div style={{ height: `${vl.virtualizer.getTotalSize()}px`, position: "relative" }}>
            <For each={vl.virtualizer.getVirtualItems()}>
              {(vItem) => {
                const entry = createMemo(() => props.entries()[vItem.index]);
                return (
                  <div
                    data-index={vItem.index}
                    ref={vl.virtualizer.measureElement}
                    class="flex items-center gap-2 py-1.5 absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${vItem.start}px)` }}
                  >
                    <span
                      class={`text-[9px] font-medium font-mono tracking-wide tabular-nums shrink-0 ${entry().isPartial ? "text-st-pending" : "text-tx-4 opacity-60"}`}
                    >
                      {entry().timestamp}
                    </span>
                    <span
                      class={`font-urdu text-xl leading-snug ${entry().isPartial ? "text-tx-3" : "text-tx"}`}
                    >
                      {entry().text}
                    </span>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </section>
  );
}

/** Props for the {@link TranslationPane} component. */
interface TransPaneProps {
  entries: Accessor<TranslationEntry[]>;
  live: Accessor<boolean>;
  feedDelayMs: () => number;
  onStartEdit: (id: number) => void;
  onSaveEdit: (id: number, text: string) => void;
  onCancelEdit: (id: number) => void;
  onEditChange: (id: number, text: string) => void;
}

function TranslationEntryRow(props: {
  entry: TranslationEntry;
  isNew: boolean;
  feedDelayMs: () => number;
  onStartEdit: (id: number) => void;
  onSaveEdit: (id: number, text: string) => void;
  onCancelEdit: (id: number) => void;
  onEditChange: (id: number, text: string) => void;
}) {
  const [editText, setEditText] = createSignal(props.entry.text);
  const [remaining, setRemaining] = createSignal(0);

  const isPending = () => props.entry.status === EntryStatus.Pending;
  const isEditing = () => props.entry.status === EntryStatus.Editing;
  const isConfirmed = () => props.entry.status === EntryStatus.Confirmed;
  const isSent = () => props.entry.status === EntryStatus.Sent;

  let countdownInterval: ReturnType<typeof setInterval> | undefined;

  function startCountdown() {
    updateRemaining();
    countdownInterval = setInterval(updateRemaining, 500);
  }

  function updateRemaining() {
    const elapsed = Date.now() - props.entry.createdAt;
    const left = Math.max(0, Math.ceil((props.feedDelayMs() - elapsed) / 1000));
    setRemaining(left);
  }

  createEffect(() => {
    if (isPending()) {
      startCountdown();
    } else if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = undefined;
    }
  });

  onCleanup(() => {
    if (countdownInterval) clearInterval(countdownInterval);
  });

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      props.onSaveEdit(props.entry.id, editText());
    } else if (e.key === "Escape") {
      props.onCancelEdit(props.entry.id);
    }
  }

  const duration = props.entry.text.length / 80;

  return (
    <div
      class="animate-entry text-base font-medium leading-relaxed flex items-center border-l-2 pl-2 transition-all duration-200 relative py-1.5"
      classList={{
        "border-l-st-pending text-st-pending cursor-pointer hover:bg-hover": isPending(),
        "editing-row border-l-st-editing text-st-editing z-10": isEditing(),
        "border-l-border-lit text-st-confirmed": isConfirmed(),
        "border-l-border text-st-sent": isSent(),
      }}
      onClick={() => isPending() && props.onStartEdit(props.entry.id)}
    >
      <span class="inline text-[9px] font-medium font-mono text-tx-3 tracking-wide mr-2 tabular-nums shrink-0">
        {props.entry.timestamp}
      </span>
      <Show
        when={!isEditing()}
        fallback={
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <input
              ref={(el) => requestAnimationFrame(() => el.focus())}
              class="editing-input flex-1 min-w-0 bg-surface border border-border-lit rounded-md px-2 py-1 text-base text-tx outline-none focus:border-border-focus"
              value={editText()}
              onInput={(e) => {
                setEditText(e.currentTarget.value);
                props.onEditChange(props.entry.id, e.currentTarget.value);
              }}
              onKeyDown={handleKeyDown}
              onFocusOut={() => props.onSaveEdit(props.entry.id, editText())}
            />
            <button
              class="editing-btn editing-btn-save shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                props.onSaveEdit(props.entry.id, editText());
              }}
              title="Save (Enter)"
            >
              <Check size={12} />
            </button>
            <button
              class="editing-btn editing-btn-cancel shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                props.onCancelEdit(props.entry.id);
              }}
              title="Cancel (Esc)"
            >
              <X size={12} />
            </button>
          </div>
        }
      >
        <span
          class={props.isNew && isPending() ? "type-reveal" : undefined}
          style={
            props.isNew && isPending()
              ? { "--type-steps": props.entry.text.length, "--type-dur": `${duration}s` }
              : undefined
          }
        >
          {props.entry.text}
        </span>
      </Show>
      <Show when={isSent()}>
        <span class="text-tx-3 text-[12px] ml-auto pl-2 shrink-0">&#10003;</span>
      </Show>
      <Show when={isPending()}>
        <span class="text-[12px] font-mono text-tx-3 ml-auto pl-2 shrink-0 tabular-nums">
          {remaining()}s
        </span>
      </Show>
    </div>
  );
}

/**
 * Virtualized pane displaying translated entries with inline editing support
 * and a countdown timer before entries are sent to the output feed.
 */
export function TranslationPane(props: TransPaneProps) {
  let container: HTMLDivElement | undefined;
  const count = createMemo(() => props.entries().length);
  const vl = useVirtualList(props.entries, () => container, TRANS_ITEM_HEIGHT);
  let lastSeenId = -1;

  return (
    <section
      class={`surface-raised flex-1 flex flex-col min-w-0 bg-raised border border-border rounded-md overflow-hidden relative transition-all duration-500 ${props.live() ? "is-live" : ""}`}
    >
      <div class="flex justify-between items-center px-4 py-2.5 border-b border-border shrink-0">
        <div class="flex items-center gap-2">
          <h2 class="text-[12px] font-bold text-tx-2 tracking-wider uppercase">Translation</h2>
        </div>
        <span class="text-[11px] text-tx-4 font-mono tabular-nums">
          <Show when={count() > 0}>{count()} lines</Show>
        </span>
      </div>
      <div
        ref={container}
        onScroll={vl.onScroll}
        class="transcript-scroll flex-1 overflow-y-auto px-4 font-mono text-sm leading-relaxed break-words"
      >
        <Show when={props.entries().length > 0} fallback={<TranslationEmpty />}>
          <div style={{ height: `${vl.virtualizer.getTotalSize()}px`, position: "relative" }}>
            <For each={vl.virtualizer.getVirtualItems()}>
              {(vItem) => {
                const entry = createMemo(() => props.entries()[vItem.index]);
                let seenId = -1;

                return (
                  <div
                    data-index={vItem.index}
                    ref={vl.virtualizer.measureElement}
                    class="absolute top-0 left-0 w-full"
                    style={{
                      transform: `translateY(${vItem.start}px)`,
                      "z-index": entry().status === EntryStatus.Editing ? 10 : undefined,
                    }}
                  >
                    {(() => {
                      const e = entry();
                      const isNew = e.id > seenId || e.id > lastSeenId;
                      if (isNew) {
                        seenId = e.id;
                        lastSeenId = Math.max(lastSeenId, e.id);
                      }
                      return (
                        <TranslationEntryRow
                          entry={e}
                          isNew={isNew}
                          feedDelayMs={props.feedDelayMs}
                          onStartEdit={props.onStartEdit}
                          onSaveEdit={props.onSaveEdit}
                          onCancelEdit={props.onCancelEdit}
                          onEditChange={props.onEditChange}
                        />
                      );
                    })()}
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </section>
  );
}
