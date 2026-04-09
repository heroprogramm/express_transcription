import { type Accessor } from "solid-js";

interface Props {
  latency: Accessor<string>;
  words: Accessor<number>;
  uptime: Accessor<string>;
  live: Accessor<boolean>;
}

function Stat(props: { label: string; live: boolean; children: any }) {
  return (
    <div
      class="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all duration-300"
      style={{
        background: "var(--bg-surface)",
      }}
    >
      <span class="text-[10px] font-semibold text-tx-4 tracking-wider uppercase">
        {props.label}
      </span>
      <span class="text-[12px] font-bold text-tx tabular-nums">{props.children}</span>
    </div>
  );
}

export default function StatsBar(props: Props) {
  return (
    <div class="flex items-center gap-2">
      <Stat label="Latency" live={props.live()}>
        {props.latency()}
      </Stat>
      <Stat label="Words" live={props.live()}>
        {props.words()}
      </Stat>
      <Stat label="Uptime" live={props.live()}>
        {props.uptime()}
      </Stat>
    </div>
  );
}
