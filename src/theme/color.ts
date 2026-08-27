/**
 * Colour helpers for the custom accent.
 *
 * A user can pick any colour, including ones that would leave button labels
 * unreadable. These functions derive the hover shade and the ink colour that
 * sits on top of the accent so every choice stays legible.
 */

/** "#5B8CFF" -> "91 140 255". Returns null for anything unparseable. */
export function hexToRgbTriple(hex: string): string | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!match) return null;

  let value = match[1]!;
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** "91 140 255" -> "#5b8cff". */
export function rgbTripleToHex(triple: string): string {
  const [r = 0, g = 0, b = 0] = triple.split(/\s+/).map(Number);
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Relative luminance per WCAG 2.1.
 * Used to decide whether text on this colour should be black or white.
 */
function luminance(r: number, g: number, b: number): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Pick a near-black or near-white ink for text sitting on `triple`.
 * Both options are slightly off-pure so they read as designed, not stark.
 */
export function readableInk(triple: string): string {
  const [r = 0, g = 0, b = 0] = triple.split(/\s+/).map(Number);
  return luminance(r, g, b) > 0.45 ? "17 17 20" : "255 255 255";
}

/**
 * Lighten (positive) or darken (negative) a colour by a percentage.
 * Operates in RGB, which is good enough for a one-step hover shade.
 */
export function shiftLightness(triple: string, percent: number): string {
  const [r = 0, g = 0, b = 0] = triple.split(/\s+/).map(Number);
  const amount = (percent / 100) * 255;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n + amount)));
  return `${clamp(r)} ${clamp(g)} ${clamp(b)}`;
}

/** Contrast ratio between two RGB triples, per WCAG 2.1. */
export function contrastRatio(a: string, b: string): number {
  const parse = (t: string) => t.split(/\s+/).map(Number) as [number, number, number];
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const l1 = luminance(r1, g1, b1);
  const l2 = luminance(r2, g2, b2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Preset accents offered alongside the free colour picker.
 * Chosen to stay usable on both light and dark grounds.
 */
export const ACCENT_PRESETS: readonly { name: string; hex: string }[] = [
  { name: "Blue", hex: "#3b82f6" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Orange", hex: "#f97316" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Lime", hex: "#84cc16" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Slate", hex: "#64748b" },
] as const;
