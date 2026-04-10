let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
let rafId: number | null = null;
let barsCallback: ((bars: number[]) => void) | null = null;
let barCount = 20;
let smoothed: number[] = [];

const SMOOTHING = 0.25;
const DECAY = 0.85;

function tick(): void {
  if (!analyser || !freqData || !barsCallback) return;
  analyser.getByteFrequencyData(freqData);

  const binCount = freqData.length;

  for (let i = 0; i < barCount; i++) {
    const lowFrac = i / barCount;
    const highFrac = (i + 1) / barCount;
    const low = Math.floor(lowFrac ** 2 * binCount);
    const high = Math.max(low + 1, Math.floor(highFrac ** 2 * binCount));

    let sum = 0;
    for (let j = low; j < high && j < binCount; j++) {
      sum += freqData[j];
    }
    const avg = sum / (high - low) / 255;
    const target = Math.min(1, avg * 2);
    const prev = smoothed[i] ?? 0;
    smoothed[i] = target > prev ? prev + (target - prev) * SMOOTHING : prev * DECAY;
  }

  barsCallback([...smoothed]);
  rafId = requestAnimationFrame(tick);
}

export async function startAudioLevel(
  deviceId: string | undefined,
  count: number,
  onBars: (bars: number[]) => void,
): Promise<void> {
  stopAudioLevel();
  barCount = count;
  smoothed = Array.from({ length: count }, () => 0);

  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.4;
  sourceNode = audioCtx.createMediaStreamSource(stream);
  sourceNode.connect(analyser);

  freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
  barsCallback = onBars;
  rafId = requestAnimationFrame(tick);
}

export function stopAudioLevel(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  barsCallback = null;
  smoothed = [];
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
  freqData = null;
}
