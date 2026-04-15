import { createSignal, onCleanup } from "solid-js";

/** Props for the {@link ResizeHandle} component. */
interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
}

/** Draggable handle for resizing adjacent panes horizontally or vertically. */
export default function ResizeHandle(props: ResizeHandleProps) {
  const [dragging, setDragging] = createSignal(false);
  let startPos = 0;

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    startPos = props.direction === "horizontal" ? e.clientX : e.clientY;
    setDragging(true);
    document.body.style.cursor = props.direction === "horizontal" ? "col-resize" : "row-resize";
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    const current = props.direction === "horizontal" ? e.clientX : e.clientY;
    const delta = current - startPos;
    startPos = current;
    props.onResize(delta);
  }

  function onPointerUp() {
    setDragging(false);
    document.body.style.cursor = "";
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  }

  onCleanup(() => {
    document.body.style.cursor = "";
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  });

  const isH = () => props.direction === "horizontal";

  return (
    <div
      class="shrink-0 flex items-center justify-center group relative"
      classList={{
        "w-4 cursor-col-resize": isH(),
        "h-4 cursor-row-resize": !isH(),
      }}
      role="separator"
      aria-orientation={isH() ? "vertical" : "horizontal"}
      aria-label={`Resize ${isH() ? "columns" : "rows"}`}
      onPointerDown={onPointerDown}
    >
      {/* Line */}
      <div
        class="absolute transition-colors"
        classList={{
          "w-px h-full bg-border group-hover:bg-border-lit": isH(),
          "h-px w-full bg-border group-hover:bg-border-lit": !isH(),
          "!bg-tx-4": dragging(),
        }}
      />
      {/* Grab indicator */}
      <div
        class="rounded-full transition-all opacity-0 group-hover:opacity-100"
        classList={{
          "w-1 h-8 group-hover:h-12 bg-tx-4": isH(),
          "h-1 w-8 group-hover:w-12 bg-tx-4": !isH(),
          "!opacity-100 bg-tx-3": dragging(),
        }}
      />
    </div>
  );
}
