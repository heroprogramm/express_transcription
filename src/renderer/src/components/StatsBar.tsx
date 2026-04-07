import { type Accessor } from "solid-js";
import Waveform from "./Waveform";

interface Props {
  latency: Accessor<string>;
  words: Accessor<number>;
  uptime: Accessor<string>;
}

export default function StatsBar(props: Props) {
  return (
    <nav class="topbar-stats">
      <div class="stat-chip">
        <span class="stat-icon">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" /><path d="M8 5v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
        <span class="stat-label">Latency</span>
        <span class="stat-value mono">{props.latency()}</span>
      </div>
      <div class="stat-chip stat-audio">
        <span class="stat-icon">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1" y="6" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.5" /><rect x="4.5" y="4" width="2" height="8" rx="0.5" fill="currentColor" opacity="0.7" /><rect x="8" y="2" width="2" height="12" rx="0.5" fill="currentColor" opacity="0.85" /><rect x="11.5" y="5" width="2" height="6" rx="0.5" fill="currentColor" /></svg>
        </span>
        <span class="stat-label">Audio</span>
        <Waveform />
      </div>
      <div class="stat-chip">
        <span class="stat-icon">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </span>
        <span class="stat-label">Words</span>
        <span class="stat-value mono">{props.words()}</span>
      </div>
      <div class="stat-chip">
        <span class="stat-icon">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" /></svg>
        </span>
        <span class="stat-label">Uptime</span>
        <span class="stat-value mono">{props.uptime()}</span>
      </div>
    </nav>
  );
}
