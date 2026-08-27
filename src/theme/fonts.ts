/**
 * Font pairings.
 *
 * Each pairing is a UI face plus a matching monospace face. Every family here
 * is on Google Fonts, which is the only font host the app loads from.
 *
 * Pairings were chosen from what developer tooling actually uses rather than
 * assembled at random — Geist/Geist Mono is Vercel's system, Mona Sans and
 * Hubot Mono are GitHub's, and IBM Plex is a complete designed superfamily.
 */

export type FontPairId =
  | "geist"
  | "inter-jetbrains"
  | "mona-hubot"
  | "plex"
  | "space-ibm"
  | "figtree-fira"
  | "sourceserif-source";

export interface FontPair {
  id: FontPairId;
  name: string;
  /** Shown under the name in the settings row. */
  description: string;
  /** CSS font-family stack for UI text. */
  ui: string;
  /** CSS font-family stack for paths, diffs and commit messages. */
  mono: string;
  /**
   * Google Fonts family specifiers, joined into one stylesheet request.
   * Weights are limited to what the UI actually uses.
   */
  families: string[];
  /** Preview string rendered in the settings row. */
  sample: string;
}

const SANS_FALLBACK = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
const MONO_FALLBACK = `ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

export const FONT_PAIRS: readonly FontPair[] = [
  {
    id: "geist",
    name: "Geist",
    description: "Geist + Geist Mono — Vercel's tooling typeface",
    ui: `"Geist", ${SANS_FALLBACK}`,
    mono: `"Geist Mono", ${MONO_FALLBACK}`,
    families: ["Geist:wght@400;500;600", "Geist+Mono:wght@400;500"],
    sample: "src/auth.js",
  },
  {
    id: "inter-jetbrains",
    name: "Inter",
    description: "Inter + JetBrains Mono — the editor standard",
    ui: `"Inter", ${SANS_FALLBACK}`,
    mono: `"JetBrains Mono", ${MONO_FALLBACK}`,
    families: ["Inter:wght@400;500;600", "JetBrains+Mono:wght@400;500"],
    sample: "src/auth.js",
  },
  {
    id: "mona-hubot",
    name: "Mona Sans",
    description: "Mona Sans + Hubot Sans — GitHub's own pairing",
    ui: `"Mona Sans", ${SANS_FALLBACK}`,
    mono: `"Hubot Sans", "JetBrains Mono", ${MONO_FALLBACK}`,
    families: ["Mona+Sans:wght@400;500;600", "Hubot+Sans:wght@400;500"],
    sample: "src/auth.js",
  },
  {
    id: "plex",
    name: "IBM Plex",
    description: "IBM Plex Sans + Plex Mono — one designed superfamily",
    ui: `"IBM Plex Sans", ${SANS_FALLBACK}`,
    mono: `"IBM Plex Mono", ${MONO_FALLBACK}`,
    families: ["IBM+Plex+Sans:wght@400;500;600", "IBM+Plex+Mono:wght@400;500"],
    sample: "src/auth.js",
  },
  {
    id: "space-ibm",
    name: "Space Grotesk",
    description: "Space Grotesk + Space Mono — distinctive and geometric",
    ui: `"Space Grotesk", ${SANS_FALLBACK}`,
    mono: `"Space Mono", ${MONO_FALLBACK}`,
    families: ["Space+Grotesk:wght@400;500;600", "Space+Mono:wght@400;700"],
    sample: "src/auth.js",
  },
  {
    id: "figtree-fira",
    name: "Figtree",
    description: "Figtree + Fira Code — soft UI, ligature-friendly code",
    ui: `"Figtree", ${SANS_FALLBACK}`,
    mono: `"Fira Code", ${MONO_FALLBACK}`,
    families: ["Figtree:wght@400;500;600", "Fira+Code:wght@400;500"],
    sample: "src/auth.js",
  },
  {
    id: "sourceserif-source",
    name: "Source",
    description: "Source Sans 3 + Source Code Pro — Adobe's open family",
    ui: `"Source Sans 3", ${SANS_FALLBACK}`,
    mono: `"Source Code Pro", ${MONO_FALLBACK}`,
    families: ["Source+Sans+3:wght@400;500;600", "Source+Code+Pro:wght@400;500"],
    sample: "src/auth.js",
  },
] as const;

export const DEFAULT_FONT_PAIR: FontPairId = "geist";

export function getFontPair(id: FontPairId): FontPair {
  return FONT_PAIRS.find((f) => f.id === id) ?? FONT_PAIRS[0]!;
}

/**
 * Ensure a pairing's stylesheet is in the document.
 *
 * Each pairing gets its own <link>, kept after first load so switching back is
 * instant and never re-flashes fallback text.
 */
export function loadFontPair(pair: FontPair): void {
  const id = `font-pair-${pair.id}`;
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${pair.families
    .map((f) => `family=${f}`)
    .join("&")}&display=swap`;
  document.head.appendChild(link);
}
