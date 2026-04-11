import { createSignal, For, onCleanup } from "solid-js";
import { CircleX, CircleAlert } from "lucide-solid";

interface ToastItem {
  id: number;
  message: string;
  type: "error" | "info";
  dismissing?: boolean;
  action?: { label: string; onClick: () => void };
}

let nextId = 0;
const [toasts, setToasts] = createSignal<ToastItem[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();

/** Display a toast notification. Automatically dismisses after 6 s (or 30 s if an action is present). */
export function showToast(
  message: string,
  type: "error" | "info" = "error",
  action?: { label: string; onClick: () => void },
) {
  const id = nextId++;
  setToasts((prev) => [...prev, { id, message, type, action }]);

  const timer = setTimeout(() => dismiss(id), action ? 30000 : 6000);
  timers.set(id, timer);
}

function dismiss(id: number) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 200);
}

const TOAST_STYLES = {
  error:
    "toast-error bg-red-soft/15 border-red/25 text-red light:bg-red-soft/10 light:border-red-soft/30 light:text-red-soft",
  info: "toast-info bg-steel-soft/15 border-steel/25 text-steel light:bg-steel-soft/10 light:border-steel-soft/30 light:text-steel-soft",
} as const;

/** Fixed-position container that renders active toast notifications. */
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
            class={`toast-item flex items-start gap-3 px-4 py-3 rounded-md border shadow-lg backdrop-blur-sm cursor-pointer font-ui text-[13px] leading-snug ${
              toast.dismissing ? "toast-out" : "toast-in"
            } ${TOAST_STYLES[toast.type]}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                dismiss(toast.id);
              }
            }}
            onClick={() => dismiss(toast.id)}
          >
            <div class="toast-icon shrink-0 mt-px">
              {toast.type === "error" ? <CircleX size={16} /> : <CircleAlert size={16} />}
            </div>
            <span class="flex-1 break-words">{toast.message}</span>
            {toast.action && (
              <button
                class="shrink-0 ml-1 px-2 py-0.5 rounded text-[12px] font-semibold bg-white/15 hover:bg-white/25 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  toast.action!.onClick();
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </For>
    </div>
  );
}
