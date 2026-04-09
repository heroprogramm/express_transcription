import { createSignal, onCleanup } from "solid-js";

interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
}

export default function ResizeHandle(props: ResizeHandleProps) {
  const [dragging, setDragging] = createSignal(false);
  let startPos = 0;

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    startPos = props.direction === "horizontal" ? e.clientX : e.clientY;
    setDragging(true);
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
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  }

  onCleanup(() => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  });

  const isHorizontal = () => props.direction === "horizontal";

  return (
    <div
      class="shrink-0 flex items-center justify-center group transition-colors"
      classList={{
        "w-3 cursor-col-resize hover:bg-white/[0.04]": isHorizontal(),
        "h-3 cursor-row-resize hover:bg-white/[0.04]": !isHorizontal(),
        "bg-white/[0.06]": dragging(),
      }}
      onPointerDown={onPointerDown}
    >
      <div
        class="rounded-full bg-border transition-all group-hover:bg-tx-4"
        classList={{
          "w-[3px] h-6": isHorizontal(),
          "h-[3px] w-6": !isHorizontal(),
          "!bg-tx-3": dragging(),
        }}
      />
    </div>
  );
}
