import { createSignal, batch, onCleanup } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { EntryStatus, type TranscriptEntry, type TranslationEntry } from "@/lib/types";
import { getWordCount, queueLogTranslation } from "@/lib/soniox";

const MAX_ENTRIES = 500;

/**
 * Reactive store managing STT and translation entries with timed auto-confirm and editing.
 * Entries flow through pending -> confirmed -> sent, with an optional editing pause.
 * @param reviewTimeMs Accessor returning the review time (ms) before a pending entry is auto-confirmed.
 */
export function createEntryManager(reviewTimeMs: () => number) {
  const [sttEntries, setSttEntries] = createStore<TranscriptEntry[]>([]);
  const [sttPartial, setSttPartial] = createSignal<string>("");
  const [transEntries, setTransEntries] = createStore<TranslationEntry[]>([]);
  const [sentEntries, setSentEntries] = createStore<TranslationEntry[]>([]);
  const [sttCount, setSttCount] = createSignal(0);
  const [latency, setLatency] = createSignal("\u2014");
  const [words, setWords] = createSignal(0);

  const [tick, setTick] = createSignal(Date.now());
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  function startTick(): void {
    if (!tickTimer) tickTimer = setInterval(() => setTick(Date.now()), 500);
  }

  function stopTick(): void {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  let entryId = 0;
  let nextWriteIndex = 0;
  const entryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const editingText = new Map<number, string>();

  // ── Internal helpers ──

  function updateEntryStatus(id: number, status: EntryStatus, text?: string): void {
    const idx = transEntries.findIndex((e) => e.id === id);
    if (idx === -1) return;
    setTransEntries(idx, "status", status);
    if (text !== undefined) setTransEntries(idx, "text", text);
  }

  function drainConfirmedQueue(): void {
    const newSent: TranslationEntry[] = [];
    const startIdx = nextWriteIndex;
    while (
      nextWriteIndex < transEntries.length &&
      transEntries[nextWriteIndex].status === EntryStatus.Confirmed
    ) {
      const e = transEntries[nextWriteIndex];
      queueLogTranslation(e.timestamp, e.text);
      newSent.push({ ...e, status: EntryStatus.Sent });
      nextWriteIndex++;
    }
    if (newSent.length > 0) {
      batch(() => {
        for (let i = 0; i < newSent.length; i++) {
          setTransEntries(startIdx + i, "status", EntryStatus.Sent);
        }
        setSentEntries(
          produce((draft) => {
            for (const e of newSent) draft.push(e);
          }),
        );
      });
    }
  }

  function confirmEntry(id: number): void {
    entryTimers.delete(id);
    updateEntryStatus(id, EntryStatus.Confirmed);
    if (entryTimers.size === 0) stopTick();
    drainConfirmedQueue();
  }

  // ── Public API ──

  function pushStt(timestamp: string, text: string, isPartial: boolean): void {
    if (isPartial) {
      setSttPartial(text);
      return;
    }
    if (!text.trim()) return;
    batch(() => {
      setSttPartial("");
      setSttEntries(
        produce((draft) => {
          if (draft.length >= MAX_ENTRIES) draft.shift();
          draft.push({ id: entryId++, timestamp, text, isPartial: false });
        }),
      );
      setSttCount((c) => c + 1);
    });
  }

  function pushTranslation(timestamp: string, text: string, latencyMs: number): void {
    const thisId = entryId++;
    batch(() => {
      setTransEntries(
        produce((draft) => {
          if (draft.length >= MAX_ENTRIES) {
            draft.shift();
            if (nextWriteIndex > 0) nextWriteIndex--;
          }
          draft.push({
            id: thisId,
            timestamp,
            text,
            status: EntryStatus.Pending,
            createdAt: Date.now(),
          });
        }),
      );
      setWords(getWordCount());
      setLatency(`${(Math.abs(latencyMs) / 1000).toFixed(1)}s`);
    });
    const timer = setTimeout(() => confirmEntry(thisId), reviewTimeMs());
    entryTimers.set(thisId, timer);
    startTick();
  }

  function startEdit(id: number): void {
    const current = transEntries.find((e) => e.status === EntryStatus.Editing);
    if (current) {
      saveEdit(current.id, editingText.get(current.id) ?? current.text);
    }
    const timer = entryTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      entryTimers.delete(id);
    }
    updateEntryStatus(id, EntryStatus.Editing);
  }

  function remainingDelayMs(id: number): number {
    const entry = transEntries.find((e) => e.id === id);
    if (!entry) return 0;
    const elapsed = Date.now() - entry.createdAt;
    return Math.max(0, reviewTimeMs() - elapsed);
  }

  function saveEdit(id: number, text: string): void {
    editingText.delete(id);
    updateEntryStatus(id, EntryStatus.Pending, text);
    const delay = remainingDelayMs(id);
    if (delay === 0) {
      confirmEntry(id);
    } else {
      const timer = setTimeout(() => confirmEntry(id), delay);
      entryTimers.set(id, timer);
    }
  }

  function cancelEdit(id: number): void {
    editingText.delete(id);
    updateEntryStatus(id, EntryStatus.Pending);
    const delay = remainingDelayMs(id);
    if (delay === 0) {
      confirmEntry(id);
    } else {
      const timer = setTimeout(() => confirmEntry(id), delay);
      entryTimers.set(id, timer);
    }
  }

  function onEditChange(id: number, text: string): void {
    editingText.set(id, text);
  }

  function flushPending(): void {
    for (const [, timer] of entryTimers) clearTimeout(timer);
    entryTimers.clear();
    stopTick();
    setLatency("\u2014");
    setSttPartial("");
    setTransEntries(
      produce((draft) => {
        for (const e of draft) {
          if (e.status === EntryStatus.Pending || e.status === EntryStatus.Editing) {
            e.status = EntryStatus.Confirmed;
          }
        }
      }),
    );
    drainConfirmedQueue();
  }

  function clear(): void {
    for (const [, timer] of entryTimers) clearTimeout(timer);
    entryTimers.clear();
    stopTick();
    nextWriteIndex = 0;
    batch(() => {
      setSttEntries(reconcile([]));
      setSttPartial("");
      setTransEntries(reconcile([]));
      setSentEntries(reconcile([]));
      setSttCount(0);
      setWords(0);
      setLatency("\u2014");
    });
  }

  onCleanup(() => {
    for (const [, timer] of entryTimers) clearTimeout(timer);
    entryTimers.clear();
    stopTick();
  });

  return {
    sttEntries: () => sttEntries,
    sttPartial,
    transEntries: () => transEntries,
    sentEntries: () => sentEntries,
    sttCount,
    latency,
    words,
    tick,
    reviewTimeMs,
    pushStt,
    pushTranslation,
    startEdit,
    saveEdit,
    cancelEdit,
    onEditChange,
    flushPending,
    clear,
  };
}
