import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  For,
  Show,
  type Accessor,
} from "solid-js";
import type { TranscriptEntry, TranslationEntry } from "../lib/types";

const OVERSCAN = 5;

function useVirtualList<T extends { id: number }>(
  entries: Accessor<T[]>,
  containerRef: () => HTMLDivElement | undefined,
  itemHeight: number,
) {
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewHeight, setViewHeight] = createSignal(400);
  const [autoScroll, setAutoScroll] = createSignal(true);
  let scrollRafId: number | null = null;
  let autoScrollRafId: number | null = null;

  function onScroll(e: Event) {
    const el = e.currentTarget as HTMLDivElement;
    if (scrollRafId) cancelAnimationFrame(scrollRafId);
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null;
      setScrollTop(el.scrollTop);
      setViewHeight(el.clientHeight);
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < itemHeight * 2;
      setAutoScroll(atBottom);
    });
  }

  // Track entry count as a memo so the effect dependency is a scalar, not the full array
  const entryCount = createMemo(() => entries().length);

  createEffect(() => {
    void entryCount();
    if (autoScroll()) {
      if (autoScrollRafId) cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = requestAnimationFrame(() => {
        autoScrollRafId = null;
        const el = containerRef();
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  });

  onCleanup(() => {
    if (scrollRafId) cancelAnimationFrame(scrollRafId);
    if (autoScrollRafId) cancelAnimationFrame(autoScrollRafId);
  });

  const totalHeight = createMemo(() => entries().length * itemHeight);

  const visibleRange = createMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop() / itemHeight) - OVERSCAN);
    const end = Math.min(
      entries().length,
      Math.ceil((scrollTop() + viewHeight()) / itemHeight) + OVERSCAN,
    );
    return { start, end };
  });

  const visibleItems = createMemo(() => {
    const { start, end } = visibleRange();
    return entries().slice(start, end);
  });

  const offsetY = createMemo(() => visibleRange().start * itemHeight);

  return { totalHeight, visibleItems, offsetY, onScroll, itemHeight };
}

const STT_ITEM_HEIGHT = 56;
const TRANS_ITEM_HEIGHT = 40;

function SpeechEmpty() {
  return (
    <div class="flex flex-col items-center justify-center h-full -mt-12 gap-4">
      <div class="flex items-end gap-[3px] h-10">
        {[0.6, 0.3, 0.8, 0.5, 1, 0.4, 0.7, 0.3, 0.9, 0.5, 0.6, 0.4, 0.8, 0.3, 0.7, 0.5].map(
          (h, i) => (
            <div
              class="waveform-bar-enhanced w-[3px] rounded-full"
              style={{
                height: `${h * 100}%`,
                "animation-delay": `${i * 0.08}s`,
                background: `linear-gradient(to top, var(--amber-glow), var(--amber))`,
                opacity: 0.25,
              }}
            />
          ),
        )}
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
      <div class="relative globe-bob">
        <svg
          class="opacity-20 animate-[spin_20s_linear_infinite]"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="0.8"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          <ellipse cx="12" cy="12" rx="10" ry="4" opacity="0.4" />
        </svg>
        <div
          class="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, var(--teal-glow), transparent 70%)",
            filter: "blur(8px)",
          }}
        />
      </div>
      <div class="text-center">
        <p class="font-ui text-[13px] font-medium text-tx-3">Translations will appear here</p>
        <p class="font-ui text-[11px] text-tx-4 mt-1">Speech is translated in real time</p>
      </div>
    </div>
  );
}

interface SpeechPaneProps {
  entries: Accessor<TranscriptEntry[]>;
  finalCount: Accessor<number>;
  live: Accessor<boolean>;
}

export function SpeechPane(props: SpeechPaneProps) {
  let container: HTMLDivElement | undefined;
  const vl = useVirtualList(props.entries, () => container, STT_ITEM_HEIGHT);

  return (
    <section
      class={`pane-amber surface-raised flex-1 flex flex-col min-w-0 bg-raised border border-border rounded-xl overflow-hidden relative transition-all duration-500 ${props.live() ? "is-live" : ""}`}
    >
      <div class="flex justify-between items-center px-4 py-2.5 border-b border-border shrink-0">
        <div class="flex items-center gap-2">
          <span
            class={`w-[6px] h-[6px] rounded-full bg-amber shrink-0 transition-all duration-500 ${
              props.live()
                ? "shadow-[0_0_12px_var(--amber),0_0_4px_var(--amber)]"
                : "shadow-[0_0_8px_var(--amber-glow)]"
            }`}
          />
          <h2 class="text-[12px] font-bold text-tx-2 tracking-wider uppercase">Speech</h2>
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
          <div style={{ height: `${vl.totalHeight()}px`, position: "relative" }}>
            <div style={{ transform: `translateY(${vl.offsetY()}px)` }}>
              <For each={vl.visibleItems()}>
                {(entry) => {
                  const marker = entry.isPartial ? "\u2026" : "\u25B6";
                  return (
                    <div
                      class="animate-entry flex items-center border-l-2 border-l-transparent pl-2"
                      classList={{
                        "border-l-amber/30": !entry.isPartial,
                        "border-l-amber/10": entry.isPartial,
                      }}
                      style={{ height: `${vl.itemHeight}px` }}
                    >
                      <span class="inline text-[9px] font-medium font-mono text-tx-4 tracking-wide mr-1.5 tabular-nums opacity-60">
                        {entry.timestamp} {marker}
                      </span>
                      <span
                        class={`font-urdu text-lg leading-[2] ${entry.isPartial ? "text-amber opacity-70 light:opacity-85" : "text-tx"}`}
                      >
                        {entry.text}
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </section>
  );
}

interface TransPaneProps {
  entries: Accessor<TranslationEntry[]>;
  live: Accessor<boolean>;
}

export function TranslationPane(props: TransPaneProps) {
  let container: HTMLDivElement | undefined;
  const count = createMemo(() => props.entries().length);
  const vl = useVirtualList(props.entries, () => container, TRANS_ITEM_HEIGHT);
  let lastSeenId = -1;

  return (
    <section
      class={`pane-teal surface-raised flex-1 flex flex-col min-w-0 bg-raised border border-border rounded-xl overflow-hidden relative transition-all duration-500 ${props.live() ? "is-live" : ""}`}
    >
      <div class="flex justify-between items-center px-4 py-2.5 border-b border-border shrink-0">
        <div class="flex items-center gap-2">
          <span
            class={`w-[6px] h-[6px] rounded-full bg-teal shrink-0 transition-all duration-500 ${
              props.live()
                ? "shadow-[0_0_12px_var(--teal),0_0_4px_var(--teal)]"
                : "shadow-[0_0_8px_var(--teal-glow)]"
            }`}
          />
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
          <div style={{ height: `${vl.totalHeight()}px`, position: "relative" }}>
            <div style={{ transform: `translateY(${vl.offsetY()}px)` }}>
              <For each={vl.visibleItems()}>
                {(entry) => {
                  const isNew = entry.id > lastSeenId;
                  if (isNew) lastSeenId = entry.id;
                  const duration = entry.text.length / 80;

                  return (
                    <div
                      class="animate-entry text-sm leading-relaxed text-tx flex items-center border-l-2 border-l-teal/25 pl-2"
                      style={{ height: `${vl.itemHeight}px` }}
                    >
                      <span class="inline text-[9px] font-medium font-mono text-tx-4 tracking-wide mr-2 tabular-nums opacity-60">
                        {entry.timestamp}
                      </span>
                      <span
                        class={isNew ? "type-reveal" : undefined}
                        style={
                          isNew
                            ? { "--type-steps": entry.text.length, "--type-dur": `${duration}s` }
                            : undefined
                        }
                      >
                        {entry.text}
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </section>
  );
}
