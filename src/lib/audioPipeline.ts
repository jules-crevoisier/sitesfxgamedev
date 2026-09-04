/**
 * Client-side SFX pipeline via ffmpeg.wasm.
 *
 * Audacity-like flow:
 * 1. Truncate silence (cut blanc)
 * 2. Amplify — boost until peaks fill the rails, then set final peak
 * 3. Peak at normalizePeakDb (−6 by default)
 * 4. Export OGG Vorbis mono 44.1 kHz
 */
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { resolveInputExtension } from "./audioFormats";

export interface ProcessOptions {
  /** Silence threshold in dB (e.g. -50). */
  silenceThresholdDb: number;
  /**
   * Final peak level after Audacity-style Amplify+Normalize (dB).
   * Waveform will "stick" to this level (like Audacity New Peak Amplitude).
   */
  normalizePeakDb: number;
  /** Vorbis quality 0–10 (use OGG_PRESETS labels in UI). */
  oggQuality: number;
}

export interface ProcessResult {
  blob: Blob;
  /** WAV copy for reliable in-browser preview (Safari etc.). */
  previewBlob: Blob;
  fileName: string;
  durationBeforeMs: number;
  durationAfterMs: number;
  gainAppliedDb: number;
  peakBeforeDb: number;
  peakAfterDb: number;
}

export const DEFAULT_OPTIONS: ProcessOptions = {
  silenceThresholdDb: -50,
  normalizePeakDb: -6,
  oggQuality: 5,
};

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

/**
 * Loads ffmpeg.wasm once (SharedArrayBuffer / COOP+COEP required).
 */
export async function getFFmpeg(
  onProgress?: (ratio: number) => void,
): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) {
    return ffmpegInstance;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    if (onProgress) {
      ffmpeg.on("progress", ({ progress }) => {
        onProgress(Math.min(1, Math.max(0, progress)));
      });
    }

    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm",
      ),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
}

function sanitizeBaseName(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/u, "");
  return withoutExt.replace(/[^\w.\-()+ ]+/gu, "_") || "sfx";
}

function parseDurationSeconds(logText: string): number | null {
  const matches = [
    ...logText.matchAll(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/gu),
  ];
  const last = matches.at(-1);
  if (!last) {
    return null;
  }
  const hours = Number(last[1]);
  const minutes = Number(last[2]);
  const seconds = Number(last[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseMaxVolume(logText: string): number | null {
  const match = logText.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/u);
  if (!match?.[1]) {
    return null;
  }
  return Number(match[1]);
}

function toArrayBufferCopy(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

function toBlob(data: Uint8Array, mimeType: string): Blob {
  return new Blob([toArrayBufferCopy(data)], { type: mimeType });
}

function asUint8(data: Uint8Array | string): Uint8Array {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  return data;
}

/**
 * Processes one audio file into game-ready OGG.
 *
 * Amplify = Audacity Amplify: measure peak, apply gain so waveform
 * fills up to normalizePeakDb (coller au-dessus / en-dessous des lignes).
 */
export async function processSfxFile(
  file: File,
  options: ProcessOptions = DEFAULT_OPTIONS,
  onProgress?: (ratio: number) => void,
): Promise<ProcessResult> {
  const ffmpeg = await getFFmpeg(onProgress);
  const baseName = sanitizeBaseName(file.name);
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputExt = resolveInputExtension(file);
  const inputName = `in_${stamp}.${inputExt}`;
  const trimmedName = `trim_${stamp}.wav`;
  const processedWavName = `processed_${stamp}.wav`;
  const outputName = `${baseName}.ogg`;
  const previewName = `preview_${stamp}.wav`;

  const logs: string[] = [];
  const logHandler = ({ message }: { message: string }): void => {
    logs.push(message);
  };
  ffmpeg.on("log", logHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    logs.length = 0;
    await ffmpeg.exec(["-i", inputName, "-f", "null", "-"]);
    const durationBeforeSec = parseDurationSeconds(logs.join("\n")) ?? 0;

    const threshold = options.silenceThresholdDb;
    const silenceFilter = [
      `silenceremove=start_periods=1:start_silence=0.02:start_threshold=${threshold}dB:detection=peak`,
      "areverse",
      `silenceremove=start_periods=1:start_silence=0.02:start_threshold=${threshold}dB:detection=peak`,
      "areverse",
    ].join(",");

    await ffmpeg.exec([
      "-i",
      inputName,
      "-af",
      silenceFilter,
      "-ar",
      "44100",
      "-ac",
      "1",
      trimmedName,
    ]);

    // Measure peak after trim (Audacity Amplify "Amplification" amount)
    logs.length = 0;
    await ffmpeg.exec([
      "-i",
      trimmedName,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]);

    const maxVolume = parseMaxVolume(logs.join("\n"));
    if (maxVolume === null) {
      throw new Error(`Impossible de mesurer le volume de « ${file.name} »`);
    }

    // Gain so New Peak Amplitude = normalizePeakDb (waveform sticks to rails)
    const gainDb = options.normalizePeakDb - maxVolume;

    // Amplify to target peak → intermediate WAV (also used for browser preview)
    await ffmpeg.exec([
      "-i",
      trimmedName,
      "-af",
      `volume=${gainDb}dB`,
      "-ar",
      "44100",
      "-ac",
      "1",
      processedWavName,
    ]);

    // Export OGG for download
    await ffmpeg.exec([
      "-i",
      processedWavName,
      "-c:a",
      "libvorbis",
      "-q:a",
      String(options.oggQuality),
      outputName,
    ]);

    logs.length = 0;
    await ffmpeg.exec(["-i", outputName, "-f", "null", "-"]);
    const durationAfterSec = parseDurationSeconds(logs.join("\n")) ?? 0;

    // Small preview WAV (same audio as OGG) — plays in every browser
    await ffmpeg.exec([
      "-i",
      processedWavName,
      "-c:a",
      "pcm_s16le",
      previewName,
    ]);

    const oggData = asUint8(await ffmpeg.readFile(outputName));
    const previewData = asUint8(await ffmpeg.readFile(previewName));

    return {
      blob: toBlob(oggData, "audio/ogg"),
      previewBlob: toBlob(previewData, "audio/wav"),
      fileName: outputName,
      durationBeforeMs: Math.round(durationBeforeSec * 1000),
      durationAfterMs: Math.round(durationAfterSec * 1000),
      gainAppliedDb: Math.round(gainDb * 100) / 100,
      peakBeforeDb: Math.round(maxVolume * 100) / 100,
      peakAfterDb: options.normalizePeakDb,
    };
  } finally {
    ffmpeg.off("log", logHandler);
    for (const name of [
      inputName,
      trimmedName,
      processedWavName,
      outputName,
      previewName,
    ]) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
}
