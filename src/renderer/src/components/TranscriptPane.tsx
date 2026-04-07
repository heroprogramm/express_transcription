import { For, Show, type Accessor } from "solid-js";
import type { TranscriptEntry, TranslationEntry } from "../lib/types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
  );
}

interface SttPaneProps {
  entries: Accessor<TranscriptEntry[]>;
  count: Accessor<number>;
}

export function SttPane(props: SttPaneProps) {
  let container: HTMLDivElement | undefined;

  function scrollToBottom() {
    if (container) container.scrollTop = container.scrollHeight;
  }

  return (
    <section class="panel panel-stt">
      <div class="panel-header">
        <div class="panel-title-row">
          <span class="panel-dot dot-amber" />
          <h2 class="panel-title">STT Output</h2>
        </div>
        <span class="panel-meta mono">
          <Show when={props.count() > 0}>{props.count()} lines</Show>
        </span>
      </div>
      <div ref={container} class="transcript" dir="rtl">
        <Show
          when={props.entries().length > 0}
          fallback={
            <div class="transcript-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <p>Waiting for audio input...</p>
            </div>
          }
        >
          <For each={props.entries()}>
            {(entry) => {
              // Schedule scroll after render
              requestAnimationFrame(scrollToBottom);
              const marker = entry.isPartial ? "\u2026" : "\u25B6";
              return (
                <div class={`stt-entry ${entry.isPartial ? "partial" : "final"}`}>
                  <span class="ts">{escapeHtml(entry.timestamp)} {marker}</span>
                  <span class={`stt-text ${entry.isPartial ? "partial-text" : ""}`}>
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
  count: Accessor<number>;
}

export function TranslationPane(props: TransPaneProps) {
  let container: HTMLDivElement | undefined;

  function scrollToBottom() {
    if (container) container.scrollTop = container.scrollHeight;
  }

  return (
    <section class="panel panel-trans">
      <div class="panel-header">
        <div class="panel-title-row">
          <span class="panel-dot dot-teal" />
          <h2 class="panel-title">Translation</h2>
        </div>
        <span class="panel-meta mono">
          <Show when={props.count() > 0}>{props.count()} lines</Show>
        </span>
      </div>
      <div ref={container} class="transcript">
        <Show
          when={props.entries().length > 0}
          fallback={
            <div class="transcript-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <p>Translations will appear here</p>
            </div>
          }
        >
          <For each={props.entries()}>
            {(entry) => {
              requestAnimationFrame(scrollToBottom);
              return (
                <div class="sent-entry">
                  <span class="ts">{escapeHtml(entry.timestamp)}</span>
                  {entry.text}
                </div>
              );
            }}
          </For>
        </Show>
      </div>
    </section>
  );
}
