import { createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import { ClipboardCopy, Check } from "lucide-solid";
import { copyToClipboard as writeClipboard } from "@/lib/ipc";
import type { TranslationEntry } from "@/lib/types";
import { useVirtualList } from "@/lib/virtual-list";

const ITEM_HEIGHT = 32;

/** Props for the {@link OutputPane} component. */
interface OutputPaneProps {
  entries: Accessor<TranslationEntry[]>;
  wordCount: Accessor<number>;
}

/** Virtualized read-only pane showing confirmed translations sent to the output feed. */
export default function OutputPane(props: OutputPaneProps) {
  let container: HTMLDivElement | undefined;
  const count = createMemo(() => props.entries().length);
  const vl = useVirtualList(props.entries, () => container, ITEM_HEIGHT);
  const [copied, setCopied] = createSignal(false);

  function copyToClipboard() {
    const text = props
      .entries()
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
              {count()} lines &middot; {props.wordCount()} words
            </span>
          </Show>
        </div>
        <Show when={count() > 0}>
          <button
            class="flex items-center gap-1.5 cursor-pointer transition-all duration-200"
            classList={{
              "text-tx-3 hover:text-tx-2": !copied(),
              "text-green": copied(),
            }}
            onClick={copyToClipboard}
            title="Copy to clipboard"
          >
            <Show
              when={!copied()}
              fallback={
                <>
                  <Check size={14} />
                  <span class="text-[10px] font-ui font-semibold">Copied</span>
                </>
              }
            >
              <ClipboardCopy size={14} />
            </Show>
          </button>
        </Show>
      </div>
      <div
        ref={container}
        onScroll={vl.onScroll}
        class="transcript-scroll flex-1 overflow-y-auto px-3 font-mono text-sm"
      >
        <Show
          when={count() > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full -mt-4 gap-3">
              <div class="empty-state-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-3)"
                  stroke-width="1"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M9 15l2 2 4-4" />
                </svg>
              </div>
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
