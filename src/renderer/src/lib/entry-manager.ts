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
  // Stored index = "logical" position (current array index + indexOffset).
  // On shift, indexOffset++ so existing stored indices still resolve to the
  // correct (now-decremented) array index without rewriting the map.
  const idToIndex = new Map<number, number>();
  let indexOffset = 0;
  const entryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const editingText = new Map<number, string>();
  let editPauseStart: number | null = null;
  let editPauseFromId: number | null = null;
  const [pauseSnapshot, setPauseSnapshot] = createSignal<{ fromId: number; tick: number } | null>(
    null,
  );

  // ── Internal helpers ──

  function indexOfEntry(id: number): number {
    const stored = idToIndex.get(id);
    return stored === undefined ? -1 : stored - indexOffset;
  }

  function updateEntryStatus(id: number, status: EntryStatus, text?: string): void {
    const idx = indexOfEntry(id);
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

  function clearAllTimers(): void {
    for (const [, timer] of entryTimers) clearTimeout(timer);
    entryTimers.clear();
    editPauseStart = null;
    editPauseFromId = null;
    setPauseSnapshot(null);
    stopTick();
  }

  /** Pause timers for the edited entry and everything after it; earlier entries keep running. */
  function pauseTimersFrom(editId: number): void {
    for (const [id, timer] of entryTimers) {
      if (id >= editId) {
        clearTimeout(timer);
        entryTimers.delete(id);
      }
    }
    editPauseStart = Date.now();
    editPauseFromId = editId;
    setPauseSnapshot({ fromId: editId, tick: Date.now() });
    if (entryTimers.size === 0) stopTick();
  }

  /** Resume timers that were paused (id >= editPauseFromId). Pre-edit entries are untouched. */
  function resumePausedTimers(): void {
    if (editPauseStart === null || editPauseFromId === null) return;
    const now = Date.now();
    const pauseStart = editPauseStart;
    const pauseDuration = now - pauseStart;
    const fromId = editPauseFromId;
    editPauseStart = null;
    editPauseFromId = null;
    setPauseSnapshot(null);

    // Bump createdAt only for paused entries (id >= fromId):
    // - Pre-pause entries: shift forward by pause duration to preserve their remaining time
    // - During-pause entries: reset to now so they start with a full countdown
    setTransEntries(
      produce((draft) => {
        for (const e of draft) {
          if (e.status === EntryStatus.Pending && e.id >= fromId) {
            e.createdAt = e.createdAt < pauseStart ? e.createdAt + pauseDuration : now;
          }
        }
      }),
    );

    const expiredIds: number[] = [];
    for (let i = 0; i < transEntries.length; i++) {
      const entry = transEntries[i];
      if (entry.status === EntryStatus.Pending && entry.id >= fromId) {
        const delay = remainingDelayMs(i);
        if (delay === 0) {
          expiredIds.push(entry.id);
        } else {
          const timer = setTimeout(() => confirmEntry(entry.id), delay);
          entryTimers.set(entry.id, timer);
        }
      }
    }
    // Batch-confirm expired entries to avoid redundant drain/stopTick calls per entry
    for (const id of expiredIds) {
      entryTimers.delete(id);
      updateEntryStatus(id, EntryStatus.Confirmed);
    }
    if (expiredIds.length > 0) drainConfirmedQueue();
    if (entryTimers.size > 0) startTick();
  }

  // ── Public API ──

  function pushStt(
    startTime: string,
    endTime: string | undefined,
    text: string,
    isPartial: boolean,
  ): void {
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
          draft.push({ id: entryId++, startTime, endTime, text, isPartial: false });
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
            const removedId = draft[0].id;
            draft.shift();
            idToIndex.delete(removedId);
            indexOffset++;
            if (nextWriteIndex > 0) nextWriteIndex--;
          }
          idToIndex.set(thisId, draft.length + indexOffset);
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
    if (editPauseStart === null) {
      const timer = setTimeout(() => confirmEntry(thisId), reviewTimeMs());
      entryTimers.set(thisId, timer);
      startTick();
    }
  }

  function startEdit(id: number): void {
    const currentIdx = transEntries.findIndex((e) => e.status === EntryStatus.Editing);
    if (currentIdx !== -1) {
      // Save previous edit inline to avoid resuming timers via saveEdit
      const cur = transEntries[currentIdx];
      const text = editingText.get(cur.id) ?? cur.text;
      editingText.delete(cur.id);
      setTransEntries(currentIdx, "status", EntryStatus.Pending);
      setTransEntries(currentIdx, "text", text);
    }
    if (editPauseStart === null) {
      pauseTimersFrom(id);
    } else if (id < editPauseFromId!) {
      // Switching to an earlier entry — expand the paused range
      for (const [eid, timer] of entryTimers) {
        if (eid >= id) {
          clearTimeout(timer);
          entryTimers.delete(eid);
        }
      }
      editPauseFromId = id;
      setPauseSnapshot({ fromId: id, tick: Date.now() });
    }
    updateEntryStatus(id, EntryStatus.Editing);
  }

  function remainingDelayMs(idx: number): number {
    const entry = transEntries[idx];
    if (!entry) return 0;
    return Math.max(0, reviewTimeMs() - (Date.now() - entry.createdAt));
  }

  function saveEdit(id: number, text: string): void {
    const idx = indexOfEntry(id);
    if (idx === -1 || transEntries[idx].status !== EntryStatus.Editing) return;
    editingText.delete(id);
    setTransEntries(idx, "status", EntryStatus.Pending);
    setTransEntries(idx, "text", text);
    resumePausedTimers();
  }

  function cancelEdit(id: number): void {
    const idx = indexOfEntry(id);
    if (idx === -1 || transEntries[idx].status !== EntryStatus.Editing) return;
    editingText.delete(id);
    setTransEntries(idx, "status", EntryStatus.Pending);
    resumePausedTimers();
  }

  function onEditChange(id: number, text: string): void {
    editingText.set(id, text);
  }

  function flushPending(): void {
    clearAllTimers();
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
    clearAllTimers();
    nextWriteIndex = 0;
    idToIndex.clear();
    indexOffset = 0;
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

  onCleanup(clearAllTimers);

  /** Returns the frozen tick for paused entries, live tick otherwise. */
  function tickForEntry(entryId: number): number {
    const snap = pauseSnapshot();
    if (snap && entryId >= snap.fromId) return snap.tick;
    return tick();
  }

  return {
    sttEntries: () => sttEntries,
    sttPartial,
    transEntries: () => transEntries,
    sentEntries: () => sentEntries,
    sttCount,
    latency,
    words,
    tickForEntry,
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
