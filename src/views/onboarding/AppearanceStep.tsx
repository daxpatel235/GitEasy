import { CheckIcon, MoonIcon, SunIcon } from "@/components/Icons";
import { useTheme } from "@/theme/ThemeProvider";
import { PALETTES, type Mode, type Palette } from "@/theme/palettes";
import { FONT_PAIRS } from "@/theme/fonts";
import { Stagger } from "./OnboardingShell";

/**
 * Low-stakes and immediate: every choice applies to the surrounding screen as
 * it is made, so the user learns the app responds to them before they have
 * committed to anything.
 */
export function AppearanceStep({ onNext }: { onNext: () => void }) {
  const { mode, palette, fontPair, setMode, setPalette, setFontPair } = useTheme();

  // Onboarding shows a curated six; the full set lives in Settings.
  const featured = PALETTES.slice(0, 6);
  const fonts = FONT_PAIRS.slice(0, 4);

  return (
    <div className="flex flex-col">
      <Stagger>
        <h1 className="display text-[30px] font-semibold leading-tight">
          Make it yours
        </h1>
        <p className="mt-3 text-[16px] text-muted">
          Pick a look. You can change all of this later in Settings.
        </p>
      </Stagger>

      <Stagger delay={120} className="mt-8">
        <SectionLabel>Light or dark</SectionLabel>
        <div className="mt-3 inline-flex gap-1 rounded-xl border border-line bg-surface/70 p-1 backdrop-blur-xl">
          {(["light", "dark"] as Mode[]).map((m) => {
            const active = mode === m;
            const Icon = m === "light" ? SunIcon : MoonIcon;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-lg px-5 py-[9px] text-[14.5px] font-medium capitalize transition-colors ${
                  active ? "bg-accent text-accent-ink" : "text-muted hover:text-content"
                }`}
              >
                <Icon className="h-4 w-4" />
                {m}
              </button>
            );
          })}
        </div>
      </Stagger>

      <Stagger delay={200} className="mt-7">
        <SectionLabel>Colour</SectionLabel>
        <div className="mt-3 grid grid-cols-3 gap-[10px] sm:grid-cols-6">
          {featured.map((p) => (
            <ThemeSwatch
              key={p.id}
              palette={p}
              mode={mode}
              selected={palette === p.id}
              onSelect={() => setPalette(p.id)}
            />
          ))}
        </div>
      </Stagger>

      <Stagger delay={280} className="mt-7">
        <SectionLabel>Text style</SectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-[10px] sm:grid-cols-4">
          {fonts.map((f) => {
            const active = fontPair === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFontPair(f.id)}
                aria-pressed={active}
                className={`rounded-card border px-3 py-[10px] text-center transition-colors ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-line bg-surface/60 hover:border-line hover:bg-surface"
                }`}
              >
                <div className="text-[19px] font-semibold" style={{ fontFamily: f.ui }}>
                  Aa
                </div>
                <div className="mt-[2px] truncate text-[12.5px] text-muted">{f.name}</div>
              </button>
            );
          })}
        </div>
      </Stagger>

      <Stagger delay={380} className="mt-9">
        <button
          type="button"
          onClick={onNext}
          className="w-full rounded-lg bg-accent px-6 py-[13px] text-[16px] font-semibold text-accent-ink shadow-lg transition-all hover:bg-accent-hover hover:shadow-xl"
        >
          Looks good
        </button>
      </Stagger>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-faint">
      {children}
    </span>
  );
}

function ThemeSwatch({
  palette,
  mode,
  selected,
  onSelect,
}: {
  palette: Palette;
  mode: Mode;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = palette[mode];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={palette.name}
      className={`group relative overflow-hidden rounded-card border transition-all ${
        selected ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-faint"
      }`}
    >
      {/* Miniature of the app in this theme: ground, surface bar, accent dot. */}
      <span className="block h-[52px] w-full" style={{ background: `rgb(${t.ground})` }}>
        <span
          className="mt-[10px] ml-[10px] flex h-[14px] w-[62%] items-center rounded-[3px] px-[4px]"
          style={{ background: `rgb(${t.surface})` }}
        >
          <span
            className="h-[5px] w-[5px] rounded-full"
            style={{ background: `rgb(${t["text-faint"]})` }}
          />
        </span>
        <span
          className="mt-[7px] ml-[10px] block h-[10px] w-[38%] rounded-[3px]"
          style={{ background: `rgb(${t.accent})` }}
        />
      </span>

      <span
        className="block border-t px-2 py-[6px] text-[12px] font-medium"
        style={{
          background: `rgb(${t.surface})`,
          borderColor: `rgb(${t.border})`,
          color: `rgb(${t.text})`,
        }}
      >
        {palette.name}
      </span>

      {selected && (
        <span className="absolute right-[6px] top-[6px] grid h-[18px] w-[18px] place-items-center rounded-full bg-accent text-accent-ink">
          <CheckIcon className="h-[11px] w-[11px]" />
        </span>
      )}
    </button>
  );
}
