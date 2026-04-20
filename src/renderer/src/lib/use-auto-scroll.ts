import { createEffect, createSignal, type Accessor } from "solid-js";

/** Auto-scroll: keeps scroll pinned to bottom unless user scrolls up or scrolling is paused. */
export function useAutoScroll(
  containerRef: () => HTMLDivElement | undefined,
  count: Accessor<number>,
  paused?: Accessor<boolean>,
) {
  const [pinned, setPinned] = createSignal(true);

  function onScroll() {
    const el = containerRef();
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  createEffect(() => {
    count(); // track changes
    if (paused?.()) return;
    if (pinned()) {
      const el = containerRef();
      if (el) el.scrollTop = el.scrollHeight;
    }
  });

  return { onScroll };
}
