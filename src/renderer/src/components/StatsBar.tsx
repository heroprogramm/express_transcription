import { type Accessor } from "solid-js";
import Waveform from "./Waveform";

interface Props {
  latency: Accessor<string>;
  words: Accessor<number>;
  uptime: Accessor<string>;
}

function StatChip(props: { children: any }) {
  return (
    <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-border transition-colors hover:border-border-lit">
      {props.children}
    </div>
  );
}

export default function StatsBar(props: Props) {
  return (
    <nav class="flex items-center gap-1.5">
      <StatChip>
        <span class="flex text-tx-3">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" /><path d="M8 5v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
        <span class="text-[11px] font-semibold text-tx-3 tracking-wide">Latency</span>
        <span class="text-[13px] font-semibold text-tx tracking-wider font-mono">{props.latency()}</span>
      </StatChip>

      <StatChip>
        <span class="flex text-tx-3">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1" y="6" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.5" /><rect x="4.5" y="4" width="2" height="8" rx="0.5" fill="currentColor" opacity="0.7" /><rect x="8" y="2" width="2" height="12" rx="0.5" fill="currentColor" opacity="0.85" /><rect x="11.5" y="5" width="2" height="6" rx="0.5" fill="currentColor" /></svg>
        </span>
        <span class="text-[11px] font-semibold text-tx-3 tracking-wide">Audio</span>
        <Waveform />
      </StatChip>

      <StatChip>
        <span class="flex text-tx-3">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </span>
        <span class="text-[11px] font-semibold text-tx-3 tracking-wide">Words</span>
        <span class="text-[13px] font-semibold text-tx tracking-wider font-mono">{props.words()}</span>
      </StatChip>

      <StatChip>
        <span class="flex text-tx-3">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" /></svg>
        </span>
        <span class="text-[11px] font-semibold text-tx-3 tracking-wide">Uptime</span>
        <span class="text-[13px] font-semibold text-tx tracking-wider font-mono">{props.uptime()}</span>
      </StatChip>
    </nav>
  );
}
