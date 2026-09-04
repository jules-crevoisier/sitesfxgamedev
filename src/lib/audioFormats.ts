/**
 * Accepted input audio formats for SFX Lab (ffmpeg.wasm decode + Web Audio preview).
 */

export const AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "wave",
  "ogg",
  "oga",
  "flac",
  "aac",
  "m4a",
  "mp4",
  "wma",
  "aiff",
  "aif",
  "aifc",
  "opus",
  "webm",
  "caf",
  "amr",
  "3gp",
  "3gpp",
  "ac3",
  "mka",
  "mkv",
  "mov",
  "au",
  "ra",
  "ram",
  "wv",
  "ape",
  "mpc",
  "tta",
  "voc",
  "w64",
  "rf64",
  "bwf",
  "sd2",
  "ixml",
] as const;

const EXTENSION_SET = new Set<string>(
  AUDIO_EXTENSIONS.map((ext) => ext.toLowerCase()),
);

/** HTML accept attribute: MIME types + extensions. */
export const AUDIO_ACCEPT = [
  "audio/*",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  ...AUDIO_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

/**
 * Returns the lowercase extension without the dot, or null.
 */
export function getFileExtension(fileName: string): string | null {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/u);
  return match?.[1] ?? null;
}

/**
 * True if the file looks like an accepted audio/container input.
 */
export function isAcceptedAudioFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  if (ext && EXTENSION_SET.has(ext)) {
    return true;
  }

  const type = file.type.toLowerCase();
  if (type.startsWith("audio/")) {
    return true;
  }

  // Some OS pickers send empty type; allow common video containers with audio
  if (
    type === "video/mp4" ||
    type === "video/webm" ||
    type === "video/quicktime" ||
    type === "video/x-matroska"
  ) {
    return true;
  }

  return false;
}

/**
 * Safe extension for ffmpeg virtual FS (falls back to bin if unknown).
 */
export function resolveInputExtension(file: File): string {
  const ext = getFileExtension(file.name);
  if (ext && EXTENSION_SET.has(ext)) {
    // ffmpeg prefers wav over wave
    if (ext === "wave") {
      return "wav";
    }
    return ext;
  }

  const type = file.type.toLowerCase();
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("wav")) return "wav";
  if (type.includes("ogg") || type.includes("vorbis") || type.includes("opus"))
    return "ogg";
  if (type.includes("flac")) return "flac";
  if (type.includes("aac") || type.includes("m4a") || type.includes("mp4"))
    return "m4a";
  if (type.includes("aiff") || type.includes("aif")) return "aiff";
  if (type.includes("webm")) return "webm";
  if (type.includes("wma")) return "wma";

  return "bin";
}

export const AUDIO_FORMATS_LABEL =
  "MP3, WAV, OGG, FLAC, AAC, M4A, AIFF, Opus, WMA, WebM…";
