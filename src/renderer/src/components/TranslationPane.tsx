import { createSignal, For, Show, type Accessor } from "solid-js";
import { EntryStatus, type TranslationEntry } from "@/lib/types";
import { useAutoScroll } from "@/lib/use-auto-scroll";

function TranslationEmpty() {
  return (
    <div class="flex flex-col items-center justify-center h-full gap-4">
      <div class="empty-state-icon">
        <svg
          class="animate-[spin_10s_linear_infinite]"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--violet)"
          stroke-width="1"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </div>
      <div class="text-center">
        <p class="font-ui text-[14px] font-medium text-tx-3">Translations will appear here</p>
        <p class="font-ui text-[12px] text-tx-4 mt-1.5">Speech is translated in real time</p>
      </div>
    </div>
  );
}

/** Props for the {@link TranslationPane} component. */
interface TransPaneProps {
  entries: Accessor<TranslationEntry[]>;
  live: Accessor<boolean>;
  tick: Accessor<number>;
  feedDelayMs: () => number;
  onStartEdit: (id: number) => void;
  onSaveEdit: (id: number, text: string) => void;
  onCancelEdit: (id: number) => void;
  onEditChange: (id: number, text: string) => void;
}

function TranslationEntryRow(props: {
  entry: TranslationEntry;
  isNew: boolean;
  isLatest: boolean;
  tick: Accessor<number>;
  feedDelayMs: () => number;
  onStartEdit: (id: number) => void;
  onSaveEdit: (id: number, text: string) => void;
  onCancelEdit: (id: number) => void;
  onEditChange: (id: number, text: string) => void;
}) {
  const [editText, setEditText] = createSignal(props.entry.text);

  const isPending = () => props.entry.status === EntryStatus.Pending;
  const isEditing = () => props.entry.status === EntryStatus.Editing;
  const isConfirmed = () => props.entry.status === EntryStatus.Confirmed;
  const isSent = () => props.entry.status === EntryStatus.Sent;

  const remaining = () => {
    const now = props.tick();
    return Math.max(0, Math.ceil((props.feedDelayMs() - (now - props.entry.createdAt)) / 1000));
  };

  let cancelled = false;

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.stopPropagation();
      props.onSaveEdit(props.entry.id, editText());
    } else if (e.key === "Escape") {
      e.stopPropagation();
      cancelled = true;
      props.onCancelEdit(props.entry.id);
    }
  }

  return (
    <div
      class={`${props.isNew ? "animate-entry" : ""} transition-all duration-200 relative py-5 border-b border-border/30`}
      classList={{
        "cursor-pointer hover:bg-surface/50 rounded-md px-3": isPending(),
        "z-10": isEditing(),
      }}
      onClick={() => isPending() && props.onStartEdit(props.entry.id)}
      onKeyDown={(e: KeyboardEvent) => {
        if ((e.key === "Enter" || e.key === " ") && isPending()) {
          e.preventDefault();
          props.onStartEdit(props.entry.id);
        }
      }}
      tabIndex={isPending() ? 0 : undefined}
      role={isPending() ? "button" : undefined}
    >
      <Show
        when={!isEditing()}
        fallback={
          <div class="border border-border-lit rounded-lg px-5 py-2.5 bg-surface transition-all duration-150 focus-within:border-violet-soft focus-within:ring-3 focus-within:ring-violet/12">
            <input
              ref={(el) => requestAnimationFrame(() => el.focus())}
              class="w-full bg-transparent border-none outline-none text-xl leading-relaxed text-tx"
              value={editText()}
              onInput={(e) => {
                setEditText(e.currentTarget.value);
                props.onEditChange(props.entry.id, e.currentTarget.value);
              }}
              onKeyDown={handleKeyDown}
              onFocusOut={() => {
                if (!cancelled) props.onSaveEdit(props.entry.id, editText());
              }}
            />
          </div>
        }
      >
        <p
          class="text-xl leading-relaxed transition-colors duration-300"
          classList={{
            "text-[var(--blue)]": props.isLatest && isPending(),
            "text-st-pending": !props.isLatest && isPending(),
            "text-tx": isConfirmed(),
            "text-tx-3": isSent(),
          }}
        >
          {props.entry.text}
        </p>
      </Show>
      <div class="flex items-center gap-2 mt-1">
        <span class="text-[10px] font-mono text-tx-4 tabular-nums">{props.entry.timestamp}</span>
        <Show when={isConfirmed() || isSent()}>
          <span class="text-green text-[14px]">&#10003;</span>
        </Show>
        <Show when={isPending()}>
          <span class="text-[10px] font-mono tabular-nums bg-violet-soft/20 text-st-pending border border-violet/20 rounded-full px-2 py-0.5">
            {remaining()}s
          </span>
        </Show>
      </div>
    </div>
  );
}

/**
 * Pane displaying translated entries with inline editing support
 * and a countdown timer before entries are sent to the output feed.
 */
export default function TranslationPane(props: TransPaneProps) {
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
        <div class="flex items-center gap-2">
          <h2 class="text-[13px] font-semibold text-tx-2 tracking-wide">Translation</h2>
        </div>
      </div>
      <div class="flex-1 min-h-0">
        <div
          ref={container}
          onScroll={onScroll}
          class="transcript-scroll h-full overflow-y-auto px-4"
        >
          <Show when={props.entries().length > 0} fallback={<TranslationEmpty />}>
            <For each={props.entries()}>
              {(entry, i) => (
                <TranslationEntryRow
                  entry={entry}
                  isNew={Date.now() - entry.createdAt < 500}
                  isLatest={i() === props.entries().length - 1}
                  tick={props.tick}
                  feedDelayMs={props.feedDelayMs}
                  onStartEdit={props.onStartEdit}
                  onSaveEdit={props.onSaveEdit}
                  onCancelEdit={props.onCancelEdit}
                  onEditChange={props.onEditChange}
                />
              )}
            </For>
          </Show>
        </div>
      </div>
    </section>
  );
}
