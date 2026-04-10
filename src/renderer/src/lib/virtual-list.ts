import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";

const OVERSCAN = 5;

export function useVirtualList<T extends { id: number }>(
  entries: Accessor<T[]>,
  containerRef: () => HTMLDivElement | undefined,
  itemHeight: number,
) {
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewHeight, setViewHeight] = createSignal(400);
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
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < itemHeight * 2;
      setAutoScroll(atBottom);
    });
  }

  // Track entry count as a memo so the effect dependency is a scalar, not the full array
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

  const totalHeight = createMemo(() => entries().length * itemHeight);

  const visibleRange = createMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop() / itemHeight) - OVERSCAN);
    const end = Math.min(
      entries().length,
      Math.ceil((scrollTop() + viewHeight()) / itemHeight) + OVERSCAN,
    );
    return { start, end };
  });

  const visibleItems = createMemo(() => {
    const { start, end } = visibleRange();
    return entries().slice(start, end);
  });

  const offsetY = createMemo(() => visibleRange().start * itemHeight);

  return { totalHeight, visibleItems, offsetY, onScroll, itemHeight };
}
