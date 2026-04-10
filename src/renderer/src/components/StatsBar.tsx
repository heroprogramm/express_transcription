import { createEffect, createSignal, type Accessor } from "solid-js";

/** Props for the {@link StatsBar} component. */
interface Props {
  latency: Accessor<string>;
  words: Accessor<number>;
  uptime: Accessor<string>;
  live: Accessor<boolean>;
}

function Stat(props: { label: string; value: Accessor<string | number>; live: boolean }) {
  const [flash, setFlash] = createSignal(false);
  let initial = true;

  createEffect(() => {
    props.value();
    if (initial) {
      initial = false;
      return;
    }
    if (!props.live) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 400);
  });

  return (
    <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all duration-300 bg-surface">
      <span class="text-[10px] font-semibold text-tx-4 tracking-wider uppercase select-none">
        {props.label}
      </span>
      <span
        class="text-[12px] font-bold tabular-nums transition-colors duration-300"
        classList={{
          "text-tx": !flash(),
          "text-burgundy": flash(),
        }}
      >
        {props.value()}
      </span>
    </div>
  );
}

/** Header bar displaying live latency, word count, and uptime statistics. */
export default function StatsBar(props: Props) {
  return (
    <div class="flex items-center gap-2">
      <Stat label="Latency" value={props.latency} live={props.live()} />
      <Stat label="Words" value={() => props.words()} live={props.live()} />
      <Stat label="Uptime" value={props.uptime} live={props.live()} />
    </div>
  );
}
