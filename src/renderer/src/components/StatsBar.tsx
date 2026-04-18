import { createMemo, type Accessor, type JSX } from "solid-js";
import { Timer, Hash, Clock, Wifi } from "lucide-solid";

/** Props for the {@link StatsBar} component. */
interface Props {
  latency: Accessor<string>;
  lines: Accessor<number>;
  uptime: Accessor<string>;
  live: Accessor<boolean>;
}

type Quality = "good" | "fair" | "poor" | "unknown";

const QUALITY_CONFIG: Record<Quality, { label: string; color: string; dot: string }> = {
  good: { label: "Good", color: "text-green-500", dot: "bg-green-500" },
  fair: { label: "Fair", color: "text-yellow-500", dot: "bg-yellow-500" },
  poor: { label: "Poor", color: "text-red-500", dot: "bg-red-500" },
  unknown: { label: "—", color: "text-tx-4", dot: "bg-tx-4" },
};

function deriveQuality(latencyStr: string): Quality {
  const match = latencyStr.match(/^([\d.]+)s$/);
  if (!match) return "unknown";
  const seconds = parseFloat(match[1]);
  if (seconds < 2) return "good";
  if (seconds <= 5) return "fair";
  return "poor";
}

function Stat(props: {
  label: string;
  icon: JSX.Element;
  value: Accessor<string | number>;
  active: Accessor<boolean>;
}) {
  return (
    <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-surface">
      <span class="text-tx-4 shrink-0">{props.icon}</span>
      <span class="text-[11px] font-semibold text-tx-4 tracking-wider uppercase select-none">
        {props.label}
      </span>
      <span
        class="text-[13px] font-bold tabular-nums"
        classList={{ "text-tx": props.active(), "text-tx-4": !props.active() }}
      >
        {props.value()}
      </span>
    </div>
  );
}

/** Header bar displaying live latency, word count, uptime, and connection quality. */
export default function StatsBar(props: Props) {
  const quality = createMemo(() => deriveQuality(props.latency()));
  const cfg = createMemo(() => QUALITY_CONFIG[quality()]);

  return (
    <div class="flex items-center gap-2.5">
      <Stat label="Latency" icon={<Timer size={12} />} value={props.latency} active={props.live} />
      <Stat
        label="Lines"
        icon={<Hash size={12} />}
        value={() => props.lines()}
        active={props.live}
      />
      <Stat label="Uptime" icon={<Clock size={12} />} value={props.uptime} active={props.live} />
      <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-surface">
        <Wifi size={12} class="text-tx-4 shrink-0" />
        <span class="text-[11px] font-semibold text-tx-4 tracking-wider uppercase select-none">
          Signal
        </span>
        <span class={`inline-block w-1.5 h-1.5 rounded-full ${cfg().dot}`} />
        <span class={`text-[13px] font-bold ${cfg().color}`}>{cfg().label}</span>
      </div>
    </div>
  );
}
