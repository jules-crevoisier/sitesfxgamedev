/**
 * Decode audio and build peak arrays for Unity-style waveform drawing.
 */

export interface WaveformData {
  /** Peak magnitudes 0–1 for drawing (positive envelope). */
  peaks: Float32Array;
  durationSec: number;
  /** True peak in dBFS of the decoded buffer. */
  peakDb: number;
}

const DEFAULT_BARS = 256;

/**
 * Decodes a File or Blob URL into drawable waveform peaks.
 */
export async function loadWaveform(
  source: File | Blob | string,
  barCount: number = DEFAULT_BARS,
): Promise<WaveformData> {
  const audioContext = new AudioContext();
  try {
    const arrayBuffer =
      typeof source === "string"
        ? await (await fetch(source)).arrayBuffer()
        : await source.arrayBuffer();

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channel = mixToMono(audioBuffer);
    const peaks = buildPeaks(channel, barCount);
    const peakDb = samplesToPeakDb(channel);

    return {
      peaks,
      durationSec: audioBuffer.duration,
      peakDb,
    };
  } finally {
    await audioContext.close();
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }

  const mixed = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mixed[i] = (mixed[i] ?? 0) + data[i]! / numberOfChannels;
    }
  }
  return mixed;
}

function buildPeaks(samples: Float32Array, barCount: number): Float32Array {
  const peaks = new Float32Array(barCount);
  const block = Math.max(1, Math.floor(samples.length / barCount));

  for (let i = 0; i < barCount; i += 1) {
    const start = i * block;
    const end = Math.min(samples.length, start + block);
    let max = 0;
    for (let j = start; j < end; j += 1) {
      const abs = Math.abs(samples[j] ?? 0);
      if (abs > max) {
        max = abs;
      }
    }
    peaks[i] = max;
  }

  return peaks;
}

function samplesToPeakDb(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const abs = Math.abs(samples[i] ?? 0);
    if (abs > max) {
      max = abs;
    }
  }
  if (max <= 0) {
    return -100;
  }
  return 20 * Math.log10(max);
}
