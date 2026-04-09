import { createSignal, For, onCleanup } from "solid-js";

interface ToastItem {
  id: number;
  message: string;
  type: "error" | "info";
  dismissing?: boolean;
}

let nextId = 0;
const [toasts, setToasts] = createSignal<ToastItem[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function showToast(message: string, type: "error" | "info" = "error") {
  const id = nextId++;
  setToasts((prev) => [...prev, { id, message, type }]);

  const timer = setTimeout(() => dismiss(id), 6000);
  timers.set(id, timer);
}

function dismiss(id: number) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  // Start dismiss animation
  setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
  // Remove after animation
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 200);
}

export default function ToastContainer() {
  onCleanup(() => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  });

  return (
    <div class="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-[420px]">
      <For each={toasts()}>
        {(toast) => (
          <div
            class={`toast-item flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm cursor-pointer font-ui text-[13px] leading-snug ${
              toast.dismissing ? "toast-out" : "toast-in"
            } ${
              toast.type === "error"
                ? "bg-red-soft/15 border-red/25 text-red light:bg-red-soft/10 light:border-red-soft/30 light:text-red-soft"
                : "bg-steel-soft/15 border-steel/25 text-steel light:bg-steel-soft/10 light:border-steel-soft/30 light:text-steel-soft"
            }`}
            onClick={() => dismiss(toast.id)}
          >
            <span class="shrink-0 mt-px text-[15px]">{toast.type === "error" ? "✕" : "ℹ"}</span>
            <span class="flex-1 break-words">{toast.message}</span>
          </div>
        )}
      </For>
    </div>
  );
}
