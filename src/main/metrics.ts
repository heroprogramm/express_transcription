import { app, type BrowserWindow } from "electron";
import { log, LogLevel } from "./logger";

/** Point-in-time snapshot of CPU, memory, and event-loop metrics for all Electron processes. */
export interface PerfSnapshot {
  ts: number;
  processes: Array<{
    pid: number;
    type: string;
    cpu: { percentCPUUsage: number };
    memory: { workingSetSize: number; privateBytes: number };
  }>;
  mainMemory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  eventLoopLagMs: number;
}

const COLLECTION_INTERVAL_MS = 2000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let peakRss = 0;
let peakHeapUsed = 0;
let cpuSamples: number[] = [];
let lagSamples: number[] = [];
let collectionStartTime = 0;

function collectAndSend(win: BrowserWindow): void {
  if (win.isDestroyed()) return;

  // Measure event loop lag: schedule a zero-delay timer and record drift
  const lagStart = performance.now();
  setImmediate(() => {
    const lagMs = performance.now() - lagStart;

    if (win.isDestroyed()) return;

    const appMetrics = app.getAppMetrics();
    const mainMem = process.memoryUsage();

    const snapshot: PerfSnapshot = {
      ts: Date.now(),
      processes: appMetrics.map((m) => ({
        pid: m.pid,
        type: m.type,
        cpu: { percentCPUUsage: m.cpu.percentCPUUsage },
        memory: {
          workingSetSize: m.memory.workingSetSize,
          privateBytes: m.memory.privateBytes ?? 0,
        },
      })),
      mainMemory: {
        rss: mainMem.rss,
        heapTotal: mainMem.heapTotal,
        heapUsed: mainMem.heapUsed,
        external: mainMem.external,
      },
      eventLoopLagMs: lagMs,
    };

    // Track peaks for session summary
    if (mainMem.rss > peakRss) peakRss = mainMem.rss;
    if (mainMem.heapUsed > peakHeapUsed) peakHeapUsed = mainMem.heapUsed;

    const mainProcess = appMetrics.find((m) => m.type === "Browser");
    if (mainProcess) cpuSamples.push(mainProcess.cpu.percentCPUUsage);
    lagSamples.push(lagMs);

    win.webContents.send("perf:snapshot", snapshot);
  });
}

/** Begins periodic performance sampling, sending snapshots to the renderer via IPC. */
export function startMetricsCollection(win: BrowserWindow): void {
  if (intervalId) return;
  peakRss = 0;
  peakHeapUsed = 0;
  cpuSamples = [];
  lagSamples = [];
  collectionStartTime = Date.now();

  collectAndSend(win);
  intervalId = setInterval(() => collectAndSend(win), COLLECTION_INTERVAL_MS);
}

/** Stops metrics collection and logs a summary of peak memory, average CPU, and event-loop lag. */
export function stopMetricsCollection(): void {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;

  const durationSec = (Date.now() - collectionStartTime) / 1000;
  const avgCpu =
    cpuSamples.length > 0 ? cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length : 0;
  const avgLag =
    lagSamples.length > 0 ? lagSamples.reduce((a, b) => a + b, 0) / lagSamples.length : 0;

  log(LogLevel.Info, "perf-summary", {
    durationSec: Math.round(durationSec),
    peakRssMB: Math.round(peakRss / 1024 / 1024),
    peakHeapMB: Math.round(peakHeapUsed / 1024 / 1024),
    avgCpuPercent: Math.round(avgCpu * 100) / 100,
    avgLagMs: Math.round(avgLag * 100) / 100,
    samples: cpuSamples.length,
  });
}
