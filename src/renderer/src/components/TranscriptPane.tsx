import { createEffect, createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import type { TranscriptEntry, TranslationEntry } from "../lib/types";

const ITEM_HEIGHT = 40;
const OVERSCAN = 5;

function useVirtualList<T extends { id: number }>(
  entries: Accessor<T[]>,
  containerRef: () => HTMLDivElement | undefined,
) {
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewHeight, setViewHeight] = createSignal(400);
  const [autoScroll, setAutoScroll] = createSignal(true);

  function onScroll(e: Event) {
    const el = e.currentTarget as HTMLDivElement;
    setScrollTop(el.scrollTop);
    setViewHeight(el.clientHeight);
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < ITEM_HEIGHT * 2;
    setAutoScroll(atBottom);
  }

  createEffect(() => {
    const _ = entries().length;
    if (autoScroll()) {
      requestAnimationFrame(() => {
        const el = containerRef();
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  });

  const totalHeight = createMemo(() => entries().length * ITEM_HEIGHT);

  const visibleRange = createMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop() / ITEM_HEIGHT) - OVERSCAN);
    const end = Math.min(
      entries().length,
      Math.ceil((scrollTop() + viewHeight()) / ITEM_HEIGHT) + OVERSCAN,
    );
    return { start, end };
  });

  const visibleItems = createMemo(() => {
    const { start, end } = visibleRange();
    return entries().slice(start, end);
  });

  const offsetY = createMemo(() => visibleRange().start * ITEM_HEIGHT);

  return { totalHeight, visibleItems, offsetY, onScroll };
}

interface SttPaneProps {
  entries: Accessor<TranscriptEntry[]>;
}

export function SttPane(props: SttPaneProps) {
  let container: HTMLDivElement | undefined;
  const count = createMemo(() => props.entries().filter((e) => !e.isPartial).length);
  const vl = useVirtualList(props.entries, () => container);

  return (
    <section class="flex-1 flex flex-col min-w-0 bg-raised border border-border rounded-[14px] overflow-hidden">
      <div class="flex justify-between items-center px-5 py-3.5 border-b border-border bg-raised shrink-0">
        <div class="flex items-center gap-2.5">
          <span class="w-2 h-2 rounded-full bg-amber shrink-0 dot-amber" />
          <h2 class="text-[13px] font-bold text-tx-2 tracking-wide">STT Output</h2>
        </div>
        <span class="text-[11px] text-tx-3 font-mono">
          <Show when={count() > 0}>{count()} lines</Show>
        </span>
      </div>
      <div
        ref={container}
        onScroll={vl.onScroll}
        class="transcript-scroll flex-1 overflow-y-auto px-5 font-mono text-sm leading-relaxed break-words"
        dir="rtl"
      >
        <Show
          when={props.entries().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full gap-3 text-tx-4">
              <svg
                class="opacity-40"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.2"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <p class="font-ui text-[13px] font-medium">Waiting for audio input...</p>
            </div>
          }
        >
          <div style={{ height: `${vl.totalHeight()}px`, position: "relative" }}>
            <div style={{ transform: `translateY(${vl.offsetY()}px)` }}>
              <For each={vl.visibleItems()}>
                {(entry) => {
                  const marker = entry.isPartial ? "\u2026" : "\u25B6";
                  return (
                    <div
                      class="border-b border-border last:border-b-0 animate-entry"
                      style={{
                        height: `${ITEM_HEIGHT}px`,
                        display: "flex",
                        "align-items": "center",
                      }}
                    >
                      <span class="inline text-[10px] font-medium font-mono text-tx-4 tracking-wide mr-1.5 align-baseline">
                        {entry.timestamp} {marker}
                      </span>
                      <span
                        class={`text-tx font-urdu text-lg leading-[2] ${entry.isPartial ? "partial-text text-amber opacity-70" : ""}`}
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
}

export function TranslationPane(props: TransPaneProps) {
  let container: HTMLDivElement | undefined;
  const count = createMemo(() => props.entries().length);
  const vl = useVirtualList(props.entries, () => container);

  return (
    <section class="flex-1 flex flex-col min-w-0 bg-raised border border-border rounded-[14px] overflow-hidden">
      <div class="flex justify-between items-center px-5 py-3.5 border-b border-border bg-raised shrink-0">
        <div class="flex items-center gap-2.5">
          <span class="w-2 h-2 rounded-full bg-teal shrink-0 dot-teal" />
          <h2 class="text-[13px] font-bold text-tx-2 tracking-wide">Translation</h2>
        </div>
        <span class="text-[11px] text-tx-3 font-mono">
          <Show when={count() > 0}>{count()} lines</Show>
        </span>
      </div>
      <div
        ref={container}
        onScroll={vl.onScroll}
        class="transcript-scroll flex-1 overflow-y-auto px-5 font-mono text-sm leading-relaxed break-words"
      >
        <Show
          when={props.entries().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full gap-3 text-tx-4">
              <svg
                class="opacity-40"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <p class="font-ui text-[13px] font-medium">Translations will appear here</p>
            </div>
          }
        >
          <div style={{ height: `${vl.totalHeight()}px`, position: "relative" }}>
            <div style={{ transform: `translateY(${vl.offsetY()}px)` }}>
              <For each={vl.visibleItems()}>
                {(entry) => (
                  <div
                    class="border-b border-border last:border-b-0 animate-entry text-sm leading-relaxed text-tx"
                    style={{ height: `${ITEM_HEIGHT}px`, display: "flex", "align-items": "center" }}
                  >
                    <span class="inline text-[10px] font-medium font-mono text-tx-4 tracking-wide mr-2">
                      {entry.timestamp}
                    </span>
                    {entry.text}
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </section>
  );
}
