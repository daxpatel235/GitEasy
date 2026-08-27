import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_PALETTE,
  getPalette,
  type Mode,
  type PaletteId,
  type ThemeTokens,
} from "./palettes";
import {
  DEFAULT_FONT_PAIR,
  getFontPair,
  loadFontPair,
  type FontPairId,
} from "./fonts";
import { hexToRgbTriple, readableInk, shiftLightness } from "./color";

const STORAGE_KEY = "giteasy.theme";

export interface ThemeState {
  mode: Mode;
  palette: PaletteId;
  fontPair: FontPairId;
  /**
   * User-chosen accent as a hex string, or null to use the palette's own.
   * Overrides only the accent tokens — the rest of the palette is untouched.
   */
  customAccent: string | null;
}

interface ThemeContextValue extends ThemeState {
  setMode: (mode: Mode) => void;
  setPalette: (palette: PaletteId) => void;
  setFontPair: (font: FontPairId) => void;
  setCustomAccent: (hex: string | null) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemMode(): Mode {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function defaults(): ThemeState {
  return {
    mode: systemMode(),
    palette: DEFAULT_PALETTE,
    fontPair: DEFAULT_FONT_PAIR,
    customAccent: null,
  };
}

function readStored(): ThemeState {
  const base = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<ThemeState>;
    return {
      mode: parsed.mode === "light" || parsed.mode === "dark" ? parsed.mode : base.mode,
      palette: parsed.palette ?? base.palette,
      fontPair: parsed.fontPair ?? base.fontPair,
      customAccent: typeof parsed.customAccent === "string" ? parsed.customAccent : null,
    };
  } catch {
    // Corrupt or unavailable storage falls back to system defaults.
    return base;
  }
}

/** Write a token set onto <html> as CSS variables. */
function applyTokens(tokens: ThemeTokens) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(`--${key}`, value);
  }
}

/**
 * Fold a custom accent into a palette's tokens.
 *
 * Only the three accent tokens change. The hover shade and the ink colour that
 * sits on top are derived, so any colour the user picks stays readable.
 */
function withCustomAccent(tokens: ThemeTokens, hex: string, mode: Mode): ThemeTokens {
  const triple = hexToRgbTriple(hex);
  if (!triple) return tokens;

  return {
    ...tokens,
    accent: triple,
    "accent-hover": shiftLightness(triple, mode === "dark" ? 10 : -10),
    "accent-text": readableInk(triple),
    "glow-a": triple,
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ThemeState>(readStored);
  const { mode, palette, fontPair, customAccent } = state;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-mode", mode);
    root.setAttribute("data-palette", palette);
    root.style.colorScheme = mode;

    const base = getPalette(palette)[mode];
    applyTokens(customAccent ? withCustomAccent(base, customAccent, mode) : base);

    const pair = getFontPair(fontPair);
    loadFontPair(pair);
    root.style.setProperty("--font-ui", pair.ui);
    root.style.setProperty("--font-mono", pair.mono);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Persistence is a convenience — never block rendering on it.
    }
  }, [state, mode, palette, fontPair, customAccent]);

  const setMode = useCallback((next: Mode) => {
    setState((prev) => ({ ...prev, mode: next }));
  }, []);

  const setPalette = useCallback((next: PaletteId) => {
    setState((prev) => ({ ...prev, palette: next }));
  }, []);

  const setFontPair = useCallback((next: FontPairId) => {
    setState((prev) => ({ ...prev, fontPair: next }));
  }, []);

  const setCustomAccent = useCallback((hex: string | null) => {
    setState((prev) => ({ ...prev, customAccent: hex }));
  }, []);

  const resetTheme = useCallback(() => {
    setState((prev) => ({ ...defaults(), mode: prev.mode }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      setMode,
      setPalette,
      setFontPair,
      setCustomAccent,
      resetTheme,
    }),
    [state, setMode, setPalette, setFontPair, setCustomAccent, resetTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
