import { createEffect, createSignal, type Accessor } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";

const OVERSCAN = 5;

/**
 * SolidJS hook for windowed rendering with variable row heights.
 * Wraps @tanstack/solid-virtual with auto-scroll and a simplified API.
 */
export function useVirtualList<T extends { id: number }>(
  entries: Accessor<T[]>,
  containerRef: () => HTMLDivElement | null | undefined,
  estimatedHeight: number,
) {
  const [autoScroll, setAutoScroll] = createSignal(true);

  const virtualizer = createVirtualizer({
    get count() {
      return entries().length;
    },
    getScrollElement: () => containerRef() ?? null,
    estimateSize: () => estimatedHeight,
    getItemKey: (index) => entries()[index]?.id ?? index,
    overscan: OVERSCAN,
  });

  function onScroll() {
    const el = containerRef();
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < estimatedHeight * 2;
    setAutoScroll(atBottom);
  }

  createEffect(() => {
    const len = entries().length;
    if (len > 0 && autoScroll()) {
      virtualizer.scrollToIndex(len - 1, { align: "end" });
    }
  });

  return {
    virtualizer,
    onScroll,
    estimatedHeight,
  };
}
