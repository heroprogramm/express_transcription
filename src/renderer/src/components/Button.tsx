import type { JSX } from "solid-js";

const base =
  "font-ui font-semibold cursor-pointer inline-flex items-center justify-center transition-all active:not-disabled:scale-[0.97] disabled:opacity-25 disabled:cursor-not-allowed disabled:pointer-events-none";

const variants = {
  primary: `${base} h-[34px] px-4 text-[13px] gap-1.5 rounded-md border-none bg-green-soft text-white shadow-[0_1px_4px_rgba(52,211,153,0.15)] hover:not-disabled:bg-green hover:not-disabled:shadow-[0_2px_10px_rgba(52,211,153,0.25)] hover:not-disabled:-translate-y-px active:not-disabled:translate-y-0`,
  danger: `${base} h-[34px] px-4 text-[13px] gap-1.5 rounded-md border-none bg-red-soft text-white shadow-[0_1px_4px_rgba(248,113,113,0.15)] hover:not-disabled:bg-red hover:not-disabled:shadow-[0_2px_10px_rgba(248,113,113,0.25)] hover:not-disabled:-translate-y-px active:not-disabled:translate-y-0`,
  ghost: `${base} h-[34px] px-4 text-[13px] rounded-md bg-transparent text-tx-3 border border-border hover:bg-surface hover:text-tx-2 hover:border-border-lit active:bg-hover`,
  icon: `${base} w-[32px] h-[32px] rounded-full border border-border bg-surface text-tx-3 shrink-0 hover:bg-hover hover:text-tx hover:border-border-lit active:bg-surface`,
} as const;

type Variant = keyof typeof variants;

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export default function Button(props: ButtonProps) {
  const variant = () => props.variant || "ghost";
  return (
    <button {...props} class={`${variants[variant()]}${props.class ? ` ${props.class}` : ""}`}>
      {props.children}
    </button>
  );
}
