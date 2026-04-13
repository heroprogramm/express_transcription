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

  const isHorizontal = () => props.direction === "horizontal";

  return (
    <div
      class="resize-handle shrink-0 flex items-center justify-center group transition-colors"
      classList={{
        "w-3 cursor-col-resize hover:bg-hover": isHorizontal(),
        "h-3 cursor-row-resize hover:bg-hover": !isHorizontal(),
        "bg-surface": dragging(),
      }}
      role="separator"
      aria-orientation={isHorizontal() ? "vertical" : "horizontal"}
      aria-label={`Resize ${isHorizontal() ? "columns" : "rows"}`}
      onPointerDown={onPointerDown}
    >
      <div
        class="resize-handle-dot rounded-full bg-border-lit transition-all group-hover:bg-tx-4"
        classList={{
          "resize-handle-dot-h w-[3px] h-5": isHorizontal(),
          "resize-handle-dot-v h-[3px] w-5": !isHorizontal(),
          "!bg-tx-3": dragging(),
        }}
      />
    </div>
  );
}
