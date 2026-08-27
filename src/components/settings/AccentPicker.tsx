import { useId, useState } from "react";
import { CheckIcon } from "../Icons";
import {
  ACCENT_PRESETS,
  contrastRatio,
  hexToRgbTriple,
  readableInk,
  rgbTripleToHex,
} from "@/theme/color";

interface AccentPickerProps {
  /** Current custom accent, or null when the palette's own accent is in use. */
  value: string | null;
  /** The active palette's accent, shown as the "Theme default" swatch. */
  paletteAccent: string;
  onChange: (hex: string | null) => void;
}

export function AccentPicker({ value, paletteAccent, onChange }: AccentPickerProps) {
  const inputId = useId();
  const [draft, setDraft] = useState(value ?? "#5b8cff");

  const activeHex = value ?? rgbTripleToHex(paletteAccent);
  const triple = hexToRgbTriple(activeHex);

  // Warn when a chosen colour would make its own button label hard to read.
  const ratio = triple ? contrastRatio(triple, readableInk(triple)) : 21;
  const lowContrast = ratio < 4.5;

  function commit(hex: string) {
    setDraft(hex);
    onChange(hex);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-[6px]">
        {/* Returning to the palette's own accent. */}
        <SwatchButton
          hex={rgbTripleToHex(paletteAccent)}
          label="Theme default"
          selected={value === null}
          onClick={() => onChange(null)}
        />

        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />

        {ACCENT_PRESETS.map((preset) => (
          <SwatchButton
            key={preset.hex}
            hex={preset.hex}
            label={preset.name}
            selected={value?.toLowerCase() === preset.hex.toLowerCase()}
            onClick={() => commit(preset.hex)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center gap-[10px] rounded-md border border-line px-3 py-[7px] text-xs text-muted transition-colors hover:bg-surface-alt hover:text-content"
        >
          <span
            className="h-[18px] w-[18px] rounded-full border border-line"
            style={{ background: draft }}
          />
          Choose your own colour
          <input
            id={inputId}
            type="color"
            value={draft}
            onChange={(e) => commit(e.target.value)}
            className="sr-only"
          />
        </label>

        <input
          type="text"
          value={draft}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            if (hexToRgbTriple(next)) onChange(next);
          }}
          spellCheck={false}
          aria-label="Accent colour hex value"
          className="w-[104px] rounded-md border border-line bg-surface px-[10px] py-[7px] font-mono text-xs uppercase text-content outline-none transition-colors focus:border-accent"
        />

        <PreviewButton />
      </div>

      {lowContrast && (
        <p className="text-xs text-modified">
          This colour is hard to read against button text. Try a deeper or lighter shade.
        </p>
      )}
    </div>
  );
}

/** Renders in the live accent so the user sees the real result. */
function PreviewButton() {
  return (
    <span className="inline-flex select-none items-center rounded-md bg-accent px-[14px] py-[7px] text-xs font-semibold text-accent-ink">
      Commit &amp; Push
    </span>
  );
}

function SwatchButton({
  hex,
  label,
  selected,
  onClick,
}: {
  hex: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const triple = hexToRgbTriple(hex);
  const ink = triple ? readableInk(triple) : "255 255 255";

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className={`grid h-[26px] w-[26px] place-items-center rounded-full border transition-transform hover:scale-110 ${
        selected ? "border-content" : "border-line"
      }`}
      style={{ background: hex }}
    >
      {selected && (
        <CheckIcon className="h-3 w-3" style={{ color: `rgb(${ink})` }} />
      )}
    </button>
  );
}
