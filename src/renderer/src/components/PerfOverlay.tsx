import type { Accessor } from "solid-js";
import { getAudioHealth } from "@/lib/soniox";

function formatMB(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function statusColor(value: number, warn: number, crit: number): string {
  if (value >= crit) return "text-red";
  if (value >= warn) return "text-steel";
  return "text-burgundy";
}

function Metric(props: { label: string; value: string; colorClass?: string }) {
  return (
    <div class="flex justify-between items-center gap-3">
      <span class="text-[10px] font-semibold text-tx-4 tracking-wider uppercase">
        {props.label}
      </span>
      <span class={`text-[12px] font-bold tabular-nums ${props.colorClass ?? "text-tx"}`}>
        {props.value}
      </span>
    </div>
  );
}

/** Props for the {@link PerfOverlay} component. */
interface Props {
  fps: Accessor<number>;
  ipcRtt: Accessor<number>;
  mainCpu: Accessor<number>;
  rendererCpu: Accessor<number>;
  mainMemory: Accessor<{ rss: number; heapUsed: number; heapTotal: number }>;
  rendererMemory: Accessor<number>;
  eventLoopLag: Accessor<number>;
  latency: Accessor<string>;
  words: Accessor<number>;
  uptime: Accessor<string>;
  onClose: () => void;
}

/** Floating overlay displaying CPU, memory, FPS, IPC, and audio health metrics. */
export default function PerfOverlay(props: Props) {
  const audio = () => getAudioHealth();

  return (
    <div class="fixed bottom-4 right-4 z-[9998] w-[260px] rounded-md border border-border bg-raised/90 backdrop-blur-md shadow-xl font-ui">
      <div class="flex items-center justify-between px-3 py-2 border-b border-border">
        <span class="text-[10px] font-bold text-tx-3 tracking-widest uppercase">
          Performance Monitor
        </span>
        <button
          class="text-tx-4 hover:text-tx text-[12px] font-bold w-5 h-5 flex items-center justify-center rounded transition-colors"
          onClick={props.onClose}
        >
          x
        </button>
      </div>

      <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-2.5">
        <Metric
          label="CPU Main"
          value={`${props.mainCpu().toFixed(1)}%`}
          colorClass={statusColor(props.mainCpu(), 30, 60)}
        />
        <Metric
          label="FPS"
          value={`${props.fps()}`}
          colorClass={statusColor(61 - props.fps(), 11, 31)}
        />

        <Metric
          label="CPU Render"
          value={`${props.rendererCpu().toFixed(1)}%`}
          colorClass={statusColor(props.rendererCpu(), 30, 60)}
        />
        <Metric
          label="IPC"
          value={`${props.ipcRtt()}ms`}
          colorClass={statusColor(props.ipcRtt(), 10, 50)}
        />

        <Metric label="Heap Used" value={formatMB(props.mainMemory().heapUsed)} />
        <Metric
          label="Loop Lag"
          value={`${props.eventLoopLag().toFixed(1)}ms`}
          colorClass={statusColor(props.eventLoopLag(), 5, 16)}
        />

        <Metric label="RSS" value={formatMB(props.mainMemory().rss)} />
        <Metric
          label="Audio"
          value={audio().active ? "OK" : audio().state}
          colorClass={audio().active ? "text-burgundy" : "text-red"}
        />

        <Metric label="Latency" value={props.latency()} />
        <Metric label="Uptime" value={props.uptime()} />

        <Metric label="Words" value={`${props.words()}`} />
        <Metric label="Renderer" value={formatMB(props.rendererMemory())} />
      </div>
    </div>
  );
}
