let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let timeDomainData: Float32Array | null = null;
let rafId: number | null = null;
let barsCallback: ((bars: number[]) => void) | null = null;
let barCount = 20;
let smoothed: number[] = [];
let outputBufA: number[] = [];
let outputBufB: number[] = [];
let useA = true;

const SMOOTHING = 0.15;
const DECAY = 0.92;
const SILENCE_THRESHOLD = 0.01;

function tick(): void {
  if (!analyser || !timeDomainData || !barsCallback) return;
  analyser.getFloatTimeDomainData(timeDomainData);

  // Calculate RMS volume
  let sumSq = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    sumSq += timeDomainData[i] * timeDomainData[i];
  }
  const rms = Math.sqrt(sumSq / timeDomainData.length);

  // Gate: if below silence threshold, all bars are zero
  const level = rms < SILENCE_THRESHOLD ? 0 : Math.min(1, rms * 5);

  // Distribute level across bars: bell curve (center tall, edges short) + gentle wave
  for (let i = 0; i < barCount; i++) {
    const center = (i - (barCount - 1) / 2) / ((barCount - 1) / 2); // -1 to 1
    const bell = 1 - center * center; // 0 at edges, 1 at center
    const envelope = 0.3 + 0.7 * bell; // 30% min at edges, 100% at center
    const wave = Math.sin(i * 1.7 + Date.now() * 0.002) * 0.15 + 0.85;
    const target = level > 0 ? level * envelope * wave : 0;
    const prev = smoothed[i] ?? 0;
    smoothed[i] = target > prev ? prev + (target - prev) * SMOOTHING : prev * DECAY;
    if (smoothed[i] < 0.005) smoothed[i] = 0;
  }

  const buf = useA ? outputBufA : outputBufB;
  for (let i = 0; i < barCount; i++) {
    buf[i] = smoothed[i];
  }
  useA = !useA;
  barsCallback(buf);
  rafId = requestAnimationFrame(tick);
}

/**
 * Start capturing microphone audio and emit smoothed volume-based bar levels each frame.
 * Uses RMS volume instead of frequency analysis for stable, noise-resistant metering.
 * @param count Number of bars to render.
 * @param onBars Callback receiving normalized bar values (0-1) every animation frame.
 */
export async function startAudioLevel(
  deviceId: string | undefined,
  count: number,
  onBars: (bars: number[]) => void,
): Promise<void> {
  stopAudioLevel();
  barCount = count;
  smoothed = Array.from({ length: count }, () => 0);
  outputBufA = Array.from({ length: count }, () => 0);
  outputBufB = Array.from({ length: count }, () => 0);
  useA = true;

  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  sourceNode = audioCtx.createMediaStreamSource(stream);
  sourceNode.connect(analyser);

  timeDomainData = new Float32Array(analyser.fftSize);
  barsCallback = onBars;
  rafId = requestAnimationFrame(tick);
}

/** Stop capturing audio levels and release the microphone stream. */
export function stopAudioLevel(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  barsCallback = null;
  smoothed = [];
  outputBufA = [];
  outputBufB = [];
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode.mediaStream.getTracks().forEach((t) => t.stop());
    sourceNode = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  analyser = null;
  timeDomainData = null;
}
