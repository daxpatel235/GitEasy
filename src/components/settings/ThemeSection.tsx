import { useState } from "react";
import { SettingsRow } from "./SettingsRow";
import { AccentPicker } from "./AccentPicker";
import { CheckIcon, ChevronDownIcon, MoonIcon, SunIcon } from "../Icons";
import { useTheme } from "@/theme/ThemeProvider";
import { PALETTES, type Mode, type Palette } from "@/theme/palettes";
import { FONT_PAIRS, type FontPair } from "@/theme/fonts";

export function ThemeSection() {
  const {
    mode,
    palette,
    fontPair,
    customAccent,
    setMode,
    setPalette,
    setFontPair,
    setCustomAccent,
    resetTheme,
  } = useTheme();

  const [showAllThemes, setShowAllThemes] = useState(false);
  const [showAllFonts, setShowAllFonts] = useState(false);

  const primaryThemes = PALETTES.filter((p) => !p.extended);
  const extendedThemes = PALETTES.filter((p) => p.extended);
  const primaryFonts = FONT_PAIRS.slice(0, 3);
  const extendedFonts = FONT_PAIRS.slice(3);

  const customised = customAccent !== null || palette !== "slate" || fontPair !== "geist";

  return (
    <div className="flex flex-col gap-8">
      <Group label="Appearance">
        <ModeToggle mode={mode} onChange={setMode} />
      </Group>

      <Group
        label="Theme"
        hint="Each theme sets the background, text and highlight colours together."
      >
        <div className="flex flex-col gap-[6px]">
          {primaryThemes.map((p) => (
            <ThemeRow
              key={p.id}
              palette={p}
              mode={mode}
              selected={palette === p.id}
              onSelect={() => setPalette(p.id)}
            />
          ))}

          {/* Sits between the first four and the rest. */}
          <ExpandToggle
            expanded={showAllThemes}
            onToggle={() => setShowAllThemes((v) => !v)}
            count={extendedThemes.length}
            noun="themes"
          />

          {showAllThemes &&
            extendedThemes.map((p) => (
              <div key={p.id} className="animate-fade-in">
                <ThemeRow
                  palette={p}
                  mode={mode}
                  selected={palette === p.id}
                  onSelect={() => setPalette(p.id)}
                />
              </div>
            ))}
        </div>
      </Group>

      <Group
        label="Accent colour"
        hint="Used for the main button and highlights. Pick any colour you like."
      >
        <AccentPicker
          value={customAccent}
          paletteAccent={PALETTES.find((p) => p.id === palette)?.[mode].accent ?? ""}
          onChange={setCustomAccent}
        />
      </Group>

      <Group label="Font" hint="Changes the text and code style across the whole app.">
        <div className="flex flex-col gap-[6px]">
          {primaryFonts.map((f) => (
            <FontRow
              key={f.id}
              font={f}
              selected={fontPair === f.id}
              onSelect={() => setFontPair(f.id)}
            />
          ))}

          <ExpandToggle
            expanded={showAllFonts}
            onToggle={() => setShowAllFonts((v) => !v)}
            count={extendedFonts.length}
            noun="fonts"
          />

          {showAllFonts &&
            extendedFonts.map((f) => (
              <div key={f.id} className="animate-fade-in">
                <FontRow
                  font={f}
                  selected={fontPair === f.id}
                  onSelect={() => setFontPair(f.id)}
                />
              </div>
            ))}
        </div>
      </Group>

      {customised && (
        <button
          type="button"
          onClick={resetTheme}
          className="self-start rounded-md border border-line px-3 py-[6px] text-xs text-muted transition-colors hover:bg-surface-alt hover:text-content"
        >
          Reset to defaults
        </button>
      )}
    </div>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-faint">
          {label}
        </h2>
        {hint && <p className="max-w-[56ch] text-[14px] text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ExpandToggle({
  expanded,
  onToggle,
  count,
  noun,
}: {
  expanded: boolean;
  onToggle: () => void;
  count: number;
  noun: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="my-1 flex items-center gap-2 self-center rounded-md px-3 py-[6px] text-xs font-medium text-muted transition-colors hover:bg-surface-alt hover:text-content"
    >
      {expanded ? "Fewer options" : `More options — ${count} more ${noun}`}
      <ChevronDownIcon
        className={`h-3 w-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
      />
    </button>
  );
}

function ThemeRow({
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
  return (
    <SettingsRow
      leading={<ThemeCircle palette={palette} mode={mode} />}
      title={palette.name}
      subtitle={palette.description}
      selected={selected}
      onClick={onSelect}
      interactive={false}
      trailing={selected ? <ActiveBadge /> : undefined}
    />
  );
}

function FontRow({
  font,
  selected,
  onSelect,
}: {
  font: FontPair;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <SettingsRow
      leading={
        <span
          className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-line-soft bg-surface-alt text-[15px] font-semibold text-muted"
          style={{ fontFamily: font.ui }}
        >
          Aa
        </span>
      }
      title={font.name}
      subtitle={font.description}
      selected={selected}
      onClick={onSelect}
      interactive={false}
      trailing={
        selected ? (
          <ActiveBadge />
        ) : (
          <span
            className="hidden flex-none text-xs text-faint sm:inline"
            style={{ fontFamily: font.mono }}
          >
            {font.sample}
          </span>
        )
      }
    />
  );
}

function ActiveBadge() {
  return (
    <span className="inline-flex flex-none items-center gap-[5px] rounded-full bg-accent/10 px-[9px] py-[3px] text-2xs font-medium text-accent">
      <CheckIcon className="h-[11px] w-[11px]" />
      Active
    </span>
  );
}

/**
 * The colour circle on the left of each theme row.
 *
 * Split diagonally: the theme's surface on one half, its accent on the other,
 * so the row previews both the ground and the highlight of that theme.
 */
function ThemeCircle({ palette, mode }: { palette: Palette; mode: Mode }) {
  const tokens = palette[mode];
  return (
    <span
      className="block h-[30px] w-[30px] rounded-full border border-line"
      style={{
        background: `linear-gradient(135deg, rgb(${tokens.surface}) 0% 50%, rgb(${tokens.accent}) 50% 100%)`,
      }}
    />
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const options: { id: Mode; label: string; Icon: typeof SunIcon }[] = [
    { id: "light", label: "Light", Icon: SunIcon },
    { id: "dark", label: "Dark", Icon: MoonIcon },
  ];

  return (
    <div className="inline-flex w-fit gap-[3px] rounded-lg border border-line-soft bg-surface-alt p-[3px]">
      {options.map(({ id, label, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={`inline-flex items-center gap-[6px] rounded-[5px] px-[14px] py-[6px] text-xs font-medium transition-colors ${
              active ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content"
            }`}
          >
            <Icon className="h-[13px] w-[13px]" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
