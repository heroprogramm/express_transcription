import { type Accessor } from "solid-js";

interface Props {
  latency: Accessor<string>;
  words: Accessor<number>;
  uptime: Accessor<string>;
}

function Stat(props: { label: string; children: any }) {
  return (
    <div class="flex items-center gap-1.5">
      <span class="text-[11px] font-semibold text-tx-4 tracking-wider uppercase">
        {props.label}
      </span>
      <span class="text-[13px] font-bold text-tx tabular-nums">{props.children}</span>
    </div>
  );
}

export default function StatsBar(props: Props) {
  return (
    <div class="flex items-center gap-3">
      <Stat label="Latency">{props.latency()}</Stat>
      <span class="text-tx-4 text-[10px]">/</span>
      <Stat label="Words">{props.words()}</Stat>
      <span class="text-tx-4 text-[10px]">/</span>
      <Stat label="Uptime">{props.uptime()}</Stat>
    </div>
  );
}
