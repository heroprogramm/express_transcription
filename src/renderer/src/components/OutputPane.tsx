import { createMemo, createSignal, For, Show, type Accessor } from "solid-js";

import { ClipboardCopy, Check } from "lucide-solid";
import { copyToClipboard as writeClipboard } from "@/lib/ipc";
import type { TranslationEntry } from "@/lib/types";
import { useVirtualList } from "@/lib/virtual-list";

const ITEM_HEIGHT = 32;

/** Props for the {@link OutputPane} component. */
interface OutputPaneProps {
  entries: Accessor<TranslationEntry[]>;
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
    <div class="surface-raised bg-raised border border-border rounded-md flex flex-col min-h-0 flex-1 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-[13px] font-semibold text-tx-2 tracking-wide">Final Output</span>
          <Show when={count() > 0}>
            <span class="text-[10px] text-tx-3 font-mono tabular-nums bg-hover border border-border-lit rounded-full px-2 py-0.5">
              {count()} lines
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
              <span class="flex items-center justify-center w-5 h-5 rounded-full border border-border text-[10px] font-bold text-tx-4">
                3
              </span>
              <div class="empty-state-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#50b880"
                  stroke-width="1"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path class="checkmark-loop" d="M9 15l2 2 4-4" />
                </svg>
              </div>
              <div class="text-center">
                <p class="font-ui text-[14px] font-medium text-tx-3">
                  Confirmed translations will appear here
                </p>
                <p class="font-ui text-[12px] text-tx-4 mt-1.5">
                  Entries are sent after the edit window expires
                </p>
              </div>
            </div>
          }
        >
          <div
            class="border-l-2 border-l-border-lit ml-0"
            style={{ height: `${vl.virtualizer.getTotalSize()}px`, position: "relative" }}
          >
            <For each={vl.virtualizer.getVirtualItems()}>
              {(vItem) => {
                const entry = createMemo(() => props.entries()[vItem.index]);
                return (
                  <div
                    ref={(el) => {
                      el.setAttribute("data-index", `${vItem.index}`);
                      vl.virtualizer.measureElement(el);
                    }}
                    class={`flex items-center pl-3.5 py-0.5 min-h-7 absolute top-0 left-0 w-full ${vItem.index % 2 === 1 ? "bg-[var(--bg-surface)]/40" : ""}`}
                    style={{ transform: `translateY(${vItem.start}px)` }}
                  >
                    <span class="text-[10px] font-mono text-tx-4 mr-3 tabular-nums shrink-0">
                      {entry().timestamp}
                    </span>
                    <span class="text-sm text-tx-2">{entry().text}</span>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
