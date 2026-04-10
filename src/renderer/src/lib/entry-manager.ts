import { createSignal, batch, onCleanup } from "solid-js";
import { EntryStatus, type TranscriptEntry, type TranslationEntry } from "@/lib/types";
import { getWordCount, queueLogTranslation } from "@/lib/soniox";

const MAX_ENTRIES = 500;

export function createEntryManager(feedDelayMs: () => number) {
  const [sttEntries, setSttEntries] = createSignal<TranscriptEntry[]>([]);
  const [transEntries, setTransEntries] = createSignal<TranslationEntry[]>([]);
  const [sentEntries, setSentEntries] = createSignal<TranslationEntry[]>([]);
  const [sttCount, setSttCount] = createSignal(0);
  const [latency, setLatency] = createSignal("\u2014");
  const [words, setWords] = createSignal(0);

  let entryId = 0;
  let nextWriteIndex = 0;
  const entryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const editingText = new Map<number, string>();

  // ── Internal helpers ──

  function updateEntryStatus(id: number, status: EntryStatus, text?: string): void {
    setTransEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...prev[idx], status, ...(text !== undefined ? { text } : {}) };
      return next;
    });
  }

  function drainConfirmedQueue(): void {
    const entries = transEntries();
    const newSent: TranslationEntry[] = [];
    const indices: number[] = [];
    while (
      nextWriteIndex < entries.length &&
      entries[nextWriteIndex].status === EntryStatus.Confirmed
    ) {
      const e = entries[nextWriteIndex];
      queueLogTranslation(e.timestamp, e.text);
      newSent.push({ ...e, status: EntryStatus.Sent });
      indices.push(nextWriteIndex);
      nextWriteIndex++;
    }
    if (indices.length > 0) {
      setTransEntries((prev) => {
        const next = prev.slice();
        for (let i = 0; i < indices.length; i++) {
          next[indices[i]] = newSent[i];
        }
        return next;
      });
      setSentEntries((prev) => [...prev, ...newSent]);
    }
  }

  function confirmEntry(id: number): void {
    entryTimers.delete(id);
    updateEntryStatus(id, EntryStatus.Confirmed);
    drainConfirmedQueue();
  }

  // ── Public API ──

  function pushStt(timestamp: string, text: string, isPartial: boolean): void {
    if (!isPartial && !text.trim()) return;
    setSttEntries((prev) => {
      const next = prev.length >= MAX_ENTRIES ? prev.slice(1) : prev.slice();
      next.push({ id: entryId++, timestamp, text, isPartial });
      return next;
    });
    if (!isPartial) setSttCount((c) => c + 1);
  }

  function pushTranslation(timestamp: string, text: string, latencyMs: number): void {
    const thisId = entryId++;
    batch(() => {
      setTransEntries((prev) => {
        const overflow = prev.length >= MAX_ENTRIES;
        const next = overflow ? prev.slice(1) : prev.slice();
        next.push({
          id: thisId,
          timestamp,
          text,
          status: EntryStatus.Pending,
          createdAt: Date.now(),
        });
        if (overflow && nextWriteIndex > 0) nextWriteIndex--;
        return next;
      });
      setWords(getWordCount());
      setLatency(`${(Math.abs(latencyMs) / 1000).toFixed(1)}s`);
    });
    const timer = setTimeout(() => confirmEntry(thisId), feedDelayMs());
    entryTimers.set(thisId, timer);
  }

  function startEdit(id: number): void {
    const current = transEntries().find((e) => e.status === EntryStatus.Editing);
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

  function saveEdit(id: number, text: string): void {
    editingText.delete(id);
    updateEntryStatus(id, EntryStatus.Pending, text);
    const timer = setTimeout(() => confirmEntry(id), feedDelayMs());
    entryTimers.set(id, timer);
  }

  function cancelEdit(id: number): void {
    editingText.delete(id);
    updateEntryStatus(id, EntryStatus.Pending);
    const timer = setTimeout(() => confirmEntry(id), feedDelayMs());
    entryTimers.set(id, timer);
  }

  function onEditChange(id: number, text: string): void {
    editingText.set(id, text);
  }

  function flushPending(): void {
    for (const [, timer] of entryTimers) clearTimeout(timer);
    entryTimers.clear();
    setTransEntries((prev) =>
      prev.map((e) =>
        e.status === EntryStatus.Pending || e.status === EntryStatus.Editing
          ? { ...e, status: EntryStatus.Confirmed }
          : e,
      ),
    );
    drainConfirmedQueue();
  }

  function clear(): void {
    for (const [, timer] of entryTimers) clearTimeout(timer);
    entryTimers.clear();
    nextWriteIndex = 0;
    batch(() => {
      setSttEntries([]);
      setTransEntries([]);
      setSentEntries([]);
      setSttCount(0);
      setWords(0);
      setLatency("\u2014");
    });
    entryId = 0;
  }

  onCleanup(() => {
    for (const [, timer] of entryTimers) clearTimeout(timer);
    entryTimers.clear();
  });

  return {
    sttEntries,
    transEntries,
    sentEntries,
    sttCount,
    latency,
    words,
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
