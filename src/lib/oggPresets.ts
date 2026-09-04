/**
 * OGG Vorbis quality presets — human labels instead of raw q values.
 */

export interface OggPreset {
  q: number;
  label: string;
  hint: string;
}

export const OGG_PRESETS: readonly OggPreset[] = [
  { q: 3, label: "Léger", hint: "~96 kbps — fichier petit" },
  { q: 5, label: "Jeu", hint: "~160 kbps — idéal SFX" },
  { q: 7, label: "HD", hint: "~224 kbps — plus fidèle" },
  { q: 9, label: "Max", hint: "~320 kbps — plus lourd" },
] as const;

export function nearestOggPreset(q: number): OggPreset {
  let best = OGG_PRESETS[1]!;
  let bestDist = Infinity;
  for (const preset of OGG_PRESETS) {
    const dist = Math.abs(preset.q - q);
    if (dist < bestDist) {
      best = preset;
      bestDist = dist;
    }
  }
  return best;
}
