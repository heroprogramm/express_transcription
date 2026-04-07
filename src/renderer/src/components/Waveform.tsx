import { onMount, onCleanup } from "solid-js";

const BARS = 40;

export default function Waveform() {
  let canvas: HTMLCanvasElement | undefined;
  const history = new Float32Array(BARS);
  let animId = 0;

  function getColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
  }

  function draw() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height, barW = w / BARS;
    const color = getColor();
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < BARS; i++) {
      const level = history[i];
      const barH = Math.max(2, level * h);
      const x = i * barW, y = (h - barH) / 2;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3 + 0.7 * (i / BARS);
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y, barW - 1, barH, 1);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  onMount(() => {
    if (canvas) {
      (canvas as any).pushLevel = (rms: number) => {
        history.copyWithin(0, 1);
        history[BARS - 1] = Math.min(rms * 4, 1);
        draw();
      };
      (canvas as any).reset = () => { history.fill(0); draw(); };
      draw();
    }
  });

  onCleanup(() => { if (animId) cancelAnimationFrame(animId); });

  return <canvas ref={canvas} id="audio-waveform" class="w-[120px] h-6 rounded block" width={120} height={24} />;
}
