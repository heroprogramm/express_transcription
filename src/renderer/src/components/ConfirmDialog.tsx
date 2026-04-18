import { Show } from "solid-js";
import { X, AlertTriangle } from "lucide-solid";
import Button from "@/components/Button";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog(props: Props) {
  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-[1000] bg-bg/80 backdrop-blur-sm flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onCancel();
        }}
      >
        <div class="animate-modal bg-raised border border-border rounded-md w-[380px] max-w-[90vw] shadow-[0_20px_60px_var(--bg)] p-6">
          <h3 class="text-[15px] font-bold text-tx font-ui">{props.title}</h3>
          <p class="text-[13px] text-tx-3 mt-2 font-ui leading-relaxed">{props.message}</p>
          <div class="flex justify-end gap-2 mt-5">
            <Button variant="ghost" size="sm" onClick={props.onCancel}>
              <X size={14} />
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={props.onConfirm}>
              <AlertTriangle size={14} />
              {props.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </div>
      </div>
    </Show>
  );
}
