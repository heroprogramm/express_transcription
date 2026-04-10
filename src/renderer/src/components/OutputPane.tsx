import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  For,
  Show,
  type Accessor,
} from "solid-js";
import { ClipboardCopy, Check } from "lucide-solid";
import { copyToClipboard as writeClipboard } from "@/lib/ipc";
import type { TranslationEntry } from "@/lib/types";

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
  const wordCount = createMemo(() =>
    sentEntries().reduce((sum, e) => sum + e.text.split(/\s+/).filter(Boolean).length, 0),
  );
  const vl = useVirtualList(sentEntries, () => container);
  const [copied, setCopied] = createSignal(false);

  function copyToClipboard() {
    const text = sentEntries()
      .map((e) => `[${e.timestamp}] ${e.text}`)
      .join("\n");
    writeClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class="border-t border-border bg-[var(--bg-raised)] flex flex-col min-h-0 flex-1">
      <div class="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold text-tx-2 tracking-wider uppercase">Final Output</span>
          <Show when={count() > 0}>
            <span class="text-[10px] text-tx-4 font-mono tabular-nums">
              {count()} lines &middot; {wordCount()} words
            </span>
          </Show>
        </div>
        <Show when={count() > 0}>
          <button
            class="text-tx-3 hover:text-tx-2 cursor-pointer transition-colors"
            onClick={copyToClipboard}
            title="Copy to clipboard"
          >
            <Show when={!copied()} fallback={<Check size={14} />}>
              <ClipboardCopy size={14} />
            </Show>
          </button>
        </Show>
      </div>
      <div
        ref={container}
        onScroll={vl.onScroll}
        class="flex-1 overflow-y-auto px-3 font-mono text-sm"
      >
        <Show
          when={count() > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full -mt-4 gap-3">
              <svg
                class="opacity-25"
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="0.8"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 15l2 2 4-4" />
              </svg>
              <div class="text-center">
                <p class="font-ui text-[13px] font-medium text-tx-3">
                  Confirmed translations will appear here
                </p>
                <p class="font-ui text-[11px] text-tx-4 mt-1">
                  Entries are sent after the edit window expires
                </p>
              </div>
            </div>
          }
        >
          <div style={{ height: `${vl.totalHeight()}px`, position: "relative" }}>
            <div style={{ transform: `translateY(${vl.offsetY()}px)` }}>
              <For each={vl.visibleItems()}>
                {(entry) => (
                  <div
                    class="flex items-center border-l-2 border-l-border-lit pl-2"
                    style={{ height: `${ITEM_HEIGHT}px`, contain: "content" }}
                  >
                    <span class="text-[11px] font-mono text-tx-3 mr-2 tabular-nums shrink-0">
                      {entry.timestamp}
                    </span>
                    <span class="text-base text-tx-2 truncate">{entry.text}</span>
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
