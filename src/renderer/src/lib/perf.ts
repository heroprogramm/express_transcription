import { createSignal, onCleanup } from "solid-js";
import type { PerfSnapshot } from "./types";
import { perfStart, perfStop, perfPing, onPerfSnapshot } from "./ipc";

export function createPerfMonitor() {
  const [enabled, setEnabled] = createSignal(false);
  const [fps, setFps] = createSignal(0);
  const [ipcRtt, setIpcRtt] = createSignal(0);
  const [mainCpu, setMainCpu] = createSignal(0);
  const [rendererCpu, setRendererCpu] = createSignal(0);
  const [mainMemory, setMainMemory] = createSignal({ rss: 0, heapUsed: 0, heapTotal: 0 });
  const [rendererMemory, setRendererMemory] = createSignal(0);
  const [eventLoopLag, setEventLoopLag] = createSignal(0);

  let cleanupSnapshot: (() => void) | null = null;
  let rafId: number | null = null;
  let frameCount = 0;
  let lastFpsTime = 0;
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  function countFrames(now: number): void {
    frameCount++;
    if (now - lastFpsTime >= 1000) {
      setFps(frameCount);
      frameCount = 0;
      lastFpsTime = now;
    }
    if (enabled()) {
      rafId = requestAnimationFrame(countFrames);
    }
  }

  function handleSnapshot(snapshot: PerfSnapshot): void {
    setEventLoopLag(snapshot.eventLoopLagMs);
    setMainMemory({
      rss: snapshot.mainMemory.rss,
      heapUsed: snapshot.mainMemory.heapUsed,
      heapTotal: snapshot.mainMemory.heapTotal,
    });

    for (const proc of snapshot.processes) {
      if (proc.type === "Browser") {
        setMainCpu(proc.cpu.percentCPUUsage);
      } else if (proc.type === "Tab") {
        setRendererCpu(proc.cpu.percentCPUUsage);
        setRendererMemory(proc.memory.workingSetSize);
      }
    }
  }

  async function measureIpcRtt(): Promise<void> {
    const before = Date.now();
    await perfPing();
    setIpcRtt(Date.now() - before);
  }

  function start(): void {
    setEnabled(true);
    perfStart().catch(() => {});
    cleanupSnapshot = onPerfSnapshot(handleSnapshot);

    lastFpsTime = performance.now();
    frameCount = 0;
    rafId = requestAnimationFrame(countFrames);

    measureIpcRtt();
    pingInterval = setInterval(() => measureIpcRtt(), 2000);
  }

  function stop(): void {
    setEnabled(false);
    perfStop().catch(() => {});
    if (cleanupSnapshot) {
      cleanupSnapshot();
      cleanupSnapshot = null;
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  function toggle(): void {
    if (enabled()) {
      stop();
    } else {
      start();
    }
  }

  onCleanup(stop);

  return {
    enabled,
    fps,
    ipcRtt,
    mainCpu,
    rendererCpu,
    mainMemory,
    rendererMemory,
    eventLoopLag,
    toggle,
  };
}
