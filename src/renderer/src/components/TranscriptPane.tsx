import { createEffect, createMemo, For, Show, type Accessor } from "solid-js";
import type { TranscriptEntry, TranslationEntry } from "../lib/types";

interface SttPaneProps {
  entries: Accessor<TranscriptEntry[]>;
}

export function SttPane(props: SttPaneProps) {
  let container: HTMLDivElement | undefined;
  const count = createMemo(() => props.entries().filter((e) => !e.isPartial).length);

  createEffect(() => {
    const _ = props.entries().length;
    requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight;
    });
  });

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
        class="transcript-scroll flex-1 overflow-y-auto px-5 py-4 font-mono text-sm leading-relaxed break-words scroll-smooth"
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
          <For each={props.entries()}>
            {(entry) => {
              const marker = entry.isPartial ? "\u2026" : "\u25B6";
              return (
                <div class="py-1.5 border-b border-border last:border-b-0 animate-entry">
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

  createEffect(() => {
    const _ = props.entries().length;
    requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight;
    });
  });

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
        class="transcript-scroll flex-1 overflow-y-auto px-5 py-4 font-mono text-sm leading-relaxed break-words scroll-smooth"
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
          <For each={props.entries()}>
            {(entry) => (
              <div class="py-2 border-b border-border last:border-b-0 animate-entry text-sm leading-relaxed text-tx">
                <span class="inline text-[10px] font-medium font-mono text-tx-4 tracking-wide mr-2">
                  {entry.timestamp}
                </span>
                {entry.text}
              </div>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}
