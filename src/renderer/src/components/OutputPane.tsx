import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  For,
  Show,
  type Accessor,
} from "solid-js";
import type { TranslationEntry } from "../lib/types";

const ITEM_HEIGHT = 32;
const OVERSCAN = 5;

function useVirtualList(
  entries: Accessor<TranslationEntry[]>,
  containerRef: () => HTMLDivElement | undefined,
) {
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewHeight, setViewHeight] = createSignal(200);
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
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < ITEM_HEIGHT * 2;
      setAutoScroll(atBottom);
    });
  }

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

interface OutputPaneProps {
  entries: Accessor<TranslationEntry[]>;
}

export default function OutputPane(props: OutputPaneProps) {
  let container: HTMLDivElement | undefined;
  const sentEntries = createMemo(() => props.entries().filter((e) => e.status === "sent"));
  const count = createMemo(() => sentEntries().length);
  const vl = useVirtualList(sentEntries, () => container);

  return (
    <div
      class="border-t border-border bg-[var(--bg-raised)] flex flex-col min-h-0"
      style={{ flex: "3" }}
    >
      <div class="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold text-tx-3 tracking-wider uppercase">Final Output</span>
          <Show when={count() > 0}>
            <span class="text-[10px] text-tx-4 font-mono tabular-nums">{count()} lines</span>
          </Show>
        </div>
      </div>
      <div
        ref={container}
        onScroll={vl.onScroll}
        class="flex-1 overflow-y-auto px-3 font-mono text-sm"
      >
        <Show
          when={count() > 0}
          fallback={
            <div class="flex items-center justify-center h-full py-6">
              <p class="font-ui text-[12px] text-tx-4">Confirmed translations will appear here</p>
            </div>
          }
        >
          <div style={{ height: `${vl.totalHeight()}px`, position: "relative" }}>
            <div style={{ transform: `translateY(${vl.offsetY()}px)` }}>
              <For each={vl.visibleItems()}>
                {(entry) => (
                  <div
                    class="flex items-center border-l-2 border-l-border pl-2"
                    style={{ height: `${ITEM_HEIGHT}px`, contain: "content" }}
                  >
                    <span class="text-[9px] font-mono text-tx-4 mr-2 tabular-nums shrink-0">
                      {entry.timestamp}
                    </span>
                    <span class="text-[13px] text-tx-2 truncate">{entry.text}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
