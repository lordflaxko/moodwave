import { clamp, hash } from "./utils";

/**
 * Mood → color. Low valence sits in cool indigo/teal, high valence in warm coral/amber;
 * energy drives saturation and brightness. Every playlist page re-tints the whole UI
 * with its own mood colors.
 */
export function moodColors(energy: number, valence: number): { a: string; b: string } {
  const e = clamp(energy);
  const v = clamp(valence);
  // 250 (indigo) → 320 (magenta) → 395 (≈35, amber)
  const hueA = 250 + v * 145;
  const hueB = hueA + 35 + e * 20;
  // Restrained on purpose: the atmosphere should tint, never shout.
  const chroma = 0.07 + e * 0.06;
  const light = 0.62 + e * 0.08;
  return {
    a: `oklch(${(light - 0.04).toFixed(3)} ${chroma.toFixed(3)} ${(hueA % 360).toFixed(1)})`,
    b: `oklch(${(light + 0.06).toFixed(3)} ${(chroma + 0.02).toFixed(3)} ${(hueB % 360).toFixed(1)})`,
  };
}

export function moodStyle(energy: number, valence: number): React.CSSProperties {
  const { a, b } = moodColors(energy, valence);
  return { "--mood-a": a, "--mood-b": b } as React.CSSProperties;
}

/** Deterministic generated album art for tracks without artwork (demo catalog). */
export function coverArt(seed: string): { background: string; accent: string } {
  const h = hash(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >> 9) % 120)) % 360;
  const hue3 = (hue1 + 180 + ((h >> 4) % 60)) % 360;
  const angle = (h >> 3) % 360;
  const x = 20 + ((h >> 12) % 60);
  const y = 20 + ((h >> 16) % 60);
  const style = (h >> 20) % 3;
  const layers = [
    `radial-gradient(circle at ${x}% ${y}%, oklch(0.85 0.14 ${hue3} / 0.85) 0%, transparent ${style === 0 ? 28 : 42}%)`,
    style === 1
      ? `repeating-radial-gradient(circle at ${100 - x}% ${100 - y}%, oklch(1 0 0 / 0.07) 0 2px, transparent 2px 9px)`
      : `radial-gradient(circle at ${100 - x}% ${100 - y}%, oklch(0.3 0.12 ${hue2} / 0.9) 0%, transparent 55%)`,
    `linear-gradient(${angle}deg, oklch(0.55 0.19 ${hue1}), oklch(0.32 0.14 ${hue2}))`,
  ];
  return { background: layers.join(","), accent: `oklch(0.8 0.12 ${hue3})` };
}
