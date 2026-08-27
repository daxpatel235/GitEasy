import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warn"
  | "danger"
  | "info"
  | "purple";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line-soft bg-surface-alt text-muted",
  accent: "border-accent/35 bg-accent/12 text-accent",
  success: "border-added/35 bg-added/12 text-added",
  warn: "border-modified/40 bg-modified/12 text-modified",
  danger: "border-deleted/40 bg-deleted/12 text-deleted",
  info: "border-line-soft bg-surface-alt text-content",
  purple: "border-accent/25 bg-accent/8 text-muted",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex flex-none items-center gap-[5px] rounded-full border px-[9px] py-[2px] text-2xs font-medium ${TONES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * A GitHub label, drawn in the colour the API gave us.
 *
 * Inline styles are unavoidable here — the colour is data, not theme, so it
 * cannot come from a token. The text colour is chosen by luminance so labels
 * stay readable in both light and dark mode.
 */
export function LabelChip({ name, color }: { name: string; color: string }) {
  const rgb = hexToRgb(color);
  const luminance = rgb ? (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 : 0.5;

  return (
    <span
      className="inline-flex flex-none items-center rounded-full px-[9px] py-[2px] text-2xs font-medium"
      style={{
        backgroundColor: `#${color}`,
        color: luminance > 0.6 ? "#1c1c22" : "#ffffff",
      }}
    >
      {name}
    </span>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
