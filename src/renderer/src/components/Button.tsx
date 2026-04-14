import type { JSX } from "solid-js";

const base =
  "font-ui font-semibold cursor-pointer inline-flex items-center justify-center transition-all active:not-disabled:scale-[0.97] disabled:opacity-25 disabled:cursor-not-allowed disabled:pointer-events-none select-none outline-none focus-visible:border-border-focus focus-visible:shadow-[0_0_0_3px_var(--border)]";

const sizes = {
  sm: "h-[32px] px-3.5 text-[12px] gap-1.5 rounded-md",
  md: "h-[40px] px-5 text-[14px] gap-2 rounded-md",
} as const;

const variants = {
  primary: `border-none bg-green-soft text-white hover:not-disabled:bg-green hover:not-disabled:-translate-y-px active:not-disabled:translate-y-0`,
  danger: `border-none bg-red-soft text-white hover:not-disabled:bg-red hover:not-disabled:-translate-y-px active:not-disabled:translate-y-0`,
  ghost: `bg-transparent text-tx-3 border border-border hover:bg-surface hover:text-tx-2 hover:border-border-lit active:bg-hover`,
  "ghost-danger": `bg-transparent text-red border border-border hover:bg-red/10 hover:border-red/30 active:bg-red/15`,
  icon: `w-[32px] h-[32px] rounded-full border border-border bg-surface text-tx-3 shrink-0 hover:bg-hover hover:text-tx hover:border-border-lit active:bg-surface`,
} as const;

type Variant = keyof typeof variants;
type Size = keyof typeof sizes;

/** Props for the {@link Button} component. */
interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Themed button with primary, danger, ghost, ghost-danger, and icon variants. */
export default function Button(props: ButtonProps) {
  const variant = () => props.variant || "ghost";
  const size = () => (variant() === "icon" ? "" : sizes[props.size || "md"]);
  return (
    <button
      {...props}
      class={`${base} ${size()} ${variants[variant()]}${props.class ? ` ${props.class}` : ""}`}
    >
      {props.children}
    </button>
  );
}
