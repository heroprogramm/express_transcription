import { createEffect, onCleanup, type Accessor } from "solid-js";
import { startAudioLevel, stopAudioLevel, getLevel } from "@/lib/audio-level";
import { reportError } from "@/lib/errors";
import { WAVEFORM_PUSH_INTERVAL_MS } from "@shared/timings";

const BAR_COUNT = 28;
const BAR_WIDTH = 3;
const BAR_GAP = 1.5;
const MIN_BAR_H = 3;
const HEIGHT = 22;
const TOTAL_W = BAR_COUNT * (BAR_WIDTH + BAR_GAP);

/** Props for the {@link AudioWaveform} component. */
interface Props {
  active: Accessor<boolean>;
  micDeviceId: Accessor<string>;
}

/** Scrolling WhatsApp-style waveform — new levels push in from the right. */
export default function AudioWaveform(props: Props) {
  let canvas!: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let pushTimer: ReturnType<typeof setInterval> | null = null;

  // Ring buffer
  const ring = new Float32Array(BAR_COUNT);
  let head = 0;

  function draw() {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const midY = (HEIGHT * dpr) / 2;
    const maxBarH = HEIGHT - 2;

    for (let i = 0; i < BAR_COUNT; i++) {
      const level = ring[(head + i) % BAR_COUNT];
      const barH = Math.max(MIN_BAR_H, level * maxBarH) * dpr;
      const x = i * (BAR_WIDTH + BAR_GAP) * dpr;
      const y = midY - barH / 2;
      const w = BAR_WIDTH * dpr;

      ctx.beginPath();
      ctx.roundRect(x, y, w, barH, w / 2);
      ctx.fill();
    }
  }

  function tick() {
    ring[head] = getLevel();
    head = (head + 1) % BAR_COUNT;
    draw();
  }

  createEffect(() => {
    if (props.active()) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = TOTAL_W * dpr;
      canvas.height = HEIGHT * dpr;

      ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle =
        getComputedStyle(document.documentElement).getPropertyValue("--blue").trim() || "#50a0d0";

      ring.fill(0);
      head = 0;

      startAudioLevel(props.micDeviceId() || undefined).catch((err) =>
        reportError("mic", "Failed to start audio level monitor", err),
      );
      pushTimer = setInterval(tick, WAVEFORM_PUSH_INTERVAL_MS);
    } else {
      cleanup();
      ring.fill(0);
      head = 0;
      draw();
    }
  });

  function cleanup() {
    if (pushTimer !== null) {
      clearInterval(pushTimer);
      pushTimer = null;
    }
    stopAudioLevel();
  }

  onCleanup(cleanup);

  return (
    <canvas
      ref={canvas}
      style={{ width: `${TOTAL_W}px`, height: `${HEIGHT}px` }}
      aria-hidden="true"
    />
  );
}
