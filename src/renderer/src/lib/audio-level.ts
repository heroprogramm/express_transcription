let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let timeDomainData: Float32Array<ArrayBuffer> | null = null;

const SILENCE_THRESHOLD = 0.015;

/** Read current RMS level from the analyser. Returns 0-1. */
export function getLevel(): number {
  if (!analyser || !timeDomainData) return 0;
  analyser.getFloatTimeDomainData(timeDomainData);

  let sumSq = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    sumSq += timeDomainData[i] * timeDomainData[i];
  }
  const rms = Math.sqrt(sumSq / timeDomainData.length);
  return rms < SILENCE_THRESHOLD ? 0 : Math.min(1, rms * 12);
}

/** Start capturing microphone audio. Poll with {@link getLevel}. */
export async function startAudioLevel(deviceId: string | undefined): Promise<void> {
  stopAudioLevel();

  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  sourceNode = audioCtx.createMediaStreamSource(stream);
  sourceNode.connect(analyser);

  timeDomainData = new Float32Array(
    new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
  );
}

/** Stop capturing audio levels and release the microphone stream. */
export function stopAudioLevel(): void {
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
